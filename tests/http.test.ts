import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { get } from 'node:http';
import { startServer } from '../packages/local-server/src/server.ts';
import type { Workspace } from '../packages/video-domain/src/schema.ts';

void test('HTTP rejects cross-origin writes, stale edits and cross-workspace references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-http-'));
  const port = 24000 + (process.pid % 12000);
  const app = await startServer(root, port);
  const origin = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const first = (await (
      await post('/api/workspaces', { name: 'HTTP test', native: false })
    ).json()) as Workspace;
    const second = (await (
      await post('/api/workspaces', { name: 'Other video', native: false })
    ).json()) as Workspace;
    const base = `/api/workspaces/${first.id}`;
    const blocked = await fetch(origin + base + '/binding', {
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
          anchor: { revisionId: second.revisionId, start: 0, end: 1 },
        })
      ).status,
      404,
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
    const preview = await fetch(origin + `/preview/${first.id}/${first.revisionId}/index.html`);
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /data-composition-id="main"/);
    const player = await fetch(origin + '/engine/player.js');
    assert.match(player.headers.get('content-type') ?? '', /javascript/);
    assert.match(await player.text(), /export/);
    const runtime = await fetch(origin + '/engine/runtime.js');
    assert.equal(runtime.status, 200);
    assert.match(runtime.headers.get('content-type') ?? '', /javascript/);
    assert.ok((await runtime.text()).length > 1000);
    const invalid = await fetch(origin + base + '/notes', { method: 'POST', body: '{broken' });
    assert.equal(invalid.status, 400);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
