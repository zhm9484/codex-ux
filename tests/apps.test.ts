import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../packages/local-server/src/server.ts';
import { validateApps } from '../packages/local-server/src/apps.ts';

void test('multiple external app bundles share a workspace directory without copying their code into it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-apps-'));
  const data = join(root, 'data');
  const port = 38000 + (process.pid % 10000);
  const apps = ['first-app', 'second-app'].map((id) => ({
    id,
    name: id,
    distDirectory: join(root, 'bundles', id, 'dist'),
  }));
  for (const app of apps) {
    await mkdir(app.distDirectory, { recursive: true });
    await writeFile(join(app.distDirectory, 'index.html'), `<h1>${app.name}</h1>`);
    await writeFile(join(app.distDirectory, 'app.js'), `export const appId = '${app.id}';`);
  }
  const server = await startServer(data, port, false, apps);
  const origin = `http://127.0.0.1:${port}`;
  try {
    assert.deepEqual(
      await (await fetch(`${origin}/api/apps`)).json(),
      apps.map(({ id, name }) => ({ id, name })),
    );
    const created = await fetch(`${origin}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Shared work' }),
    });
    const workspace = (await created.json()) as { id: string };
    const context = (await (await fetch(`${origin}/api/workspaces/${workspace.id}`)).json()) as {
      filesDirectory: string;
    };
    await writeFile(join(context.filesDirectory, 'shared.txt'), 'Used by both apps');
    for (const app of apps) {
      const entry = await fetch(`${origin}/apps/${app.id}/w/${workspace.id}`);
      assert.equal(await entry.text(), `<h1>${app.name}</h1>`);
      assert.match(
        await (await fetch(`${origin}/apps/${app.id}/app.js`)).text(),
        new RegExp(app.id),
      );
    }
    assert.equal(
      await readFile(join(data, 'workspaces', workspace.id, 'files/shared.txt'), 'utf8'),
      'Used by both apps',
    );
    assert.equal((await fetch(`${origin}/apps/unknown/`)).status, 404);
    assert.equal((await fetch(`${origin}/w/${workspace.id}`)).status, 404);
    assert.throws(() => validateApps([apps[0]!, apps[0]!]), /unique/);
    assert.throws(() => validateApps([{ id: '../outside', name: 'Invalid', distDirectory: root }]));
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
