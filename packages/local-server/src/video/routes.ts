import type { LibraryStore } from '../storage/library.ts';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { videoSchema, intentSchema } from '@codex-ux/video-domain';
import type { VideoStore } from './store.ts';
import type { VideoCollaboration } from './collaboration.ts';
import { collaborationTarget } from '../agents.ts';
import type { RenderJobs } from './jobs.ts';
import { readBody, readJson, json } from '../http.ts';
import { saveAsset } from './assets.ts';
import type { VideoProjects } from '../sources/projects.ts';
import { HttpError } from '../errors.ts';
import { join } from 'node:path';
import { videoDirectory } from './paths.ts';

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
  library: LibraryStore;
  store: VideoStore;
  collaboration: VideoCollaboration;
  jobs: RenderJobs;
  root: string;
  projects: VideoProjects;
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
    z.strictObject({}).parse(await readJson(req));
    json(res, await s.projects.open(id));
    return;
  }
  s.store.row(id);
  if ((rest === '' || rest === '/context') && method === 'GET') {
    await s.projects.sync(id);
    const workspace = s.store.get(id);
    json(res, {
      ...workspace,
      source: s.projects.status(id),
    });
    return;
  }
  if (rest === '/source' && method === 'POST') {
    const { path, baseRevision } = z
      .strictObject({ path: z.string().min(1), baseRevision: z.string().uuid() })
      .parse(await readJson(req));
    json(res, await s.projects.importSource(id, baseRevision, path));
    return;
  }
  if (rest === '/source/media' && method === 'POST') {
    const baseRevision = z.string().uuid().parse(req.headers['x-base-revision']);
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'video.mp4'));
    const mime = String(req.headers['content-type'] ?? '').split(';')[0]!;
    if (!['video/mp4', 'video/webm'].includes(mime)) throw new HttpError(415, 'Use MP4 or WebM.');
    const asset = await saveAsset(s.root, id, name, mime, await readBody(req, 100 * 1024 * 1024));
    json(
      res,
      await s.projects.importSource(
        id,
        baseRevision,
        join(videoDirectory(s.root, id), 'assets', asset.file),
        asset,
      ),
    );
    return;
  }
  if (rest === '/source' && method === 'GET') {
    json(res, s.projects.status(id));
    return;
  }
  if (rest === '/revisions' && method === 'POST') {
    const body = change.extend({ document: videoSchema }).parse(await readJson(req));
    json(res, await s.projects.commit(id, body, body.document));
    return;
  }
  if (rest.startsWith('/revisions/') && method === 'GET') {
    json(res, s.store.revision(id, rest.slice(11)));
    return;
  }
  if ((rest === '/undo' || rest === '/redo') && method === 'POST') {
    const body = z.object({ baseRevision: z.string().uuid() }).parse(await readJson(req));
    json(res, await s.projects.travel(id, body.baseRevision, rest === '/undo' ? 'undo' : 'redo'));
    return;
  }
  if (rest === '/notes' && method === 'POST') {
    const body = z
      .strictObject({
        id: z.string().uuid().optional(),
        attachmentIds: z.array(z.string().uuid()).max(20).default([]),
        text: z.string().trim().min(1).max(4000),
        anchor,
        intent: intentSchema,
      })
      .parse(await readJson(req));
    const attachments = await s.library.validate(id, body.attachmentIds);
    const existing = body.id && s.store.get(id).notes.find((note) => note.id === body.id);
    if (existing) {
      if (
        JSON.stringify((existing.attachments ?? []).map((ref) => ref.id)) !==
          JSON.stringify(body.attachmentIds) ||
        existing.text !== body.text ||
        JSON.stringify(existing.anchor) !== JSON.stringify(body.anchor) ||
        JSON.stringify(existing.intent) !== JSON.stringify(body.intent)
      )
        throw new HttpError(409, 'This note ID already belongs to another draft.');
      json(res, s.store.get(id));
      return;
    }
    const revision = s.store.revision(id, body.anchor.revisionId);
    if (body.anchor.end > revision.document.duration)
      throw new HttpError(400, 'The note is outside its video revision.');
    const noteId = body.id ?? randomUUID();
    s.store
      .database(id)
      .prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)')
      .run(
        noteId,
        body.text,
        JSON.stringify(body.anchor),
        JSON.stringify(body.intent),
        new Date().toISOString(),
        null,
      );
    s.store
      .database(id)
      .prepare('INSERT INTO note_attachments VALUES(?,?)')
      .run(noteId, JSON.stringify(attachments));
    json(res, s.store.get(id));
    return;
  }
  if (rest.startsWith('/notes/') && method === 'PATCH') {
    const { text, previousText, attachmentIds, previousAttachmentIds } = z
      .strictObject({
        text: z.string().trim().min(1).max(4000),
        previousText: z.string(),
        attachmentIds: z.array(z.string().uuid()).max(20).optional(),
        previousAttachmentIds: z.array(z.string().uuid()).max(20).optional(),
      })
      .parse(await readJson(req));
    if (attachmentIds && !previousAttachmentIds)
      throw new HttpError(400, 'Previous attachments are required.');
    const refs = attachmentIds ? await s.library.validate(id, attachmentIds) : undefined;
    const db = s.store.database(id);
    const current = s.store.get(id).notes.find((note) => note.id === rest.slice(7));
    if (
      !current ||
      current.requestId ||
      current.text !== previousText ||
      (previousAttachmentIds &&
        JSON.stringify((current.attachments ?? []).map((ref) => ref.id)) !==
          JSON.stringify(previousAttachmentIds))
    )
      throw new HttpError(409, 'This note was changed, sent or removed. Refresh before editing.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE notes SET text=? WHERE id=?').run(text, current.id);
      if (refs)
        db.prepare('INSERT OR REPLACE INTO note_attachments VALUES(?,?)').run(
          current.id,
          JSON.stringify(refs),
        );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
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
