import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openVideoDatabase(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'state.sqlite'));
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version;
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project'")
    .get();
  if (existing && version !== 1) {
    db.close();
    throw new Error(
      'This video uses an unsupported storage format. Open its source in a new workspace.',
    );
  }
  db.exec(`PRAGMA user_version=1; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS project(id INTEGER PRIMARY KEY CHECK(id=1),head TEXT NOT NULL,redo TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,parent_id TEXT,label TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,text TEXT NOT NULL,anchor TEXT NOT NULL,intent TEXT NOT NULL,created_at TEXT NOT NULL,request_id TEXT);
    CREATE TABLE IF NOT EXISTS note_attachments(note_id TEXT PRIMARY KEY,refs TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,base_revision TEXT NOT NULL,instance_id TEXT NOT NULL,provider TEXT NOT NULL,session_id TEXT NOT NULL,notes TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,error TEXT);
    CREATE TABLE IF NOT EXISTS operations(request_id TEXT PRIMARY KEY,revision_id TEXT NOT NULL REFERENCES revisions(id));
  `);
  return db;
}
