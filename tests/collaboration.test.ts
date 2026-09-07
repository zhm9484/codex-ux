import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../packages/local-server/src/storage/database.ts';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';
import { Collaboration } from '../packages/local-server/src/collaboration.ts';
import type { VideoDocument } from '../packages/video-domain/src/schema.ts';

void test('a queued request publishes source edits once and refuses a stale candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-agent-'));
  const db = openDatabase(root);
  const previous = process.env.CODEX_UX_CODEX_BIN;
  try {
    const executable = join(root, 'fake-codex');
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
    process.env.CODEX_UX_CODEX_BIN = executable;
    const store = new WorkspaceStore(db);
    const collaboration = new Collaboration(store, root, 'http://127.0.0.1:5173');
    const workspace = store.create('Agent test');
    db.prepare('UPDATE workspaces SET thread_id=? WHERE id=?').run(randomUUID(), workspace.id);
    const noteId = randomUUID();
    db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
      noteId,
      workspace.id,
      'Make the title warmer',
      JSON.stringify({ revisionId: workspace.revisionId, start: 1, end: 2 }),
      new Date().toISOString(),
      null,
    );
    const request = await collaboration.submit(workspace.id, [noteId]);
    const context = collaboration.context(workspace.id, request.requestId);
    assert.equal(context.baseRevision, workspace.revisionId);
    assert.equal(store.get(workspace.id).notes[0]?.requestId, request.requestId);
    const file = join(context.candidateDirectory, 'project.json');
    const document = JSON.parse(await readFile(file, 'utf8')) as VideoDocument;
    document.name = 'Agent edit';
    await writeFile(file, JSON.stringify(document));
    const sourceId = Object.keys(document.sources)[0]!;
    const source = join(context.candidateDirectory, 'scenes', `${sourceId}.html`);
    await writeFile(source, document.sources[sourceId]!.replace('FIELDNOTES', 'OUR NOTES'));
    const published = await collaboration.publish(workspace.id, request.requestId, 'Warmer words');
    assert.equal(published.name, 'Agent edit');
    assert.equal(published.revision.author, 'agent');
    assert.match(published.revision.document.sources[sourceId]!, /OUR NOTES/);
    assert.equal(
      (await collaboration.publish(workspace.id, request.requestId, 'Retry')).history.length,
      2,
    );
    store.travel(workspace.id, published.revisionId, 'undo');
    assert.equal(store.get(workspace.id).name, 'Agent test');
    db.prepare('UPDATE notes SET request_id=NULL WHERE id=?').run(noteId);
    const stale = await collaboration.submit(workspace.id, [noteId]);
    store.commit(
      workspace.id,
      { requestId: randomUUID(), baseRevision: workspace.revisionId, label: 'User edit' },
      { ...workspace.revision.document, name: 'Keep my edit' },
    );
    await assert.rejects(
      collaboration.publish(workspace.id, stale.requestId, 'Stale change'),
      /changed/,
    );
    assert.equal(store.get(workspace.id).name, 'Keep my edit');
  } finally {
    if (previous === undefined) delete process.env.CODEX_UX_CODEX_BIN;
    else process.env.CODEX_UX_CODEX_BIN = previous;
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
