import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VideoStore } from '../packages/local-server/src/video/store.ts';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';
import { VideoProjects } from '../packages/local-server/src/sources/projects.ts';
import { VideoCollaboration } from '../packages/local-server/src/video/collaboration.ts';

void test('agent receipt survives a late queue failure and unknown delivery can be acknowledged', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux-receipt-'));
  const workspaces = new WorkspaceStore(root);
  const store = new VideoStore(workspaces);
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const projects = new VideoProjects(root, store);
  const workspace = await projects.open(workspaces.create('Receipt race').id);
  const db = store.database(workspace.workspaceId);
  const noteId = randomUUID();
  db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
    noteId,
    'Adjust the title',
    JSON.stringify({ revisionId: workspace.revisionId, start: 0, end: 1 }),
    JSON.stringify({ kind: 'change' }),
    new Date().toISOString(),
    null,
  );
  const collaboration: VideoCollaboration = new VideoCollaboration(
    store,
    root,
    'http://127.0.0.1:5173',
    projects,
    undefined,
    (_session, message) => {
      const requestId = String(db.prepare('SELECT id FROM requests').get()!.id);
      assert.ok(message.includes(`/requests/${requestId}/received`));
      assert.equal(collaboration.context(workspace.workspaceId, requestId).state, 'sending');
      collaboration.received(workspace.workspaceId, requestId);
      return Promise.reject(new Error('Queue timed out after delivery'));
    },
  );
  const { requestId } = await collaboration.submit(workspace.workspaceId, [noteId], {
    instanceId: randomUUID(),
    session: { provider: 'codex', sessionId: randomUUID() },
  });
  assert.equal(collaboration.context(workspace.workspaceId, requestId).state, 'received');
  assert.equal(store.get(workspace.workspaceId).notes[0]?.requestId, requestId);
  db.prepare("UPDATE requests SET state='delivery-unknown',error='timeout' WHERE id=?").run(
    requestId,
  );
  const receipt = collaboration.received(workspace.workspaceId, requestId);
  assert.equal(receipt.state, 'received');
  assert.equal(receipt.error, null);
  assert.throws(() => collaboration.received(workspace.workspaceId, randomUUID()), /not found/);
});

void test('a missing Codex executable releases notes instead of leaving delivery unknown', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux-unsent-'));
  const workspaces = new WorkspaceStore(root);
  const store = new VideoStore(workspaces);
  const previous = process.env.CODEX_UX_CODEX_BIN;
  t.after(async () => {
    if (previous === undefined) delete process.env.CODEX_UX_CODEX_BIN;
    else process.env.CODEX_UX_CODEX_BIN = previous;
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  process.env.CODEX_UX_CODEX_BIN = join(root, 'missing.exe');
  const projects = new VideoProjects(root, store);
  const collaboration = new VideoCollaboration(store, root, 'http://127.0.0.1:5173', projects);
  const workspace = await projects.open(workspaces.create('Unsent feedback').id);
  const db = store.database(workspace.workspaceId);
  const note = randomUUID();
  db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
    note,
    'Keep this draft',
    JSON.stringify({ revisionId: workspace.revisionId, start: 0 }),
    JSON.stringify({ kind: 'change' }),
    new Date().toISOString(),
    null,
  );
  await assert.rejects(
    collaboration.submit(workspace.workspaceId, [note], {
      instanceId: randomUUID(),
      session: { provider: 'codex', sessionId: randomUUID() },
    }),
    /No message was sent/,
  );
  assert.equal(store.get(workspace.workspaceId).notes[0]?.requestId, null);
  assert.equal(db.prepare('SELECT state FROM requests').get()?.state, 'failed');
});

void test('a queued request publishes source edits once and refuses a stale candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-agent-'));
  const workspaces = new WorkspaceStore(root);
  const store = new VideoStore(workspaces);
  const previous = process.env.CODEX_UX_CODEX_BIN;
  try {
    const projects = new VideoProjects(root, store);
    const collaboration = new VideoCollaboration(
      store,
      root,
      'http://127.0.0.1:5173',
      projects,
      undefined,
      () => Promise.resolve('queued'),
    );
    const workspace = await projects.open(workspaces.create('Agent test').id);
    const db = store.database(workspace.workspaceId);
    const target = {
      instanceId: randomUUID(),
      session: { provider: 'codex', sessionId: randomUUID() },
    };
    const noteId = randomUUID();
    db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
      noteId,
      'Make the title warmer',
      JSON.stringify({ revisionId: workspace.revisionId, start: 1, end: 2 }),
      JSON.stringify({ kind: 'transition', duration: 0.5 }),
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
    assert.ok(context.candidateDirectory.includes(join('apps', 'video-editor', 'requests')));
    assert.equal(context.state, 'sent');
    assert.equal(
      collaboration.received(workspace.workspaceId, request.requestId).state,
      'received',
    );
    assert.equal(
      collaboration.received(workspace.workspaceId, request.requestId).state,
      'received',
    );
    const other = await projects.open(workspaces.create('Another workspace').id);
    assert.throws(() => collaboration.context(other.workspaceId, request.requestId), /not found/);
    assert.equal(store.get(workspace.workspaceId).notes[0]?.requestId, request.requestId);
    const source = join(context.candidateDirectory, 'scenes/opening.html');
    await writeFile(source, (await readFile(source, 'utf8')).replace('FIELDNOTES', 'OUR NOTES'));
    const published = await collaboration.publish(
      workspace.workspaceId,
      request.requestId,
      'Warmer words',
    );
    assert.equal(published.revision.author, 'agent');
    assert.equal(
      collaboration.received(workspace.workspaceId, request.requestId).state,
      'published',
    );
    assert.match(published.revision.document.files['scenes/opening.html']!.text!, /OUR NOTES/);
    assert.equal(
      (await collaboration.publish(workspace.workspaceId, request.requestId, 'Retry')).history
        .length,
      2,
    );
    await projects.travel(workspace.workspaceId, published.revisionId, 'undo');
    assert.equal(store.get(workspace.workspaceId).name, 'Agent test');
    db.prepare('UPDATE notes SET request_id=NULL WHERE id=?').run(noteId);
    const stale = await collaboration.submit(workspace.workspaceId, [noteId], target);
    await projects.commit(
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
