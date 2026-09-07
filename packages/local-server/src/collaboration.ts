import type { NativeProjects } from './native/projects.ts';
import { snapshot } from './native/files.ts';
import { randomUUID } from 'node:crypto';
import { queueRequest } from '@codex-ux/adapter-codex';
import type { WorkspaceStore } from './storage/workspaces.ts';
import { HttpError } from './errors.ts';
import { readCandidate, writeCandidate, materialize } from './video/files.ts';

interface RequestRow {
  id: string;
  workspace_id: string;
  base_revision: string;
  thread_id: string;
  notes: string;
  state: string;
  created_at: string;
  error: string | null;
}
export class Collaboration {
  readonly store: WorkspaceStore;
  readonly root: string;
  readonly origin: string;
  readonly native: NativeProjects | undefined;
  constructor(store: WorkspaceStore, root: string, origin: string, native?: NativeProjects) {
    this.native = native;
    this.store = store;
    this.root = root;
    this.origin = origin;
  }
  request(id: string, requestId: string) {
    const row = this.store.db
      .prepare('SELECT * FROM requests WHERE id=? AND workspace_id=?')
      .get(requestId, id) as unknown as RequestRow | undefined;
    if (!row) throw new HttpError(404, 'Request not found.');
    return row;
  }
  async submit(id: string, noteIds: string[]) {
    const w = this.store.get(id);
    if (!w.threadId) throw new HttpError(400, 'Connect a Codex task before sending feedback.');
    const notes = w.notes.filter((n) => noteIds.includes(n.id) && !n.requestId);
    if (!notes.length) throw new HttpError(400, 'Select unsent notes first.');
    const requestId = randomUUID();
    const dir = await writeCandidate(this.root, id, requestId, w.revision);
    this.store.db
      .prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?)')
      .run(
        requestId,
        id,
        w.revisionId,
        w.threadId,
        JSON.stringify(notes),
        'sending',
        new Date().toISOString(),
        null,
      );
    // The request is durable before invoking the external queue.
    const endpoint = `${this.origin}/api/workspaces/${id}/requests/${requestId}`;
    const sourceInstructions = w.revision.document.native
      ? `This is a native HyperFrames project. Edit its index.html, JS, CSS, nested compositions and resources directly. Do not convert it to project.json or wrap its scenes. Preserve files and stable IDs you are not changing. The working directory at ${this.native?.status(id).directory} is auto-synced if you prefer direct editing; for this request, edit the isolated candidate and publish it once.`
      : `project.json owns tracks, clip timing and editable text; scenes/*.html owns scene code (these files override the sources fields on publication). Keep IDs stable and use __CLIP_ID__ in scene code for instance IDs.`;
    const message = `video-editor feedback request ${requestId}. Read the JSON context at ${endpoint} using HTTP GET. This request was explicitly submitted by the user in the local video app. Edit the candidate project at ${dir}: ${sourceInstructions} Do not modify immutable revision files. Preview the candidate with the provided preview endpoint. When finished, POST JSON {"label":"A concise description"} to ${endpoint}/publish. Publication verifies the base revision and records one undoable agent version. If blocked, POST {"message":"..."} to ${endpoint}/error. Do not queue another Codex task.`;
    try {
      await queueRequest(w.threadId, message);
      this.store.db.prepare("UPDATE requests SET state='sent' WHERE id=?").run(requestId);
      for (const note of notes)
        this.store.db
          .prepare('UPDATE notes SET request_id=? WHERE id=? AND workspace_id=?')
          .run(requestId, note.id, id);
    } catch (e) {
      this.store.db
        .prepare("UPDATE requests SET state='delivery-unknown',error=? WHERE id=?")
        .run(e instanceof Error ? e.message : 'Delivery could not be confirmed.', requestId);
      throw new HttpError(
        502,
        'Codex delivery could not be confirmed. Check the connected task before sending again.',
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
      baseRevision: r.base_revision,
      currentRevision: this.store.row(id).head,
      notes: JSON.parse(r.notes) as unknown,
      document: base.document,
      candidateDirectory: `${this.root}/workspaces/${id}/requests/${requestId}`,
      previewUrl: `${this.origin}/candidate/${id}/${requestId}/preview.html`,
      publishUrl: `${this.origin}/api/workspaces/${id}/requests/${requestId}/publish`,
      source: this.native?.status(id),
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
          `${this.root}/workspaces/${id}/requests/${requestId}`,
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
    const w = await (
      this.native ? this.native.commit.bind(this.native) : this.store.commit.bind(this.store)
    )(id, { requestId, baseRevision: r.base_revision, label }, doc, 'agent');
    this.store.db.prepare("UPDATE requests SET state='published' WHERE id=?").run(requestId);
    return w;
  }
}
