/// <reference lib="dom" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import type { Connection } from '../packages/protocol/src/index.ts';
import type { VideoProject } from '../packages/video-domain/src/schema.ts';

const execute = promisify(execFile);
void test(
  'installed skills run outside the repository, pair a real page and preserve workspace data',
  { timeout: 900_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-ux-installed-'));
    const data = join(directory, 'data');
    const workspaceSkill = join(directory, 'skills/codex-ux-workspace');
    const videoSkill = join(directory, 'skills/codex-ux-video-editor');
    const task = randomUUID();
    let pid: number | undefined;
    const env = {
      ...process.env,
      CODEX_UX_DATA_DIR: data,
      CODEX_UX_CACHE_DIR: process.env.CODEX_UX_CACHE_DIR ?? join(directory, 'cache'),
      CODEX_THREAD_ID: task,
      CODEX_UX_PORT: '0',
    };
    const run = async (...args: string[]) => {
      const result = await execute(
        process.execPath,
        [join(workspaceSkill, 'scripts/workspace.ts'), ...args],
        {
          cwd: directory,
          env,
          timeout: 600_000,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      return JSON.parse(result.stdout) as Record<string, unknown>;
    };
    const browser = await chromium.launch({
      ...(process.env.CODEX_UX_CHROME
        ? { executablePath: process.env.CODEX_UX_CHROME }
        : process.platform === 'darwin'
          ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
          : {}),
    });
    try {
      await cp(resolve('skills/codex-ux-workspace'), workspaceSkill, { recursive: true });
      await cp(resolve('skills/codex-ux-video-editor'), videoSkill, { recursive: true });
      const started = await run('start', '--app', join(videoSkill, 'app.json'));
      const origin = started.origin as string;
      const located = await run('locate');
      assert.equal(located.state, 'ready');
      assert.equal(located.origin, origin);
      assert.equal(located.apiBase, `${origin}/api`);
      assert.equal(located.dataRoot, data);
      pid = (JSON.parse(await readFile(join(data, 'runtime.json'), 'utf8')) as { pid: number }).pid;
      const again = await run('start', '--app', join(videoSkill, 'app.json'));
      assert.equal(again.origin, origin);
      assert.equal(
        (JSON.parse(await readFile(join(data, 'runtime.json'), 'utf8')) as { pid: number }).pid,
        pid,
      );
      const created = await run('create', '--name', 'Installed project');
      const base = `${origin}/api/workspaces/${String(created.id)}/apps/video-editor`;
      const post = async (url: string, body: unknown) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.ok, true, await response.clone().text());
        return response.json() as Promise<Record<string, unknown>>;
      };
      const project = (await post(base, {})) as unknown as VideoProject;
      const invitation = await run('connect', '--workspace', String(created.id));
      const page = await browser.newPage();
      await page.goto(invitation.url as string);
      let receipt: Record<string, unknown> = {};
      for (let i = 0; i < 20; i++) {
        receipt = await run('status', '--code', invitation.code as string);
        if (receipt.state === 'connected') break;
        await new Promise((done) => setTimeout(done, 250));
      }
      assert.equal(receipt.state, 'connected');
      assert.equal((receipt.session as Connection['session'])?.sessionId, task);
      assert.equal(receipt.workspaceId, created.id);
      await page.waitForFunction(
        (id) =>
          document.querySelector<HTMLIFrameElement>(`iframe[data-revision="${id}"]`)?.style
            .opacity === '1',
        project.revisionId,
      );
      // Import and compile from the installed runtime, with no repository node_modules in its source tree.
      const source = join(directory, 'remotion');
      await mkdir(source);
      await writeFile(
        join(source, 'video.json'),
        JSON.stringify({
          kind: 'remotion',
          entry: 'Video.tsx',
          width: 320,
          height: 180,
          fps: 10,
          durationInFrames: 5,
        }),
      );
      await writeFile(
        join(source, 'Video.tsx'),
        'import React from "react"; export default function Video(){return <div style={{background:"#16352b",color:"white",width:320,height:180}}>Installed Remotion</div>}',
      );
      const imported = (await post(base + '/source', {
        baseRevision: project.revisionId,
        path: source,
      })) as unknown as VideoProject;
      await page.waitForFunction(
        (id) =>
          document.querySelector<HTMLIFrameElement>(`iframe[data-revision="${id}"]`)?.style
            .opacity === '1',
        imported.revisionId,
        { timeout: 30000 },
      );
      const exported = await post(base + '/exports', { revisionId: imported.revisionId });
      let job = exported;
      for (let i = 0; i < 120 && job.state === 'rendering'; i++) {
        await new Promise((done) => setTimeout(done, 500));
        job = (await (await fetch(base + '/exports/' + String(exported.id))).json()) as Record<
          string,
          unknown
        >;
      }
      assert.equal(job.state, 'complete', JSON.stringify(job));
      const identityBefore = await readFile(
        join(data, 'workspaces', String(created.id), 'workspace.json'),
        'utf8',
      );
      const manifest = JSON.parse(await readFile(join(videoSkill, 'app.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      await writeFile(
        join(videoSkill, 'app.json'),
        JSON.stringify({ ...manifest, runtimeBuild: 'wrong-version' }),
      );
      await assert.rejects(
        run('start', '--app', join(videoSkill, 'app.json')),
        /matching Workspace/,
      );
      assert.equal(
        await readFile(join(data, 'workspaces', String(created.id), 'workspace.json'), 'utf8'),
        identityBefore,
      );
      assert.equal((await fetch(base)).ok, true);
      const servedBefore = await (await fetch(origin + '/apps/video-editor/')).text();
      await writeFile(join(videoSkill, 'dist/index.html'), '<p>Incomplete skill update</p>');
      assert.equal(await (await fetch(origin + '/apps/video-editor/')).text(), servedBefore);
      await writeFile(join(videoSkill, 'app.json'), JSON.stringify(manifest));
      await assert.rejects(
        run('start', '--app', join(videoSkill, 'app.json')),
        /incomplete or changed/,
      );
    } finally {
      await browser.close();
      if (pid) {
        process.kill(pid, 'SIGTERM');
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
