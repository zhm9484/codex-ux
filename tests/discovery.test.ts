import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { locateService } from '../skills/codex-ux-workspace/scripts/discovery.ts';

const execute = promisify(execFile);
void test('discovery validates service identity, rejects invalid records and follows an address changed during health checking', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux-discovery-'));
  const path = join(root, 'runtime.json');
  let health: Record<string, unknown> = {
    service: 'codex-ux',
    version: 3,
    dataRoot: root,
    runtimeBuild: 'test',
  };
  let movingTo = '';
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    if (movingTo) {
      void writeFile(path, JSON.stringify({ origin: movingTo })).then(() => {
        res.writeHead(503);
        res.end();
      });
    } else res.end(JSON.stringify(health));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const next = createServer((_req, res) => res.end(JSON.stringify(health)));
  await new Promise<void>((done) => next.listen(0, '127.0.0.1', done));
  t.after(async () => {
    await Promise.all([
      new Promise<void>((done) => server.close(() => done())),
      new Promise<void>((done) => next.close(() => done())),
    ]);
    await rm(root, { recursive: true, force: true });
  });
  await assert.rejects(locateService(root, 'test'), { code: 'service_not_started' });
  for (const text of [
    '{broken',
    'null',
    JSON.stringify({ origin: 'https://example.com' }),
    JSON.stringify({ origin: origin + '/wrong' }),
  ]) {
    await writeFile(path, text);
    await assert.rejects(locateService(root, 'test'), { code: 'service_record_invalid' });
  }
  assert.equal(requests, 0);
  await writeFile(path, JSON.stringify({ origin }));
  assert.deepEqual(await locateService(root, 'test'), {
    state: 'ready',
    origin,
    url: origin,
    apiBase: origin + '/api',
    dataRoot: root,
    runtimeBuild: 'test',
  });
  health = { ...health, dataRoot: '/a-different-directory' };
  await assert.rejects(locateService(root, 'test'), { code: 'service_mismatch' });
  health = { ...health, dataRoot: root, runtimeBuild: 'older' };
  await assert.rejects(locateService(root, 'test'), { code: 'runtime_mismatch' });
  health = { ...health, runtimeBuild: 'test' };
  movingTo = `http://127.0.0.1:${(next.address() as AddressInfo).port}`;
  assert.equal((await locateService(root, 'test')).origin, movingTo);
  await new Promise<void>((done) => next.close(() => done()));
  await assert.rejects(locateService(root, 'test'), { code: 'service_unreachable' });
});

void test('locate CLI provides a safe recovery command for missing service metadata without starting a process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ux-discovery-cli-'));
  const launcher = resolve('skills/codex-ux-workspace/scripts/workspace.ts');
  try {
    await assert.rejects(
      execute(process.execPath, [launcher, 'locate', '--data-dir', root]),
      (error: unknown) => {
        assert.ok(error instanceof Error && 'stderr' in error && 'stdout' in error);
        const result = JSON.parse(String(error.stderr)) as {
          state: string;
          dataRoot: string;
          error: { code: string };
          recovery: { action: string; args: string[] };
        };
        assert.equal(error.stdout, '');
        assert.equal(result.state, 'unavailable');
        assert.equal(result.error.code, 'service_not_started');
        assert.equal(result.dataRoot, root);
        assert.equal(result.recovery.action, 'start');
        assert.deepEqual(result.recovery.args, [launcher, 'start', '--data-dir', root]);
        return true;
      },
    );
    await assert.rejects(readFile(join(root, 'service.lock')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(root, 'runtime.json')), { code: 'ENOENT' });
    await writeFile(join(root, 'service.lock'), String(process.pid));
    await assert.rejects(
      execute(process.execPath, [launcher, 'start', '--data-dir', root]),
      (error: unknown) => {
        assert.ok(error instanceof Error && 'stderr' in error);
        const result = JSON.parse(String(error.stderr)) as {
          error: { code: string; pid: number };
          recovery: { action: string };
        };
        assert.equal(result.error.code, 'service_restart_required');
        assert.equal(result.error.pid, process.pid);
        assert.equal(result.recovery.action, 'review_running_service');
        return true;
      },
    );
    assert.equal(await readFile(join(root, 'service.lock'), 'utf8'), String(process.pid));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
