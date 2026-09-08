import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../packages/local-server/src/server.ts';

const execute = promisify(execFile);
const main = resolve('packages/local-server/src/main.ts');
const environment = (root: string, port?: string) => ({
  ...process.env,
  CODEX_UX_DATA_DIR: root,
  CODEX_UX_PORT: port,
  CODEX_UX_RUNTIME_BUILD: 'startup-test',
});

void test(
  'automatic startup avoids occupied saved ports, reuses live services and preserves the origin on restart',
  { timeout: 30_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-ux-startup-'));
    const root = join(directory, 'primary');
    const other = await startServer(join(directory, 'other'), 0);
    const children: { child: ChildProcess; exited: Promise<unknown> }[] = [];
    t.after(async () => {
      for (const process of children) {
        if (process.child.exitCode === null && process.child.signalCode === null)
          process.child.kill('SIGTERM');
        await process.exited;
      }
      await other.close();
      await rm(directory, { recursive: true, force: true });
    });
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'runtime.json'),
      JSON.stringify({ origin: other.origin, pid: 0, dataRoot: root }),
    );
    const start = async () => {
      const child = spawn(process.execPath, [main, '--dev'], {
        env: environment(root),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exited = new Promise((done) => child.once('exit', done));
      children.push({ child, exited });
      for (let attempt = 0; attempt < 200; attempt++) {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(output);
        if (output.includes('Codex UX ·')) {
          const saved = JSON.parse(await readFile(join(root, 'runtime.json'), 'utf8')) as {
            origin: string;
            pid: number;
          };
          assert.equal(saved.pid, child.pid);
          return { ...saved, child, exited };
        }
        await delay(25);
      }
      throw new Error(`Service startup timed out: ${output}`);
    };
    const first = await start();
    assert.notEqual(first.origin, other.origin);
    assert.notEqual(new URL(first.origin).port, '0');
    assert.equal((await fetch(first.origin + '/api/health')).status, 200);
    const page = await fetch(first.origin + '/apps/video-editor/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /@vite\/client/);
    assert.equal((await fetch(first.origin + '/apps/video-editor/@vite/client')).status, 200);
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(
        first.origin.replace('http:', 'ws:') + '/apps/video-editor/',
        'vite-hmr',
      );
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('HMR connection timed out.'));
      }, 3000);
      socket.onmessage = (event) => {
        clearTimeout(timeout);
        socket.close();
        if ((JSON.parse(String(event.data)) as { type?: string }).type === 'connected') resolve();
        else reject(new Error('Unexpected HMR handshake.'));
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        socket.close();
        reject(new Error('HMR connection failed.'));
      };
    });
    const sameOrigin = await fetch(first.origin + '/api/workspaces', {
      method: 'POST',
      headers: { Origin: first.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Retained' }),
    });
    assert.equal(sameOrigin.status, 201);
    const repeated = await execute(process.execPath, [main], {
      env: environment(root),
      timeout: 5000,
    });
    assert.match(repeated.stdout, /already running/);
    assert.ok(repeated.stdout.includes(first.origin));
    first.child.kill('SIGTERM');
    await first.exited;
    const restarted = await start();
    assert.equal(restarted.origin, first.origin);
    const workspaces = (await (await fetch(restarted.origin + '/api/workspaces')).json()) as {
      name: string;
    }[];
    assert.equal(workspaces[0]?.name, 'Retained');
    assert.equal((await fetch(other.origin + '/api/health')).status, 200);
  },
);

void test('explicit occupied and invalid ports fail without falling back or leaving a service lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-ux-fixed-port-'));
  const occupied = await startServer(join(directory, 'occupied'), 0);
  const root = join(directory, 'fixed');
  try {
    await assert.rejects(
      execute(process.execPath, [main], {
        env: environment(root, new URL(occupied.origin).port),
        timeout: 5000,
      }),
      (error: unknown) =>
        error instanceof Error && 'stderr' in error && String(error.stderr).includes('EADDRINUSE'),
    );
    await assert.rejects(access(join(root, 'service.lock')), { code: 'ENOENT' });
    await assert.rejects(
      execute(process.execPath, [main], {
        env: environment(root, 'invalid'),
        timeout: 5000,
      }),
      (error: unknown) =>
        error instanceof Error &&
        'stderr' in error &&
        String(error.stderr).includes('CODEX_UX_PORT must be'),
    );
    assert.equal((await fetch(occupied.origin + '/api/health')).status, 200);
  } finally {
    await occupied.close();
    await rm(directory, { recursive: true, force: true });
  }
});
