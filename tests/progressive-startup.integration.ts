import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, cp, readFile, rm, access, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
const execute = promisify(execFile);

void test(
  '3D installs without video/browser tools, survives browser failure, and reopens offline',
  { timeout: 600_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ux progressive 空间 & '));
    const data = join(directory, 'data');
    const cache = join(directory, 'cache');
    const skill = join(directory, 'skills/codex-ux-workspace');
    const app = join(directory, 'skills/codex-ux-3d-space');
    const env = {
      ...process.env,
      CODEX_UX_DATA_DIR: data,
      CODEX_UX_CACHE_DIR: cache,
      CODEX_UX_PORT: '0',
      npm_config_package: 'node@24.20.0',
      CODEX_UX_CHROME: join(directory, 'missing-browser'),
    };
    let pid: number | undefined;
    const run = async (args: string[], overrides = {}) => {
      const result = await execute(
        process.execPath,
        [join(skill, 'scripts/workspace.mjs'), ...args],
        {
          cwd: directory,
          env: { ...env, ...overrides },
          timeout: 180_000,
          maxBuffer: 4 * 1024 ** 2,
        },
      );
      return JSON.parse(result.stdout) as Record<string, unknown>;
    };
    const timings: Record<string, number> = {};
    const browser = await chromium.launch({
      ...(process.env.CODEX_UX_CHROME
        ? { executablePath: process.env.CODEX_UX_CHROME }
        : process.platform === 'darwin'
          ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
          : {}),
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
      await cp(resolve('skills/codex-ux-workspace'), skill, { recursive: true });
      await cp(resolve('skills/codex-ux-3d-space'), app, { recursive: true });
      let started = performance.now();
      const service = await run(['start', '--app', join(app, 'app.json')]);
      timings.coldCore = performance.now() - started;
      pid = (JSON.parse(await readFile(join(data, 'runtime.json'), 'utf8')) as { pid: number }).pid;
      const origin = service.origin as string;
      const runtime = join(cache, 'runtimes', service.runtimeBuild as string);
      const require = createRequire(join(runtime, 'package.json'));
      for (const name of [
        'playwright-core',
        'three',
        '@remotion/renderer',
        'ffmpeg-static',
        '@hyperframes/producer',
      ])
        assert.throws(() => require.resolve(name));
      const workspace = await run(['create', '--name', 'Progressive scene']);
      const invitation = await run([
        'connect',
        '--app',
        '3d-space',
        '--workspace',
        workspace.id as string,
        '--session',
        'progressive-test-session',
      ]);
      const page = await browser.newPage();
      started = performance.now();
      await page.goto(invitation.url as string);
      await page.waitForFunction(
        () =>
          (
            window as unknown as { __sceneEditor?: { state(): { revisionId?: string } } }
          ).__sceneEditor?.state().revisionId,
        undefined,
        { timeout: 90000 },
      );
      timings.sceneReady = performance.now() - started;
      assert.equal((await run(['status', '--code', invitation.code as string])).state, 'connected');
      for (const name of [
        'playwright-core',
        '@remotion/renderer',
        'ffmpeg-static',
        '@hyperframes/producer',
        'parse5',
      ])
        assert.throws(() => require.resolve(name));
      await assert.rejects(access(join(cache, 'browsers')));
      const filesBefore = await readdir(join(cache, 'environments'));
      started = performance.now();
      assert.equal(
        (
          await run(['start', '--app', join(app, 'app.json')], {
            npm_config_registry: 'http://127.0.0.1:1',
          })
        ).origin,
        origin,
      );
      timings.reuse = performance.now() - started;
      assert.deepEqual(await readdir(join(cache, 'environments')), filesBefore);
      // Preparation errors stay scoped: invalid explicitly configured browser, healthy 3D and data.
      await assert.rejects(
        run(['prepare', '--capability', 'browser']),
        /Configured background browser is unavailable/,
      );
      assert.equal(
        (await fetch(`${origin}/api/workspaces/${String(workspace.id)}/apps/3d-space/context`))
          .status,
        200,
      );
      assert.equal((await fetch(origin + '/api/service/stop', { method: 'POST' })).status, 403);
      await page.close();
      const saved = await readFile(
        join(data, 'workspaces', workspace.id as string, 'workspace.json'),
        'utf8',
      );
      // Invalid replacement is rejected before the live service is stopped.
      const manifest = await readFile(join(app, 'app.json'), 'utf8');
      await writeFile(
        join(app, 'app.json'),
        JSON.stringify({
          ...(JSON.parse(manifest) as Record<string, unknown>),
          runtimeBuild: 'invalid',
        }),
      );
      await assert.rejects(run(['restart', '--app', join(app, 'app.json')]), /matching/);
      assert.equal((await fetch(origin + '/api/health')).status, 200);
      await writeFile(join(app, 'app.json'), manifest);
      started = performance.now();
      const restarted = await run(['restart', '--app', join(app, 'app.json')], {
        npm_config_registry: 'http://127.0.0.1:1',
      });
      timings.preparedRestart = performance.now() - started;
      pid = (JSON.parse(await readFile(join(data, 'runtime.json'), 'utf8')) as { pid: number }).pid;
      assert.equal(restarted.origin, origin);
      assert.equal(
        await readFile(join(data, 'workspaces', workspace.id as string, 'workspace.json'), 'utf8'),
        saved,
      );
      assert.equal(
        (await fetch(`${origin}/api/workspaces/${String(workspace.id)}/apps/3d-space/context`))
          .status,
        200,
      );
      await run(['stop']);
      pid = undefined;
      console.log(
        'Progressive startup timings (ms; package store may be warm):',
        JSON.stringify(timings),
      );
    } finally {
      await browser.close();
      if (pid) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          /* Already exited. */
        }
        for (let i = 0; i < 100; i++) {
          try {
            process.kill(pid, 0);
            await new Promise((done) => setTimeout(done, 100));
          } catch {
            break;
          }
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);
