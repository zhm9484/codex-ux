import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  sampleDocument,
  videoSchema,
  type Revision,
  type VideoDocument,
  type VideoProject,
  type Note,
} from '@codex-ux/video-domain';
import type { ChangeRequest } from '@codex-ux/protocol';
import type { WorkspaceStore } from '../storage/workspaces.ts';
import { HttpError } from '../errors.ts';
import { openVideoDatabase } from './database.ts';

interface ProjectRow {
  head: string;
  redo: string;
}
interface RevisionRow {
  id: string;
  parent_id: string | null;
  label: string;
  author: 'user' | 'agent';
  created_at: string;
  document: string;
}
interface NoteRow {
  id: string;
  text: string;
  anchor: string;
  created_at: string;
  request_id: string | null;
}

/** Each workspace has an independent video database. The workspace itself has no video head. */
export class VideoStore {
  readonly workspaces: WorkspaceStore;
  private databases = new Map<string, DatabaseSync>();
  constructor(workspaces: WorkspaceStore) {
    this.workspaces = workspaces;
  }
  database(id: string) {
    const directory = this.workspaces.appDirectory(id, 'video-editor');
    let db = this.databases.get(id);
    if (!db) {
      db = openVideoDatabase(directory);
      this.databases.set(id, db);
    }
    return db;
  }
  has(id: string) {
    const directory = this.workspaces.appDirectory(id, 'video-editor');
    if (!existsSync(join(directory, 'state.sqlite'))) return false;
    return !!this.database(id).prepare('SELECT head FROM project WHERE id=1').get();
  }
  close() {
    for (const db of this.databases.values()) db.close();
    this.databases.clear();
  }
  row(id: string) {
    if (!this.has(id)) throw new HttpError(404, 'Open this workspace in Video Editor first.');
    return this.database(id)
      .prepare('SELECT head,redo FROM project WHERE id=1')
      .get() as unknown as ProjectRow;
  }
  revision(workspaceId: string, id: string): Revision {
    this.row(workspaceId);
    const r = this.database(workspaceId)
      .prepare('SELECT * FROM revisions WHERE id=?')
      .get(id) as unknown as RevisionRow | undefined;
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
  get(id: string): VideoProject {
    const w = this.row(id);
    const db = this.database(id);
    const revision = this.revision(id, w.head);
    const history = (
      db
        .prepare('SELECT * FROM revisions ORDER BY created_at DESC,rowid DESC')
        .all() as unknown as RevisionRow[]
    ).map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      label: r.label,
      createdAt: r.created_at,
      author: r.author,
    }));
    const notes = (
      db.prepare('SELECT * FROM notes ORDER BY created_at').all() as unknown as NoteRow[]
    ).map((n) => ({
      id: n.id,
      text: n.text,
      anchor: JSON.parse(n.anchor) as Note['anchor'],
      createdAt: n.created_at,
      requestId: n.request_id,
    }));
    return {
      workspaceId: id,
      name: revision.document.name,
      revisionId: w.head,
      revision,
      history,
      notes,
      canUndo: revision.parentId !== null,
      canRedo: (JSON.parse(w.redo) as string[]).length > 0,
    };
  }
  create(id: string, document?: VideoDocument) {
    if (this.has(id)) return this.get(id);
    const workspace = this.workspaces.get(id);
    const db = this.database(id);
    const rev = randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO project(id,head) VALUES(1,?)').run(rev);
      db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?)').run(
        rev,
        null,
        'First draft',
        'user',
        new Date().toISOString(),
        JSON.stringify(videoSchema.parse(document ?? sampleDocument(workspace.name))),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return this.get(id);
  }
  commit(
    id: string,
    change: ChangeRequest,
    document: VideoDocument,
    author: 'user' | 'agent' = 'user',
  ) {
    const w = this.row(id);
    const db = this.database(id);
    if (db.prepare('SELECT revision_id FROM operations WHERE request_id=?').get(change.requestId))
      return this.get(id);
    if (w.head !== change.baseRevision)
      throw new HttpError(409, 'This video has changed. Refresh before saving.', 'stale_revision');
    const parsed = videoSchema.parse(document);
    const rev = randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?)').run(
        rev,
        w.head,
        change.label,
        author,
        new Date().toISOString(),
        JSON.stringify(parsed),
      );
      db.prepare("UPDATE project SET head=?,redo='[]' WHERE id=1").run(rev);
      db.prepare('INSERT INTO operations VALUES(?,?)').run(change.requestId, rev);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return this.get(id);
  }
  travel(id: string, base: string, direction: 'undo' | 'redo') {
    const w = this.row(id);
    if (base !== w.head)
      throw new HttpError(
        409,
        'This video has changed. Refresh before continuing.',
        'stale_revision',
      );
    const redo = JSON.parse(w.redo) as string[];
    const revision = this.revision(id, w.head);
    const target = direction === 'undo' ? revision.parentId : redo.pop();
    if (!target) throw new HttpError(400, `Nothing to ${direction}.`);
    if (direction === 'undo') redo.push(w.head);
    this.database(id)
      .prepare('UPDATE project SET head=?,redo=? WHERE id=1')
      .run(target, JSON.stringify(redo));
    return this.get(id);
  }
}
