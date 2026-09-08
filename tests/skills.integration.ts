/// <reference lib="dom" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
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
    const sceneSkill = join(directory, 'skills/codex-ux-3d-space');
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
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      ...(process.env.CODEX_UX_CHROME
        ? { executablePath: process.env.CODEX_UX_CHROME }
        : process.platform === 'darwin'
          ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
          : {}),
    });
    try {
      await cp(resolve('skills/codex-ux-workspace'), workspaceSkill, { recursive: true });
      await cp(resolve('skills/codex-ux-video-editor'), videoSkill, { recursive: true });
      await cp(resolve('skills/codex-ux-3d-space'), sceneSkill, { recursive: true });
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
      const sceneStarted = await run('start', '--app', join(sceneSkill, 'app.json'));
      assert.equal(sceneStarted.origin, origin);
      const scene = await post(`${origin}/api/workspaces/${String(created.id)}/apps/3d-space`, {});
      const sceneInvitation = await run(
        'connect',
        '--workspace',
        String(created.id),
        '--app',
        '3d-space',
      );
      const scenePage = await browser.newPage();
      await scenePage.goto(sceneInvitation.url as string);
      await scenePage.waitForFunction(
        (id) =>
          (
            window as unknown as {
              __sceneEditor?: { state: () => { revisionId: string; objects: unknown[] } };
            }
          ).__sceneEditor?.state().revisionId === id,
        scene.revisionId,
        { timeout: 30000 },
      );
      const sceneReceipt = await run('status', '--code', sceneInvitation.code as string);
      assert.equal(sceneReceipt.state, 'connected');
      assert.equal(sceneReceipt.appId, '3d-space');
      await scenePage.close();
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
      // Exercise the separate Hyperframes exporter and encoding environment in the installed runtime.
      const hyperframes = join(directory, 'hyperframes');
      await mkdir(hyperframes);
      await cp(
        createRequire(new URL('../packages/local-server/package.json', import.meta.url)).resolve(
          'gsap/dist/gsap.min.js',
        ),
        join(hyperframes, 'gsap.js'),
      );
      await writeFile(
        join(hyperframes, 'index.html'),
        '<!doctype html><html><body style="margin:0"><main data-composition-id="test" data-width="320" data-height="180" data-duration="0.5" style="width:320px;height:180px;background:#16352b;color:white">Installed export</main><script src="gsap.js"></script><script>window.__timelines = {test: gsap.timeline({paused:true}).to({}, {duration:0.5})};</script></body></html>',
      );
      const hyperframeProject = (await post(base + '/source', {
        baseRevision: project.revisionId,
        path: hyperframes,
      })) as unknown as VideoProject;
      let hyperframeExport = await post(base + '/exports', {
        revisionId: hyperframeProject.revisionId,
      });
      for (let i = 0; i < 600 && hyperframeExport.state === 'rendering'; i++) {
        await new Promise((done) => setTimeout(done, 500));
        hyperframeExport = (await (
          await fetch(base + '/exports/' + String(hyperframeExport.id))
        ).json()) as Record<string, unknown>;
      }
      assert.equal(hyperframeExport.state, 'complete', JSON.stringify(hyperframeExport));

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
        baseRevision: hyperframeProject.revisionId,
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
      const ownership = JSON.parse(await readFile(join(data, 'runtime.json'), 'utf8')) as {
        control: string;
      };
      const stopWhileExporting = await fetch(origin + '/api/service/stop', {
        method: 'POST',
        headers: { 'x-codex-ux-control': ownership.control },
      });
      assert.equal(
        stopWhileExporting.status,
        409,
        'active export must not be interrupted by restart',
      );
      let job = exported;
      for (let i = 0; i < 600 && job.state === 'rendering'; i++) {
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
