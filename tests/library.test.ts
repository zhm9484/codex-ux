import assert from 'node:assert/strict';
import test from 'node:test';
import { realpath, mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';
import { LibraryStore } from '../packages/local-server/src/storage/library.ts';

void test('libraries are workspace-owned, preserve local sources, validate references and persist uploads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ux-library-'));
  const workspaces = new WorkspaceStore(root);
  let library = new LibraryStore(workspaces);
  try {
    const first = workspaces.create('Materials');
    const second = workspaces.create('Other app');
    const source = join(root, 'materials');
    await mkdir(source);
    const path = join(source, 'hero.png');
    await writeFile(path, 'original');
    await symlink(tmpdir(), join(source, 'outside'));
    const location = await library.add(first.id, source);
    assert.equal((await library.add(first.id, source)).id, location.id);
    assert.equal((await library.search(first.id, 'hero')).entries.length, 1);
    assert.equal((await library.search(second.id, 'hero')).entries.length, 0);
    const ref = await library.reference(first.id, location.id, 'hero.png');
    assert.equal(ref.path, await realpath(path));
    await assert.rejects(library.reference(first.id, location.id, '../hero.png'));
    await assert.rejects(library.reference(first.id, location.id, 'outside'));
    assert.throws(() => library.get(second.id, ref.id));
    library.remove(first.id, location.id);
    assert.equal(await readFile(path, 'utf8'), 'original');
    assert.equal((await library.validate(first.id, [ref.id]))[0]!.path, await realpath(path));
    const attached = await library.upload(
      first.id,
      '../../screenshot.png',
      Buffer.from('clipboard'),
    );
    assert.ok(
      attached.path.startsWith(await realpath(workspaces.context(first.id).filesDirectory)),
    );
    await assert.rejects(stat(join(workspaces.context(first.id).filesDirectory, 'video')));
    library.close();
    library = new LibraryStore(workspaces);
    assert.equal(library.get(first.id, attached.id).name, 'screenshot.png');
    assert.equal(await readFile(attached.path, 'utf8'), 'clipboard');
    await writeFile(path, 'changed since the note was composed');
    await assert.rejects(library.validate(first.id, [ref.id]), /changed/);
    await rm(path);
    await assert.rejects(library.validate(first.id, [ref.id]), /unavailable/);
  } finally {
    library.close();
    await rm(root, { recursive: true, force: true });
  }
});

void test('attachment-backed requests capture paths once and reject changed files before delivery', async () => {
  const { VideoStore } = await import('../packages/local-server/src/video/store.ts');
  const { VideoProjects } = await import('../packages/local-server/src/sources/projects.ts');
  const { VideoCollaboration } =
    await import('../packages/local-server/src/video/collaboration.ts');
  const { randomUUID } = await import('node:crypto');
  const root = await mkdtemp(join(tmpdir(), 'ux-library-request-'));
  const workspaces = new WorkspaceStore(root),
    library = new LibraryStore(workspaces),
    store = new VideoStore(workspaces);
  const previous = process.env.CODEX_UX_CODEX_BIN;
  try {
    const fake = join(root, 'fake-codex');
    await writeFile(fake, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    process.env.CODEX_UX_CODEX_BIN = fake;
    const projects = new VideoProjects(root, store);
    const collaboration = new VideoCollaboration(
      store,
      root,
      'http://127.0.0.1:5173',
      projects,
      library,
    );
    const video = await projects.open(workspaces.create('Reference handoff').id);
    const ref = await library.upload(video.workspaceId, 'reference.txt', Buffer.from('Before'));
    const id = randomUUID();
    const db = store.database(video.workspaceId);
    db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
      id,
      'Use this reference',
      JSON.stringify({ revisionId: video.revisionId, start: 0, end: 0 }),
      JSON.stringify({ kind: 'change' }),
      new Date().toISOString(),
      null,
    );
    db.prepare('INSERT INTO note_attachments VALUES(?,?)').run(id, JSON.stringify([ref]));
    const target = {
      instanceId: randomUUID(),
      session: { provider: 'codex', sessionId: randomUUID() },
    };
    const results = await Promise.allSettled([
      collaboration.submit(video.workspaceId, [id], target),
      collaboration.submit(video.workspaceId, [id], target),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const success = results.find((result) => result.status === 'fulfilled')!;
    assert.equal(success.status, 'fulfilled');
    const context = collaboration.context(video.workspaceId, success.value.requestId);
    assert.equal(
      (context.notes as { attachments: { path: string }[] }[])[0]!.attachments[0]!.path,
      ref.path,
    );
    await writeFile(ref.path, 'Changed material');
    db.prepare('UPDATE notes SET request_id=NULL WHERE id=?').run(id);
    await assert.rejects(collaboration.submit(video.workspaceId, [id], target), /changed/);
    assert.equal(store.get(video.workspaceId).notes[0]!.requestId, null);
  } finally {
    if (previous === undefined) delete process.env.CODEX_UX_CODEX_BIN;
    else process.env.CODEX_UX_CODEX_BIN = previous;
    library.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
