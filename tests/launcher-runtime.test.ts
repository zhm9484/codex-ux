import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Environments } from '../skills/codex-ux-workspace/scripts/environments.ts';
import { prepareRuntime } from '../skills/codex-ux-workspace/scripts/runtime.ts';
import { acquireLock } from '../skills/codex-ux-workspace/scripts/lock.ts';

void test('capability cache is shared across source builds, independent of video, and retries explicitly', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux runtime & '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = '{"dependencies":{"fixture":"1.0.0"}}',
    lock = 'frozen',
    workspace = 'packages: []';
  const artifact = {
    manifest,
    lock,
    workspace,
    packages: ['fixture'],
    build: createHash('sha256')
      .update(manifest + lock + workspace)
      .digest('hex'),
  };
  for (const name of ['source-a', 'source-b']) {
    await mkdir(join(root, name));
    await writeFile(join(root, name, 'environments.json'), JSON.stringify({ scene: artifact }));
  }
  let calls = 0,
    fail = true;
  const install = async (directory: string) => {
    calls++;
    if (fail) throw new Error('network unavailable');
    await mkdir(join(directory, 'node_modules/fixture'), { recursive: true });
    await writeFile(join(directory, 'node_modules/fixture/package.json'), '{"main":"index.cjs"}');
    await writeFile(join(directory, 'node_modules/fixture/index.cjs'), 'module.exports = {};');
    return { stdout: '', stderr: '' };
  };
  const first = new Environments(join(root, 'source-a'), root, install);
  await assert.rejects(first.ensure('scene'), /network unavailable/);
  await assert.rejects(first.ensure('scene'), /network unavailable/);
  assert.equal(calls, 1, 'failed preparation must not repeat on polling');
  fail = false;
  first.start('scene');
  await first.ensure('scene');
  const second = new Environments(join(root, 'source-b'), root, install);
  await second.ensure('scene');
  assert.equal(calls, 2, 'source-only change must reuse installed dependencies');
  assert.equal(second.list().find((s) => s.id === 'video')?.state, 'absent');
  assert.equal(
    await readFile(join(root, 'source-b/node_modules/fixture/index.cjs'), 'utf8'),
    'module.exports = {};',
  );
});

void test('preparation serializes contenders and releases after cancellation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux lock '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'runtime.lock');
  const release = await acquireLock(path);
  const controller = new AbortController();
  const contender = acquireLock(path, controller.signal);
  controller.abort();
  await assert.rejects(contender);
  await release();
  const next = await acquireLock(path);
  await next();
});

void test('runtime rejects unsafe resource paths before installing dependencies', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux resources '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    prepareRuntime(join(root, 'runtime'), { build: 'bad', files: { '../escape': 'bad' } }, {}),
    /Invalid runtime resource path/,
  );
});
