import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { videoSchema } from '@codex-ux/video-domain';
import type { WorkspaceStore } from './storage/workspaces.ts';
import type { Collaboration } from './collaboration.ts';
import type { RenderJobs } from './video/jobs.ts';
import { readBody, readJson, json } from './http.ts';
import { saveAsset } from './video/assets.ts';
import type { NativeProjects } from './native/projects.ts';
import { HttpError } from './errors.ts';

const change = z.object({
  requestId: z.string().uuid(),
  baseRevision: z.string().uuid(),
  label: z.string().min(1).max(160),
});
const anchor = z
  .object({
    revisionId: z.string().uuid(),
    start: z.number().min(0).max(3600),
    end: z.number().min(0).max(3600),
    objectId: z.string().max(1000).optional(),
    region: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      })
      .optional(),
  })
  .refine((a) => a.end >= a.start, 'Invalid time range.');
export interface Services {
  store: WorkspaceStore;
  collaboration: Collaboration;
  jobs: RenderJobs;
  root: string;
  native: NativeProjects;
}

export async function api(req: IncomingMessage, res: ServerResponse, path: string, s: Services) {
  const method = req.method ?? 'GET';
  if (path === '/api/workspaces') {
    if (method === 'GET') {
      json(res, s.store.list());
      return;
    }
    if (method === 'POST') {
      const { name, native } = z
        .object({ name: z.string().trim().min(1).max(100), native: z.boolean().default(true) })
        .parse(await readJson(req));
      const workspace = s.store.create(name);
      json(res, native ? await s.native.enable(workspace.id) : workspace, 201);
      return;
    }
  }
  const match = /^\/api\/workspaces\/([a-zA-Z0-9-]+)(.*)$/.exec(path);
  if (!match) throw new HttpError(404, 'Endpoint not found.');
  const id = match[1]!;
  const rest = match[2]!;
  s.store.row(id);
  if ((rest === '' || rest === '/context') && method === 'GET') {
    await s.native.sync(id);
    const workspace = s.store.get(id);
    json(res, {
      ...workspace,
      source: workspace.revision.document.native ? s.native.status(id) : undefined,
    });
    return;
  }
  if (rest === '/source' && method === 'POST') {
    const { directory } = z
      .object({ directory: z.string().min(1).optional() })
      .parse(await readJson(req));
    json(res, await s.native.enable(id, directory));
    return;
  }
  if (rest === '/source' && method === 'GET') {
    json(res, s.native.status(id));
    return;
  }
  if (rest === '/revisions' && method === 'POST') {
    const body = change.extend({ document: videoSchema }).parse(await readJson(req));
    json(res, await s.native.commit(id, body, body.document));
    return;
  }
  if (rest.startsWith('/revisions/') && method === 'GET') {
    json(res, s.store.revision(id, rest.slice(11)));
    return;
  }
  if ((rest === '/undo' || rest === '/redo') && method === 'POST') {
    const body = z.object({ baseRevision: z.string().uuid() }).parse(await readJson(req));
    json(res, await s.native.travel(id, body.baseRevision, rest === '/undo' ? 'undo' : 'redo'));
    return;
  }
  if (rest === '/binding' && method === 'POST') {
    const { threadId } = z
      .object({
        threadId: z
          .string()
          .regex(/^[a-zA-Z0-9-]{10,100}$/)
          .nullable(),
      })
      .parse(await readJson(req));
    s.store.db.prepare('UPDATE workspaces SET thread_id=? WHERE id=?').run(threadId, id);
    json(res, s.store.get(id));
    return;
  }
  if (rest === '/notes' && method === 'POST') {
    const body = z
      .object({ text: z.string().trim().min(1).max(4000), anchor })
      .parse(await readJson(req));
    s.store.revision(id, body.anchor.revisionId);
    s.store.db
      .prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)')
      .run(
        randomUUID(),
        id,
        body.text,
        JSON.stringify(body.anchor),
        new Date().toISOString(),
        null,
      );
    json(res, s.store.get(id));
    return;
  }
  if (rest.startsWith('/notes/') && method === 'DELETE') {
    s.store.db
      .prepare('DELETE FROM notes WHERE id=? AND workspace_id=? AND request_id IS NULL')
      .run(rest.slice(7), id);
    json(res, s.store.get(id));
    return;
  }
  if (rest === '/assets' && method === 'POST') {
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'Untitled asset'));
    const mime = String(req.headers['content-type'] ?? '').split(';')[0]!;
    json(res, await saveAsset(s.root, id, name, mime, await readBody(req, 100 * 1024 * 1024)), 201);
    return;
  }
  if (rest === '/requests' && method === 'POST') {
    const { noteIds } = z
      .object({ noteIds: z.array(z.string().uuid()).min(1).max(100) })
      .parse(await readJson(req));
    json(res, await s.collaboration.submit(id, noteIds));
    return;
  }
  const request = /^\/requests\/([a-zA-Z0-9-]+)(\/publish|\/error)?$/.exec(rest);
  if (request) {
    const requestId = request[1]!;
    if (!request[2] && method === 'GET') {
      json(res, s.collaboration.context(id, requestId));
      return;
    }
    if (request[2] === '/publish' && method === 'POST') {
      const { label } = z.object({ label: z.string().min(1).max(160) }).parse(await readJson(req));
      json(res, await s.collaboration.publish(id, requestId, label));
      return;
    }
    if (request[2] === '/error' && method === 'POST') {
      const { message } = z
        .object({ message: z.string().min(1).max(2000) })
        .parse(await readJson(req));
      s.collaboration.request(id, requestId);
      s.store.db
        .prepare("UPDATE requests SET state='failed',error=? WHERE id=? AND workspace_id=?")
        .run(message, requestId, id);
      json(res, { saved: true });
      return;
    }
  }
  if (rest === '/exports' && method === 'POST') {
    const { revisionId } = z.object({ revisionId: z.string().uuid() }).parse(await readJson(req));
    json(res, await s.jobs.start(id, s.store.revision(id, revisionId)));
    return;
  }
  if (rest.startsWith('/exports/') && method === 'GET') {
    const jobId = z.string().uuid().parse(rest.slice(9));
    json(res, await s.jobs.read(id, jobId));
    return;
  }
  throw new HttpError(404, 'Endpoint not found.');
}
