import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, writeFile, copyFile, rm, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  feedbackSchema,
  identityPlacement,
  isModel,
  operationSchema,
  sourcePath,
  vec3,
} from '@codex-ux/scene-domain';
import type { SceneProjects } from './projects.ts';
import type { SceneCollaboration } from './collaboration.ts';
import { json, readBody, readJson } from '../http.ts';
import { HttpError } from '../errors.ts';
import { collaborationTarget } from '../agents.ts';
import { capture, materialize, safeFile, scan } from './files.ts';
import { contained } from '../storage/paths.ts';

export interface SceneServices {
  projects: SceneProjects;
  collaboration: SceneCollaboration;
}
const change = z.strictObject({
  baseRevision: z.string().uuid(),
  requestId: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
});
export async function sceneApi(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  path: string,
  s: SceneServices,
) {
  const { projects } = s;
  if ((path === '' && req.method === 'POST') || (path === '/context' && req.method === 'GET')) {
    json(res, await projects.get(id));
    return;
  }
  if (path === '/operations' && req.method === 'POST') {
    const body = change.extend({ operation: operationSchema }).parse(await readJson(req));
    json(
      res,
      await projects.operate(id, body.baseRevision, body.requestId, body.label, body.operation),
    );
    return;
  }
  if ((path === '/undo' || path === '/redo') && req.method === 'POST') {
    const body = change.omit({ label: true }).parse(await readJson(req));
    json(
      res,
      await projects.travel(
        id,
        body.baseRevision,
        body.requestId,
        path === '/undo' ? 'undo' : 'redo',
      ),
    );
    return;
  }
  if (path === '/restore' && req.method === 'POST') {
    const body = change
      .omit({ label: true })
      .extend({ revisionId: z.string().uuid() })
      .parse(await readJson(req));
    json(res, await projects.restore(id, body.baseRevision, body.requestId, body.revisionId));
    return;
  }
  if (path === '/requests' && req.method === 'GET') {
    json(res, s.collaboration.list(id));
    return;
  }
  if (path === '/requests' && req.method === 'POST') {
    const body = change
      .omit({ label: true })
      .extend({
        target: collaborationTarget,
        feedback: feedbackSchema,
        screenshot: z
          .string()
          .max(2 * 1024 ** 2)
          .regex(/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/)
          .optional(),
      })
      .parse(await readJson(req));
    json(
      res,
      await s.collaboration.submit(
        id,
        body.baseRevision,
        body.requestId,
        body.target,
        body.feedback,
        body.screenshot,
      ),
    );
    return;
  }
  const request = /^\/requests\/([a-f0-9-]{36})(\/preview|\/publish|\/error)?$/.exec(path);
  if (request) {
    const requestId = z.string().uuid().parse(request[1]);
    if (!request[2] && req.method === 'GET') {
      json(res, s.collaboration.context(id, requestId));
      return;
    }
    if (request[2] === '/preview' && req.method === 'GET') {
      json(res, await s.collaboration.preview(id, requestId));
      return;
    }
    if (request[2] === '/publish' && req.method === 'POST') {
      const body = z
        .strictObject({ label: z.string().trim().min(1).max(160) })
        .parse(await readJson(req));
      json(res, await s.collaboration.publish(id, requestId, body.label));
      return;
    }
    if (request[2] === '/error' && req.method === 'POST') {
      const body = z
        .strictObject({ message: z.string().min(1).max(4000) })
        .parse(await readJson(req));
      s.collaboration.row(id, requestId);
      projects.store
        .database(id)
        .prepare("UPDATE requests SET state='failed',error=? WHERE id=? AND state!='published'")
        .run(body.message, requestId);
      json(res, s.collaboration.context(id, requestId));
      return;
    }
  }
  const upload = /^\/imports\/([a-f0-9-]{36})(\/files|\/finish)$/.exec(path);
  if (upload && req.method === 'POST') {
    const importId = z.string().uuid().parse(upload[1]);
    const directory = join(projects.store.directory(id), 'imports', importId);
    if (upload[2] === '/files') {
      const file = sourcePath.parse(new URL(req.url!, 'http://localhost').searchParams.get('path'));
      if (
        file.split('/').some((part) => ['node_modules', 'dist', 'build', 'coverage'].includes(part))
      )
        throw new HttpError(400, 'Import model files and their resources only.');
      const bytes = await readBody(req, 100 * 1024 ** 2);
      await projects.exclusive(id, async () => {
        await mkdir(directory, { recursive: true });
        const inventory = await scan(directory);
        if (inventory.files.some((entry) => entry.path.toLowerCase() === file.toLowerCase()))
          throw new HttpError(
            409,
            'Two imported files have the same path. Import their containing folder instead.',
          );
        if (
          inventory.files.length >= 1000 ||
          inventory.files.reduce((sum, f) => sum + f.size, 0) + bytes.length > 512 * 1024 ** 2
        )
          throw new HttpError(413, 'This import exceeds 1,000 files or 512 MB.');
        const target = contained(directory, file);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: 'wx' });
      });
      json(res, { path: file });
      return;
    }
    const body = change
      .omit({ label: true })
      .extend({ position: vec3 })
      .parse(await readJson(req));
    const result = await projects.exclusive(id, async () => {
      if (projects.store.committed(id, body.requestId)) return projects.context(id);
      const signature = await projects.assertCurrent(id, body.baseRevision);
      const files = await scan(directory);
      const models = files.files.filter((file) => isModel(file.path));
      if (!models.length)
        throw new HttpError(
          415,
          'Choose a GLB, glTF, FBX, OBJ, STL, PLY, 3MF or USD model, with its textures.',
        );
      const previous = projects.store.revision(id, body.baseRevision).snapshot;
      const stage = join(projects.store.directory(id), 'staging', importId);
      await materialize(previous, projects.blobs(id), stage);
      try {
        const document = structuredClone(previous.document);
        for (const file of files.files) {
          const target = contained(stage, 'assets', importId, file.path);
          await mkdir(dirname(target), { recursive: true });
          await copyFile(await safeFile(directory, file.path), target);
        }
        models.forEach((model, index) => {
          const objectId = randomUUID();
          document.objects.push({
            id: objectId,
            label: model.path.split('/').pop()!.slice(0, 100),
            kind: 'model',
            path: `assets/${importId}/${model.path}`,
            normalize: true,
          });
          const placement = identityPlacement();
          placement.position = [body.position[0] + index * 2.5, body.position[1], body.position[2]];
          document.placements[objectId] = placement;
        });
        await writeFile(join(stage, 'scene.json'), JSON.stringify(document, null, 2) + '\n');
        const snapshot = await capture(stage, projects.blobs(id));
        await projects.accept(
          id,
          snapshot,
          body.baseRevision,
          signature,
          `Imported ${models.length === 1 ? models[0]!.path.split('/').pop()! : `${models.length} models`}`,
          'user',
          body.requestId,
        );
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
      await rm(directory, { recursive: true, force: true });
      return projects.context(id);
    });
    json(res, result);
    return;
  }
  // Source manifests remain available through context; raw project bytes use immutable media URLs.
  if (path === '/files' && req.method === 'GET') {
    json(res, await readdir(projects.sourceDirectory(id)));
    return;
  }
  throw new HttpError(404, 'Scene endpoint not found.');
}
