import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { browserRuntime, prepareRuntime } from '../skills/codex-ux-workspace/scripts/runtime.ts';

const bundle = { build: 'test-build', files: { 'packages/local-server/package.json': '{}' } };

async function installFixture(runtime: string) {
  const pkg = join(runtime, 'node_modules/store/playwright-core');
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({
      name: 'playwright-core',
      exports: { '.': './index.cjs', './package.json': './package.json' },
      bin: { 'playwright-core': 'cli.js' },
    }),
  );
  await writeFile(
    join(pkg, 'index.cjs'),
    'module.exports = {chromium: {executablePath: () => "test-chrome"}};',
  );
  await writeFile(join(pkg, 'cli.js'), 'console.log(process.argv.slice(2).join(" "));');
  const modules = join(runtime, 'packages/local-server/node_modules');
  await mkdir(modules, { recursive: true });
  await symlink(pkg, join(modules, 'playwright-core'), 'junction');
}

void test('runtime keeps absolute dependency links valid and reuses verified caches', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux runtime & '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = join(root, 'cache');
  let calls = 0;
  const install = async (cwd: string) => {
    calls++;
    assert.equal(cwd, runtime);
    await assert.rejects(readFile(join(runtime, '.ready')));
    await installFixture(cwd);
    return { stdout: '', stderr: '' };
  };
  await prepareRuntime(runtime, bundle, {}, install);
  assert.equal(await readFile(join(runtime, '.ready'), 'utf8'), bundle.build);
  const { playwright, cli } = browserRuntime(runtime);
  assert.equal(playwright.chromium.executablePath(), 'test-chrome');
  const result = await promisify(execFile)(process.execPath, [cli, 'install', 'chromium']);
  assert.equal(result.stdout.trim(), 'install chromium');
  await prepareRuntime(runtime, bundle, {}, install);
  assert.equal(calls, 1);
});

void test('broken ready caches are repaired and failed installation remains retryable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux runtime repair '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = join(root, 'cache');
  await mkdir(join(runtime, 'node_modules'), { recursive: true });
  await writeFile(join(runtime, '.ready'), bundle.build);
  await assert.rejects(
    prepareRuntime(runtime, bundle, {}, async (_cwd, _env, repair) => {
      assert.equal(repair, true);
      await assert.rejects(readFile(join(runtime, '.ready')));
      throw new Error('install failed');
    }),
    /install failed/,
  );
  await assert.rejects(readFile(join(runtime, '.ready')));
  await assert.rejects(readFile(`${runtime}.lock`));
  await prepareRuntime(runtime, bundle, {}, async (cwd, _env, repair) => {
    assert.equal(repair, true);
    await installFixture(cwd);
    return { stdout: '', stderr: '' };
  });
  assert.equal(browserRuntime(runtime).playwright.chromium.executablePath(), 'test-chrome');
});

void test('runtime rejects concurrent preparation and invalid installs without ready markers', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux runtime lock '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = join(root, 'cache');
  await assert.rejects(
    prepareRuntime(runtime, bundle, {}, async () => {
      await assert.rejects(prepareRuntime(runtime, bundle, {}), /already locked/);
      return { stdout: '', stderr: '' };
    }),
    /playwright-core/,
  );
  await assert.rejects(readFile(join(runtime, '.ready')));
  await assert.rejects(readFile(`${runtime}.lock`));
});
