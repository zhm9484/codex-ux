import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VideoStore } from '../packages/local-server/src/video/store.ts';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';
import { NativeProjects } from '../packages/local-server/src/native/projects.ts';
import { VideoCollaboration } from '../packages/local-server/src/video/collaboration.ts';
import type { VideoDocument } from '../packages/video-domain/src/schema.ts';

void test('a queued request publishes source edits once and refuses a stale candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-agent-'));
  const workspaces = new WorkspaceStore(root);
  const store = new VideoStore(workspaces);
  const previous = process.env.CODEX_UX_CODEX_BIN;
  try {
    const executable = join(root, 'fake-codex');
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
    process.env.CODEX_UX_CODEX_BIN = executable;
    const collaboration = new VideoCollaboration(
      store,
      root,
      'http://127.0.0.1:5173',
      new NativeProjects(root, store),
    );
    const workspace = store.create(workspaces.create('Agent test').id);
    const db = store.database(workspace.workspaceId);
    const target = {
      instanceId: randomUUID(),
      session: { provider: 'codex', sessionId: randomUUID() },
    };
    const noteId = randomUUID();
    db.prepare('INSERT INTO notes VALUES(?,?,?,?,?)').run(
      noteId,
      'Make the title warmer',
      JSON.stringify({ revisionId: workspace.revisionId, start: 1, end: 2 }),
      new Date().toISOString(),
      null,
    );
    const originalTarget = structuredClone(target);
    const submitted = collaboration.submit(workspace.workspaceId, [noteId], target);
    target.session.sessionId = randomUUID();
    target.instanceId = randomUUID();
    await assert.rejects(
      collaboration.submit(workspace.workspaceId, [noteId], target),
      /already been sent/,
    );
    const request = await submitted;
    const context = collaboration.context(workspace.workspaceId, request.requestId);
    assert.equal(context.baseRevision, workspace.revisionId);
    assert.deepEqual(context.target, originalTarget);
    assert.equal(context.appId, 'video-editor');
    assert.ok(context.candidateDirectory.includes('apps/video-editor/requests'));
    const other = store.create(workspaces.create('Another workspace').id);
    assert.throws(() => collaboration.context(other.workspaceId, request.requestId), /not found/);
    assert.equal(store.get(workspace.workspaceId).notes[0]?.requestId, request.requestId);
    const file = join(context.candidateDirectory, 'project.json');
    const document = JSON.parse(await readFile(file, 'utf8')) as VideoDocument;
    document.name = 'Agent edit';
    await writeFile(file, JSON.stringify(document));
    const sourceId = Object.keys(document.sources)[0]!;
    const source = join(context.candidateDirectory, 'scenes', `${sourceId}.html`);
    await writeFile(source, document.sources[sourceId]!.replace('FIELDNOTES', 'OUR NOTES'));
    const published = await collaboration.publish(
      workspace.workspaceId,
      request.requestId,
      'Warmer words',
    );
    assert.equal(published.name, 'Agent edit');
    assert.equal(published.revision.author, 'agent');
    assert.match(published.revision.document.sources[sourceId]!, /OUR NOTES/);
    assert.equal(
      (await collaboration.publish(workspace.workspaceId, request.requestId, 'Retry')).history
        .length,
      2,
    );
    store.travel(workspace.workspaceId, published.revisionId, 'undo');
    assert.equal(store.get(workspace.workspaceId).name, 'Agent test');
    db.prepare('UPDATE notes SET request_id=NULL WHERE id=?').run(noteId);
    const stale = await collaboration.submit(workspace.workspaceId, [noteId], target);
    store.commit(
      workspace.workspaceId,
      { requestId: randomUUID(), baseRevision: workspace.revisionId, label: 'User edit' },
      { ...workspace.revision.document, name: 'Keep my edit' },
    );
    await assert.rejects(
      collaboration.publish(workspace.workspaceId, stale.requestId, 'Stale change'),
      /changed/,
    );
    assert.equal(store.get(workspace.workspaceId).name, 'Keep my edit');
  } finally {
    if (previous === undefined) delete process.env.CODEX_UX_CODEX_BIN;
    else process.env.CODEX_UX_CODEX_BIN = previous;
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
