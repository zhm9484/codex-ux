import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { videoSchema } from '@codex-ux/video-domain';
import type { VideoStore } from './store.ts';
import type { VideoCollaboration } from './collaboration.ts';
import { collaborationTarget } from '../agents.ts';
import type { RenderJobs } from './jobs.ts';
import { readBody, readJson, json } from '../http.ts';
import { saveAsset } from './assets.ts';
import type { NativeProjects } from '../native/projects.ts';
import { HttpError } from '../errors.ts';

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
export interface VideoServices {
  store: VideoStore;
  collaboration: VideoCollaboration;
  jobs: RenderJobs;
  root: string;
  native: NativeProjects;
}

export async function videoApi(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  rest: string,
  s: VideoServices,
) {
  const method = req.method ?? 'GET';
  if (rest === '' && method === 'POST') {
    const { format } = z
      .strictObject({ format: z.enum(['native', 'structured']).default('native') })
      .parse(await readJson(req));
    json(res, await s.native.open(id, format));
    return;
  }
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
    const { directory, baseRevision } = z
      .strictObject({ directory: z.string().min(1).optional(), baseRevision: z.string().uuid() })
      .parse(await readJson(req));
    json(res, await s.native.importSource(id, baseRevision, directory));
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
  if (rest === '/notes' && method === 'POST') {
    const body = z
      .object({ text: z.string().trim().min(1).max(4000), anchor })
      .parse(await readJson(req));
    s.store.revision(id, body.anchor.revisionId);
    s.store
      .database(id)
      .prepare('INSERT INTO notes VALUES(?,?,?,?,?)')
      .run(randomUUID(), body.text, JSON.stringify(body.anchor), new Date().toISOString(), null);
    json(res, s.store.get(id));
    return;
  }
  if (rest.startsWith('/notes/') && method === 'DELETE') {
    s.store
      .database(id)
      .prepare('DELETE FROM notes WHERE id=? AND request_id IS NULL')
      .run(rest.slice(7));
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
    const { noteIds, target } = z
      .strictObject({
        noteIds: z.array(z.string().uuid()).min(1).max(100),
        target: collaborationTarget,
      })
      .parse(await readJson(req));
    json(res, await s.collaboration.submit(id, noteIds, target));
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
      s.store
        .database(id)
        .prepare("UPDATE requests SET state='failed',error=? WHERE id=?")
        .run(message, requestId);
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
