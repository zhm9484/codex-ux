import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { lstat, realpath, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import type {
  LibrarySource,
  LibraryEntry,
  LibraryReference,
  LibrarySearch,
} from '@codex-ux/protocol';
import type { WorkspaceStore } from './workspaces.ts';
import { HttpError } from '../errors.ts';

const types: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};
const mime = (path: string) =>
  types[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream';
const ignored = new Set(['node_modules', '.git', '.cache', '.next', 'dist', 'build']);
async function info(path: string) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
      throw new Error('Unsupported file.');
    return stat;
  } catch {
    throw new HttpError(404, 'This file or directory is unavailable. Choose it again.');
  }
}

export class LibraryStore {
  readonly workspaces: WorkspaceStore;
  private readonly databases = new Map<string, DatabaseSync>();
  constructor(workspaces: WorkspaceStore) {
    this.workspaces = workspaces;
  }
  private db(id: string) {
    const context = this.workspaces.context(id);
    let db = this.databases.get(id);
    if (!db) {
      db = new DatabaseSync(join(context.directory, 'library.sqlite'));
      db.exec(`PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS refs(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL);`);
      this.databases.set(id, db);
    }
    return db;
  }
  sources(id: string): LibrarySource[] {
    const attachments = join(this.workspaces.context(id).filesDirectory, 'attachments');
    mkdirSync(attachments, { recursive: true });
    return [
      {
        id: 'attachments',
        name: 'Workspace attachments',
        path: realpathSync(attachments),
        kind: 'directory',
        managed: true,
      },
      ...this.db(id)
        .prepare('SELECT data FROM sources ORDER BY rowid')
        .all()
        .map((row) => JSON.parse(row.data as string) as LibrarySource),
    ];
  }
  async add(id: string, path: string) {
    if (!isAbsolute(path)) throw new HttpError(400, 'Enter an absolute local path.');
    const stat = await info(path);
    const resolved = await realpath(path);
    const existing = this.sources(id).find((source) => source.path === resolved);
    if (existing) return existing;
    const source: LibrarySource = {
      id: randomUUID(),
      path: resolved,
      name: basename(resolved) || resolved,
      kind: stat.isDirectory() ? 'directory' : 'file',
      managed: false,
    };
    this.db(id)
      .prepare('INSERT INTO sources VALUES(?,?,?)')
      .run(source.id, source.path, JSON.stringify(source));
    return source;
  }
  remove(id: string, sourceId: string) {
    this.db(id).prepare('DELETE FROM sources WHERE id=?').run(sourceId);
  }
  async browse(path = homedir()) {
    if (!isAbsolute(path)) throw new HttpError(400, 'Enter an absolute local path.');
    const resolved = await realpath(path).catch(() => {
      throw new HttpError(404, 'Directory unavailable.');
    });
    if (!(await info(resolved)).isDirectory()) throw new HttpError(400, 'Choose a directory.');
    const entries = (await readdir(resolved, { withFileTypes: true }))
      .filter(
        (entry) =>
          !entry.name.startsWith('.') &&
          !entry.isSymbolicLink() &&
          (entry.isDirectory() || entry.isFile()),
      )
      .sort(
        (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
      );
    return {
      path: resolved,
      parent: dirname(resolved),
      truncated: entries.length > 500,
      entries: entries.slice(0, 500).map((entry) => ({
        name: entry.name,
        path: join(resolved, entry.name),
        kind: entry.isDirectory() ? 'directory' : 'file',
      })),
    };
  }
  private async entryPath(id: string, sourceId: string, relativePath: string) {
    const source = this.sources(id).find((source) => source.id === sourceId);
    if (!source) throw new HttpError(404, 'This library location was removed.');
    if (
      isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).some((part) => part === '..' || part === '.')
    )
      throw new HttpError(403, 'Invalid library path.');
    if (source.kind === 'file' && relativePath)
      throw new HttpError(403, 'A file is not a directory.');
    const path = source.kind === 'file' ? source.path : join(source.path, relativePath);
    const resolved = await realpath(path).catch(() => {
      throw new HttpError(404, 'This file is unavailable.');
    });
    if (resolved !== source.path && !resolved.startsWith(source.path + sep))
      throw new HttpError(403, 'File is outside the library location.');
    // Reject link traversal, including an interior link that happens to point back inside the root.
    let current = source.path;
    await info(current);
    for (const part of relative(source.path, path).split(sep).filter(Boolean)) {
      current = join(current, part);
      await info(current);
    }
    return resolved;
  }
  async search(id: string, query: string, sourceId?: string): Promise<LibrarySearch> {
    const entries: LibraryEntry[] = [];
    const unavailable: string[] = [];
    let scanned = 0;
    let depthLimited = false;
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const sources = this.sources(id).filter((source) => !sourceId || source.id === sourceId);
    if (!tokens.length) {
      const recent = this.db(id)
        .prepare('SELECT data FROM refs ORDER BY rowid DESC LIMIT 30')
        .all();
      for (const row of recent) {
        const ref = JSON.parse(row.data as string) as LibraryReference;
        if (
          !sources.some((source) => source.id === ref.sourceId) ||
          entries.some(
            (entry) => entry.sourceId === ref.sourceId && entry.relativePath === ref.relativePath,
          )
        )
          continue;
        try {
          await this.entryPath(id, ref.sourceId, ref.relativePath);
          entries.push({
            sourceId: ref.sourceId,
            relativePath: ref.relativePath,
            name: ref.name,
            kind: ref.kind,
            mime: ref.mime,
          });
        } catch {
          /* Keep unavailable material out of recent suggestions. */
        }
      }
    }
    const push = (source: LibrarySource, path: string, kind: 'file' | 'directory') => {
      const relativePath =
        source.kind === 'file' ? '' : relative(source.path, path).split(sep).join('/');
      if (
        entries.some((entry) => entry.sourceId === source.id && entry.relativePath === relativePath)
      )
        return;
      if (tokens.every((token) => `${source.name}/${relativePath}`.toLowerCase().includes(token)))
        entries.push({
          sourceId: source.id,
          relativePath,
          name: source.managed ? basename(path).replace(/^[a-f0-9-]{36}-/, '') : basename(path),
          kind,
          mime: kind === 'directory' ? 'inode/directory' : mime(path),
        });
    };
    const walk = async (source: LibrarySource, directory: string, depth: number) => {
      if (depth > 20) depthLimited = true;
      if (depth > 20 || scanned >= 10000 || entries.length >= 100) return;
      const children = await readdir(directory, { withFileTypes: true });
      children.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of children) {
        if (++scanned >= 10000 || entries.length >= 100) break;
        if (entry.name.startsWith('.') || ignored.has(entry.name) || entry.isSymbolicLink())
          continue;
        const path = join(directory, entry.name);
        if (entry.isFile()) push(source, path, 'file');
        else if (entry.isDirectory()) {
          push(source, path, 'directory');
          await walk(source, path, depth + 1).catch(() => undefined);
        }
      }
    };
    for (const source of sources) {
      try {
        await this.entryPath(id, source.id, '');
        if (source.kind === 'file') push(source, source.path, 'file');
        else await walk(source, source.path, 0);
      } catch {
        unavailable.push(source.name);
      }
    }
    return {
      entries: entries.slice(0, 100),
      truncated: depthLimited || scanned >= 10000 || entries.length >= 100,
      unavailable,
    };
  }
  async reference(id: string, sourceId: string, relativePath: string) {
    const path = await this.entryPath(id, sourceId, relativePath);
    const stat = await info(path);
    const reference: LibraryReference = {
      id: randomUUID(),
      sourceId,
      relativePath,
      path,
      name:
        sourceId === 'attachments' ? basename(path).replace(/^[a-f0-9-]{36}-/, '') : basename(path),
      kind: stat.isDirectory() ? 'directory' : 'file',
      mime: stat.isDirectory() ? 'inode/directory' : mime(path),
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    };
    this.db(id)
      .prepare('INSERT INTO refs VALUES(?,?,?)')
      .run(reference.id, JSON.stringify(reference), new Date().toISOString());
    return reference;
  }
  get(id: string, referenceId: string): LibraryReference {
    const row = this.db(id).prepare('SELECT data FROM refs WHERE id=?').get(referenceId);
    if (!row) throw new HttpError(404, 'Attachment not found in this workspace.');
    return JSON.parse(row.data as string) as LibraryReference;
  }
  async validate(id: string, ids: string[]) {
    const refs = ids.map((ref) => this.get(id, ref));
    for (const ref of refs) {
      const stat = await info(ref.path);
      const resolved = await realpath(ref.path);
      if (
        resolved !== ref.path ||
        stat.isDirectory() !== (ref.kind === 'directory') ||
        (stat.isFile() && (stat.size !== ref.size || stat.mtimeMs !== ref.modifiedAt))
      )
        throw new HttpError(
          409,
          `${ref.name} changed. Remove its attachment and choose the current file again.`,
        );
    }
    return refs;
  }
  async upload(id: string, name: string, bytes: Buffer) {
    if (!bytes.length) throw new HttpError(400, 'The attachment is empty.');
    const safe =
      basename(name.replaceAll('\\', '/'))
        .replace(/[^\p{L}\p{N}._ -]/gu, '_')
        .slice(-160) || 'attachment';
    const source = this.sources(id)[0]!;
    const filename = `${randomUUID()}-${safe}`;
    await writeFile(join(source.path, filename), bytes, { flag: 'wx' });
    const ref = await this.reference(id, source.id, filename);
    ref.name = safe;
    this.db(id).prepare('UPDATE refs SET data=? WHERE id=?').run(JSON.stringify(ref), ref.id);
    return ref;
  }
  close() {
    for (const db of this.databases.values()) db.close();
    this.databases.clear();
  }
}
