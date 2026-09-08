import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { get } from 'node:http';
import { startServer } from '../packages/local-server/src/server.ts';
import type { VideoProject } from '../packages/video-domain/src/schema.ts';

void test('HTTP rejects cross-origin writes, stale edits and cross-workspace references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-http-'));
  const app = await startServer(root, 0);
  const { origin } = app;
  const post = (path: string, body: unknown) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const create = async (name: string) => {
    const workspace = (await (await post('/api/workspaces', { name })).json()) as { id: string };
    return (await (
      await post(`/api/workspaces/${workspace.id}/apps/video-editor`, {})
    ).json()) as VideoProject;
  };
  try {
    const first = await create('HTTP test');
    const second = await create('Other video');
    const invitation = await post('/api/connections', {
      appId: 'video-editor',
      workspaceId: first.workspaceId,
      session: { provider: 'codex', sessionId: randomUUID() },
    });
    assert.equal(invitation.status, 201);
    const pair = (await invitation.json()) as { code: string };
    assert.equal((await fetch(origin + '/api/connections/' + pair.code)).status, 200);
    assert.equal(
      (
        await post('/api/connections', {
          appId: 'missing-app',
          workspaceId: first.workspaceId,
          session: { provider: 'codex', sessionId: randomUUID() },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await post('/api/connections', {
          appId: 'video-editor',
          workspaceId: first.workspaceId,
          session: { provider: 'unsupported', sessionId: randomUUID() },
        })
      ).status,
      400,
    );
    assert.equal(
      (await post('/api/apps', { id: 'another-app', name: 'Another App', distDirectory: root }))
        .status,
      200,
    );
    const otherPair = await post('/api/connections', {
      appId: 'another-app',
      workspaceId: first.workspaceId,
      instanceId: randomUUID(),
      previousSession: null,
    });
    assert.equal(otherPair.status, 201);
    const base = `/api/workspaces/${first.workspaceId}/apps/video-editor`;
    const blocked = await fetch(origin + base + '/notes', {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example' },
      body: '{}',
    });
    assert.equal(blocked.status, 403);
    const invalidHost = await new Promise<number | undefined>((resolve, reject) => {
      get(origin + base, { headers: { Host: 'untrusted.example' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(invalidHost, 403);
    assert.equal((await fetch(origin + base + `/revisions/${second.revisionId}`)).status, 404);
    assert.equal(
      (
        await post(base + '/notes', {
          text: 'Wrong version',
          intent: { kind: 'change' },
          anchor: { revisionId: second.revisionId, start: 0, end: 1 },
        })
      ).status,
      404,
    );
    const noteId = randomUUID();
    const draft = {
      id: noteId,
      text: 'Original draft',
      intent: { kind: 'change' },
      anchor: { revisionId: first.revisionId, start: 0, end: 1 },
    };
    assert.equal((await post(base + '/notes', draft)).status, 200);
    const replay = await post(base + '/notes', draft);
    assert.equal(
      ((await replay.json()) as VideoProject).notes.filter((note) => note.id === noteId).length,
      1,
    );
    assert.equal(
      (await post(base + '/notes', { ...draft, text: 'Conflicting replay' })).status,
      409,
    );
    const edit = (text: string, previousText: string) =>
      fetch(origin + base + '/notes/' + noteId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, previousText }),
      });
    assert.equal((await edit('Edited draft', 'Original draft')).status, 200);
    assert.equal((await edit('Stale draft', 'Original draft')).status, 409);
    const files = await fetch(origin + `/api/workspaces/${first.workspaceId}/files?path=video`);
    assert.equal(files.status, 200);
    assert.ok(
      ((await files.json()) as { entries: { name: string }[] }).entries.some(
        (entry) => entry.name === 'index.html',
      ),
    );
    const change = {
      requestId: randomUUID(),
      baseRevision: first.revisionId,
      label: 'Rename',
      document: { ...first.revision.document, name: 'Renamed' },
    };
    assert.equal((await post(base + '/revisions', change)).status, 200);
    assert.equal(
      (await post(base + '/revisions', { ...change, requestId: randomUUID() })).status,
      409,
    );
    const preview = await fetch(
      origin +
        `/media/video-editor/preview/${first.workspaceId}/${first.revisionId}/source/index.html`,
    );
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /data-composition-id="main"/);
    const player = await fetch(origin + '/media/video-editor/engine/preview.js');
    assert.match(player.headers.get('content-type') ?? '', /javascript/);
    assert.match(await player.text(), /__videoPreview/);
    const runtime = await fetch(origin + '/media/video-editor/engine/runtime.js');
    assert.equal(runtime.status, 200);
    assert.match(runtime.headers.get('content-type') ?? '', /javascript/);
    assert.ok((await runtime.text()).length > 1000);
    const generic = (await (
      await fetch(origin + `/api/workspaces/${first.workspaceId}`)
    ).json()) as Record<string, unknown>;
    assert.equal(generic.name, 'HTTP test');
    assert.equal(generic.revision, undefined);
    assert.equal(generic.threadId, undefined);
    assert.equal((await post('/api/workspaces', { name: 'Invalid', native: false })).status, 400);
    assert.equal(
      (await post(`/api/workspaces/${first.workspaceId}/binding`, { threadId: randomUUID() }))
        .status,
      404,
    );
    assert.equal((await post(base + '/binding', { threadId: randomUUID() })).status, 404);
    assert.equal((await post(base, { format: 'structured' })).status, 400);
    assert.equal(
      (await post(base + '/source', { baseRevision: first.revisionId, directory: '/tmp' })).status,
      400,
    );
    assert.equal(
      (
        await post(base + '/notes', {
          text: 'Missing intent',
          anchor: { revisionId: first.revisionId, start: 0, end: 1 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post(base + '/notes', {
          text: 'Outside video',
          intent: { kind: 'change' },
          anchor: { revisionId: first.revisionId, start: 0, end: 100 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          origin +
            `/media/video-editor/preview/${first.workspaceId}/${first.revisionId}/index.html`,
        )
      ).status,
      404,
    );
    assert.equal((await fetch(origin + '/media/video-editor/engine/player.js')).status, 404);
    assert.equal(
      (await fetch(origin + `/api/workspaces/${first.workspaceId}/revisions/${first.revisionId}`))
        .status,
      404,
    );
    assert.equal((await post(base + '/requests', { noteIds: [randomUUID()] })).status, 400);
    assert.equal(
      (
        await post(base + '/requests', {
          noteIds: [randomUUID()],
          target: {
            instanceId: randomUUID(),
            session: { provider: 'unsupported', sessionId: randomUUID() },
          },
        })
      ).status,
      400,
    );
    const invalid = await fetch(origin + base + '/notes', { method: 'POST', body: '{broken' });
    assert.equal(invalid.status, 400);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
