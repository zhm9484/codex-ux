import type { NativeProjects } from '../native/projects.ts';
import { snapshot } from '../native/files.ts';
import { randomUUID } from 'node:crypto';
import { deliver, collaborationTarget } from '../agents.ts';
import type { CollaborationTarget } from '@codex-ux/protocol';
import { join } from 'node:path';
import type { VideoStore } from './store.ts';
import { HttpError } from '../errors.ts';
import { readCandidate, writeCandidate, materialize, videoDirectory } from './files.ts';

interface RequestRow {
  id: string;
  base_revision: string;
  instance_id: string;
  provider: string;
  session_id: string;
  notes: string;
  state: string;
  created_at: string;
  error: string | null;
}
export class VideoCollaboration {
  readonly store: VideoStore;
  readonly root: string;
  readonly origin: string;
  readonly native: NativeProjects;
  constructor(store: VideoStore, root: string, origin: string, native: NativeProjects) {
    this.native = native;
    this.store = store;
    this.root = root;
    this.origin = origin;
  }
  request(id: string, requestId: string) {
    const row = this.store
      .database(id)
      .prepare('SELECT * FROM requests WHERE id=?')
      .get(requestId) as unknown as RequestRow | undefined;
    if (!row) throw new HttpError(404, 'Request not found.');
    return row;
  }
  async submit(id: string, noteIds: string[], destination: CollaborationTarget) {
    const target = collaborationTarget.parse(destination);
    const w = this.store.get(id);
    const notes = w.notes.filter((n) => noteIds.includes(n.id) && !n.requestId);
    if (!notes.length || notes.length !== new Set(noteIds).size)
      throw new HttpError(
        409,
        'Some selected notes have already been sent or removed. Refresh before sending.',
      );
    const requestId = randomUUID();
    const db = this.store.database(id);
    // Capture routing and reserve notes before any asynchronous file work or delivery.
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?)').run(
        requestId,
        w.revisionId,
        target.instanceId,
        target.session.provider,
        target.session.sessionId,
        JSON.stringify(notes),
        'preparing',
        new Date().toISOString(),
        null,
      );
      for (const note of notes)
        db.prepare('UPDATE notes SET request_id=? WHERE id=? AND request_id IS NULL').run(
          requestId,
          note.id,
        );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    let deliveryStarted = false;
    try {
      const dir = await writeCandidate(this.root, id, requestId, w.revision);
      const endpoint = `${this.origin}/api/workspaces/${id}/apps/video-editor/requests/${requestId}`;
      const sourceInstructions = w.revision.document.native
        ? `This is a native HyperFrames project. Edit its index.html, JS, CSS, nested compositions and resources directly. Preserve files and stable IDs you are not changing. The working directory is ${this.native.status(id).directory}; for this request, edit the isolated candidate and publish it once.`
        : 'project.json owns tracks, clip timing and assets; scenes/<sourceId>.html owns scene source (overriding sources fields at publication). Keep IDs stable and use __CLIP_ID__ for instance IDs.';
      const message = `Video Editor feedback request ${requestId} for workspace ${id}. Read the JSON context at ${endpoint} using HTTP GET. This request was explicitly submitted by the user. Edit the candidate at ${dir}. ${sourceInstructions} Do not modify immutable revision files. Preview the candidate, then POST JSON {"label":"A concise description"} to ${endpoint}/publish. Publication checks the base revision and records one undoable agent version. If blocked, POST {"message":"..."} to ${endpoint}/error. Do not queue another agent session.`;
      db.prepare("UPDATE requests SET state='sending' WHERE id=?").run(requestId);
      deliveryStarted = true;
      await deliver(target.session, message);
      db.prepare("UPDATE requests SET state='sent' WHERE id=? AND state='sending'").run(requestId);
    } catch (error) {
      const state = deliveryStarted ? 'delivery-unknown' : 'failed';
      db.prepare(
        "UPDATE requests SET state=?,error=? WHERE id=? AND state IN ('preparing','sending')",
      ).run(state, error instanceof Error ? error.message : 'Request failed.', requestId);
      if (!deliveryStarted) {
        db.prepare('UPDATE notes SET request_id=NULL WHERE request_id=?').run(requestId);
        throw error;
      }
      throw new HttpError(
        502,
        'Agent delivery could not be confirmed. Check the connected session before sending again.',
      );
    }
    return { requestId };
  }
  context(id: string, requestId: string) {
    const r = this.request(id, requestId);
    const base = this.store.revision(id, r.base_revision);
    return {
      requestId,
      workspaceId: id,
      appId: 'video-editor',
      target: {
        instanceId: r.instance_id,
        session: { provider: r.provider, sessionId: r.session_id },
      },
      baseRevision: r.base_revision,
      currentRevision: this.store.row(id).head,
      notes: JSON.parse(r.notes) as unknown,
      document: base.document,
      candidateDirectory: join(videoDirectory(this.root, id), 'requests', requestId),
      previewUrl: `${this.origin}/media/video-editor/candidate/${id}/${requestId}/preview.html`,
      publishUrl: `${this.origin}/api/workspaces/${id}/apps/video-editor/requests/${requestId}/publish`,
      source: base.document.native ? this.native.status(id) : undefined,
      state: r.state,
      error: r.error,
    };
  }
  async publish(id: string, requestId: string, label: string) {
    const r = this.request(id, requestId);
    if (r.state === 'published') return this.store.get(id);
    const base = this.store.revision(id, r.base_revision);
    const doc = base.document.native
      ? await snapshot(
          this.root,
          id,
          join(videoDirectory(this.root, id), 'requests', requestId),
          base.document,
        )
      : await readCandidate(this.root, id, requestId);
    // Materialize the candidate before changing the visible head; missing assets fail safely.
    const candidate = {
      id: `candidate-${randomUUID()}`,
      parentId: r.base_revision,
      label,
      createdAt: new Date().toISOString(),
      author: 'agent' as const,
      document: doc,
    };
    await materialize(this.root, id, candidate);
    const w = await this.native.commit(
      id,
      { requestId, baseRevision: r.base_revision, label },
      doc,
      'agent',
    );
    this.store
      .database(id)
      .prepare("UPDATE requests SET state='published' WHERE id=?")
      .run(requestId);
    return w;
  }
}
