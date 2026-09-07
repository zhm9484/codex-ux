import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openDatabase(root: string) {
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(join(root, 'state.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,head TEXT NOT NULL,redo TEXT NOT NULL DEFAULT '[]',thread_id TEXT,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),parent_id TEXT,label TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),text TEXT NOT NULL,anchor TEXT NOT NULL,created_at TEXT NOT NULL,request_id TEXT);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),base_revision TEXT NOT NULL,thread_id TEXT NOT NULL,notes TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,error TEXT);
    CREATE TABLE IF NOT EXISTS operations(workspace_id TEXT NOT NULL,request_id TEXT NOT NULL,revision_id TEXT NOT NULL,PRIMARY KEY(workspace_id,request_id));
  `);
  return db;
}
