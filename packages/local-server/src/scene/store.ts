import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SceneRevision, SceneSnapshot } from '@codex-ux/scene-domain';
import type { WorkspaceStore } from '../storage/workspaces.ts';
import { HttpError } from '../errors.ts';

interface RevisionRow {
  id: string;
  parent_id: string | null;
  label: string;
  author: 'user' | 'agent';
  created_at: string;
  snapshot: string;
}
export class SceneStore {
  readonly workspaces: WorkspaceStore;
  private databases = new Map<string, DatabaseSync>();
  constructor(workspaces: WorkspaceStore) {
    this.workspaces = workspaces;
  }
  directory(id: string) {
    const directory = this.workspaces.appDirectory(id, '3d-space');
    const legacy = this.workspaces.appDirectory(id, 'scene-3d');
    // Keep existing candidate paths and immutable source references valid after the app rename.
    return !existsSync(directory) && existsSync(legacy) ? legacy : directory;
  }
  database(id: string) {
    let db = this.databases.get(id);
    if (db) return db;
    const directory = this.directory(id);
    mkdirSync(directory, { recursive: true });
    db = new DatabaseSync(join(directory, 'state.sqlite'));
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS project(id INTEGER PRIMARY KEY CHECK(id=1),head TEXT NOT NULL,redo TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,parent_id TEXT,label TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,revision_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,context TEXT NOT NULL,state TEXT NOT NULL,error TEXT,revision_id TEXT);
    `);
    this.databases.set(id, db);
    return db;
  }
  row(id: string) {
    return this.database(id).prepare('SELECT head,redo FROM project WHERE id=1').get() as
      { head: string; redo: string } | undefined;
  }
  head(id: string) {
    const row = this.row(id);
    if (!row) throw new HttpError(404, 'Open this workspace in 3D Space first.');
    return row.head;
  }
  revision(id: string, revisionId: string): SceneRevision {
    const row = this.database(id)
      .prepare('SELECT * FROM revisions WHERE id=?')
      .get(revisionId) as unknown as RevisionRow | undefined;
    if (!row) throw new HttpError(404, 'Scene version not found.');
    return {
      id: row.id,
      parentId: row.parent_id,
      label: row.label,
      author: row.author,
      createdAt: row.created_at,
      snapshot: JSON.parse(row.snapshot) as SceneSnapshot,
    };
  }
  history(id: string) {
    return (
      this.database(id)
        .prepare(
          'SELECT id,parent_id,label,author,created_at FROM revisions ORDER BY rowid DESC LIMIT 100',
        )
        .all() as unknown as Omit<RevisionRow, 'snapshot'>[]
    ).map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      label: row.label,
      author: row.author,
      createdAt: row.created_at,
    }));
  }
  committed(id: string, operationId: string) {
    return this.database(id)
      .prepare('SELECT revision_id FROM operations WHERE id=?')
      .get(operationId)?.revision_id as string | undefined;
  }
  commit(
    id: string,
    snapshot: SceneSnapshot,
    label: string,
    author: 'user' | 'agent',
    operationId: string = randomUUID(),
  ) {
    if (this.committed(id, operationId)) return this.head(id);
    const db = this.database(id);
    const revisionId = randomUUID();
    const parent = this.row(id)?.head ?? null;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?)').run(
        revisionId,
        parent,
        label,
        author,
        new Date().toISOString(),
        JSON.stringify(snapshot),
      );
      db.prepare(
        "INSERT INTO project(id,head,redo) VALUES(1,?,'[]') ON CONFLICT(id) DO UPDATE SET head=excluded.head,redo='[]'",
      ).run(revisionId);
      db.prepare('INSERT INTO operations VALUES(?,?)').run(operationId, revisionId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return revisionId;
  }
  travelTarget(id: string, direction: 'undo' | 'redo') {
    const row = this.row(id)!;
    const redo = JSON.parse(row.redo) as string[];
    const target = direction === 'undo' ? this.revision(id, row.head).parentId : redo.pop();
    if (!target) throw new HttpError(400, `Nothing to ${direction}.`);
    if (direction === 'undo') redo.push(row.head);
    return { target, redo };
  }
  close() {
    for (const db of this.databases.values()) db.close();
    this.databases.clear();
  }
}
