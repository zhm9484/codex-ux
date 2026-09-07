import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  sampleDocument,
  videoSchema,
  type Revision,
  type VideoDocument,
  type Workspace,
  type WorkspaceSummary,
  type Note,
} from '@codex-ux/video-domain';
import type { ChangeRequest } from '@codex-ux/protocol';
import { HttpError } from '../errors.ts';

interface WorkspaceRow {
  id: string;
  name: string;
  head: string;
  redo: string;
  thread_id: string | null;
  updated_at: string;
}
interface RevisionRow {
  id: string;
  parent_id: string | null;
  label: string;
  created_at: string;
  author: 'user' | 'agent';
  document: string;
}
interface NoteRow {
  id: string;
  text: string;
  anchor: string;
  created_at: string;
  request_id: string | null;
}

export class WorkspaceStore {
  readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  list(): WorkspaceSummary[] {
    return (
      this.db
        .prepare('SELECT * FROM workspaces ORDER BY updated_at DESC')
        .all() as unknown as WorkspaceRow[]
    ).map((w) => ({
      id: w.id,
      name: w.name,
      revisionId: w.head,
      updatedAt: w.updated_at,
      threadId: w.thread_id,
    }));
  }
  row(id: string) {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id=?').get(id) as unknown as
      WorkspaceRow | undefined;
    if (!row) throw new HttpError(404, 'Workspace not found.');
    return row;
  }
  revision(workspaceId: string, id: string): Revision {
    const r = this.db
      .prepare('SELECT * FROM revisions WHERE id=? AND workspace_id=?')
      .get(id, workspaceId) as unknown as RevisionRow | undefined;
    if (!r) throw new HttpError(404, 'Version not found.');
    return {
      id: r.id,
      parentId: r.parent_id,
      label: r.label,
      createdAt: r.created_at,
      author: r.author,
      document: videoSchema.parse(JSON.parse(r.document)),
    };
  }
  get(id: string): Workspace {
    const w = this.row(id);
    const revision = this.revision(id, w.head);
    const history = (
      this.db
        .prepare('SELECT * FROM revisions WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC')
        .all(id) as unknown as RevisionRow[]
    ).map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      label: r.label,
      createdAt: r.created_at,
      author: r.author,
    }));
    const notes = (
      this.db
        .prepare('SELECT * FROM notes WHERE workspace_id=? ORDER BY created_at')
        .all(id) as unknown as NoteRow[]
    ).map((n) => ({
      id: n.id,
      text: n.text,
      anchor: JSON.parse(n.anchor) as Note['anchor'],
      createdAt: n.created_at,
      requestId: n.request_id,
    }));
    return {
      id,
      name: w.name,
      revisionId: w.head,
      updatedAt: w.updated_at,
      threadId: w.thread_id,
      revision,
      history,
      notes,
      canUndo: revision.parentId !== null,
      canRedo: (JSON.parse(w.redo) as string[]).length > 0,
    };
  }
  create(name: string) {
    const id = randomUUID(),
      rev = randomUUID(),
      now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT INTO workspaces(id,name,head,updated_at) VALUES(?,?,?,?)')
        .run(id, name, rev, now);
      this.db
        .prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)')
        .run(rev, id, null, 'First draft', 'user', now, JSON.stringify(sampleDocument(name)));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.get(id);
  }
  commit(
    id: string,
    change: ChangeRequest,
    document: VideoDocument,
    author: 'user' | 'agent' = 'user',
  ) {
    const previous = this.db
      .prepare('SELECT revision_id FROM operations WHERE workspace_id=? AND request_id=?')
      .get(id, change.requestId) as { revision_id: string } | undefined;
    if (previous) return this.get(id);
    const w = this.row(id);
    if (w.head !== change.baseRevision)
      throw new HttpError(409, 'This video has changed. Reload before saving.', 'stale_revision');
    const parsed = videoSchema.parse(document);
    const rev = randomUUID(),
      now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?)')
        .run(rev, id, w.head, change.label, author, now, JSON.stringify(parsed));
      this.db
        .prepare("UPDATE workspaces SET head=?,name=?,updated_at=?,redo='[]' WHERE id=?")
        .run(rev, parsed.name, now, id);
      this.db.prepare('INSERT INTO operations VALUES(?,?,?)').run(id, change.requestId, rev);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.get(id);
  }
  travel(id: string, base: string, direction: 'undo' | 'redo') {
    const w = this.row(id);
    if (base !== w.head)
      throw new HttpError(
        409,
        'This video has changed. Reload before continuing.',
        'stale_revision',
      );
    const redo = JSON.parse(w.redo) as string[];
    const revision = this.revision(id, w.head);
    const target = direction === 'undo' ? revision.parentId : redo.pop();
    if (!target) throw new HttpError(400, `Nothing to ${direction}.`);
    if (direction === 'undo') redo.push(w.head);
    const next = this.revision(id, target);
    this.db
      .prepare('UPDATE workspaces SET head=?,name=?,redo=?,updated_at=? WHERE id=?')
      .run(target, next.document.name, JSON.stringify(redo), new Date().toISOString(), id);
    return this.get(id);
  }
}
