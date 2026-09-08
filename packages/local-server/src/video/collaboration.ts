import type { LibraryStore } from '../storage/library.ts';
import type { VideoProjects } from '../sources/projects.ts';
import { randomUUID } from 'node:crypto';
import { deliver, collaborationTarget } from '../agents.ts';
import type { CollaborationTarget } from '@codex-ux/protocol';
import { join } from 'node:path';
import type { VideoStore } from './store.ts';
import { HttpError } from '../errors.ts';
import { readCandidate, writeCandidate, videoDirectory } from './files.ts';

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
  readonly library: LibraryStore | undefined;
  readonly store: VideoStore;
  readonly root: string;
  readonly origin: string;
  readonly projects: VideoProjects;
  constructor(
    store: VideoStore,
    root: string,
    origin: string,
    projects: VideoProjects,
    library?: LibraryStore,
  ) {
    this.library = library;
    this.projects = projects;
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
    if (this.library)
      await this.library.validate(
        id,
        notes.flatMap((note) => (note.attachments ?? []).map((ref) => ref.id)),
      );
    const currentNotes = this.store.get(id).notes;
    if (
      notes.some(
        (note) =>
          JSON.stringify(currentNotes.find((current) => current.id === note.id)) !==
          JSON.stringify(note),
      )
    )
      throw new HttpError(
        409,
        'A selected note changed while attachments were checked. Review it before sending.',
      );
    const requestId = randomUUID();
    const db = this.store.database(id);
    // Recheck and reserve the captured notes after attachment validation, before delivery.
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
      for (const note of notes) {
        const reserved = db
          .prepare('UPDATE notes SET request_id=? WHERE id=? AND request_id IS NULL')
          .run(requestId, note.id);
        if (!reserved.changes) throw new HttpError(409, 'A selected note was already submitted.');
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    let deliveryStarted = false;
    try {
      const dir = await writeCandidate(this.root, id, requestId, w.revision);
      const endpoint = `${this.origin}/api/workspaces/${id}/apps/video-editor/requests/${requestId}`;
      const sourceInstructions = `This is a ${w.revision.document.source.kind} source project. video.json describes the entry and playback metadata. Edit the ordinary source files or replace the media file in the candidate. Preserve unrelated files and stable IDs. Transition notes express user intent: implement them in the source or regenerate the media. The working directory is ${this.projects.status(id).directory}; edit the isolated candidate for this request and publish it once.`;
      const message = `Video Editor feedback request ${requestId} for workspace ${id}. Read the JSON context at ${endpoint} using HTTP GET. Each note may include attachments with absolute local paths. Read those files or directories as reference material; copy needed resources into the candidate before using them in the video, leaving originals untouched. This request was explicitly submitted by the user. Edit the candidate at ${dir}. ${sourceInstructions} Do not modify immutable revision files. Preview the candidate, then POST JSON {"label":"A concise description"} to ${endpoint}/publish. Publication checks the base revision and records one undoable agent version. If blocked, POST {"message":"..."} to ${endpoint}/error. Do not queue another agent session.`;
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
      previewUrl: `${this.origin}/media/video-editor/candidate/${id}/${requestId}/player.html`,
      publishUrl: `${this.origin}/api/workspaces/${id}/apps/video-editor/requests/${requestId}/publish`,
      source: this.projects.status(id),
      state: r.state,
      error: r.error,
    };
  }
  async publish(id: string, requestId: string, label: string) {
    const r = this.request(id, requestId);
    if (r.state === 'published') return this.store.get(id);
    const base = this.store.revision(id, r.base_revision);
    const doc = await readCandidate(this.root, id, requestId, base.document);
    const w = await this.projects.commit(
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
