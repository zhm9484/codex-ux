/// <reference lib="dom" />
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mediaBinaries, probeVideo } from '../packages/local-server/src/video/probe.ts';
import type { ExportJob, VideoProject } from '../packages/video-domain/src/schema.ts';
import { createVideo } from './browser-helpers.ts';
const execute = promisify(execFile);
const base = (id: string) => `/api/workspaces/${id}/apps/video-editor`;
async function read(request: APIRequestContext, id: string) {
  return (await (await request.get(base(id))).json()) as VideoProject;
}
async function displayed(page: Page, project: VideoProject) {
  await expect(page.locator(`iframe[data-revision="${project.revisionId}"]`)).toHaveCSS(
    'opacity',
    '1',
    { timeout: 45000 },
  );
  await expect(page.locator('iframe[data-revision]')).toHaveCount(1);
}
async function exportVideo(request: APIRequestContext, project: VideoProject, directory: string) {
  const response = await request.post(`${base(project.workspaceId)}/exports`, {
    data: { revisionId: project.revisionId },
  });
  expect(response.ok()).toBe(true);
  let job = (await response.json()) as ExportJob;
  await expect
    .poll(
      async () => {
        job = (await (
          await request.get(`${base(project.workspaceId)}/exports/${job.id}`)
        ).json()) as ExportJob;
        return job.state;
      },
      { timeout: 90000 },
    )
    .not.toBe('rendering');
  expect(job.error).toBeUndefined();
  expect(job.state).toBe('complete');
  const bytes = await (await request.get(job.url!)).body();
  const file = join(directory, `${job.id}.mp4`);
  await writeFile(file, bytes);
  return { bytes, metadata: await probeVideo(file) };
}
const source = (
  message: string,
) => `import React from 'react';import {AbsoluteFill,useCurrentFrame,Img,staticFile} from 'remotion';import './video.css';
export default function Video(){const frame=useCurrentFrame();return <AbsoluteFill className="film"><p id="message">${message}</p><p id="frame">{frame}</p><Img src={staticFile('pixel.png')} style={{width:30,height:30}}/></AbsoluteFill>}`;

test('Remotion source updates, seeks, compares immutable builds, recovers from errors and exports', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const directory = await mkdtemp(join(tmpdir(), 'video-remotion-'));
  let releaseImage = () => {};
  const imageGate = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  let imageRequested = false;
  try {
    await mkdir(join(directory, 'public'));
    await writeFile(
      join(directory, 'public/pixel.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5F8AAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await writeFile(
      join(directory, 'video.css'),
      '.film{background:rgb(20,40,60);color:white;font:30px sans-serif;padding:20px}',
    );
    await writeFile(join(directory, 'Video.tsx'), source('First composition'));
    await writeFile(
      join(directory, 'video.json'),
      JSON.stringify({
        kind: 'remotion',
        entry: 'Video.tsx',
        width: 640,
        height: 360,
        fps: 25,
        durationInFrames: 50,
      }),
    );
    const initial = await createVideo(request, 'Remotion source');
    await page.goto(`/apps/video-editor/w/${initial.workspaceId}`);
    await displayed(page, initial);
    await page.route('**/source/public/pixel.png', async (route) => {
      imageRequested = true;
      await imageGate;
      await route.continue();
    });
    expect(
      (
        await request.post(`${base(initial.workspaceId)}/source`, {
          data: { path: directory, baseRevision: initial.revisionId },
        })
      ).ok(),
    ).toBe(true);
    await expect
      .poll(async () => (await read(request, initial.workspaceId)).revision.document.source.kind, {
        timeout: 45000,
      })
      .toBe('remotion');
    const first = await read(request, initial.workspaceId);
    await expect.poll(() => imageRequested, { timeout: 30000 }).toBe(true);
    await expect(page.locator(`iframe[data-revision="${initial.revisionId}"]`)).toHaveCSS(
      'opacity',
      '1',
    );
    await expect(page.getByRole('slider', { name: 'Video position' })).toHaveAttribute(
      'aria-valuemax',
      '18',
    );
    releaseImage();
    await displayed(page, first);
    await page.keyboard.press('Escape');
    const frame = page.frameLocator('iframe[data-revision]');
    await expect(frame.locator('#message')).toHaveText('First composition');
    await expect(frame.locator('.film')).toHaveCSS('background-color', 'rgb(20, 40, 60)');
    expect(
      await frame.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBe(1);
    const strip = page.getByRole('slider', { name: 'Video position' });
    const box = (await strip.boundingBox())!;
    await strip.click({ position: { x: box.width * 0.6, y: 20 } });
    await expect(frame.locator('#frame')).toHaveText('30');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(async () => Number(await frame.locator('#frame').innerText()))
      .toBeGreaterThan(30);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await page.getByRole('textbox', { name: 'Chat message' }).fill('Crossfade into the next shot');
    await page.getByRole('combobox', { name: 'Request kind' }).selectOption('transition');
    await page.getByRole('spinbutton', { name: 'Transition duration' }).fill('0.4');
    const working = (
      (await (await request.get(`${base(initial.workspaceId)}/source`)).json()) as {
        directory: string;
      }
    ).directory;
    await writeFile(join(working, 'Video.tsx'), source('Updated composition'));
    await expect
      .poll(async () => (await read(request, initial.workspaceId)).revisionId, { timeout: 45000 })
      .not.toBe(first.revisionId);
    const second = await read(request, initial.workspaceId);
    await displayed(page, second);
    await expect(frame.locator('#message')).toHaveText('Updated composition');
    await page.getByRole('button', { name: 'Add note to list', exact: true }).click();
    await expect.poll(async () => (await read(request, initial.workspaceId)).notes.length).toBe(1);
    const note = (await read(request, initial.workspaceId)).notes[0]!;
    expect(note.anchor.revisionId).toBe(first.revisionId);
    expect(note.intent).toEqual({ kind: 'transition', duration: 0.4 });
    const earlier = await page.context().newPage();
    await earlier.goto(
      `/media/video-editor/preview/${initial.workspaceId}/${first.revisionId}/player.html?time=1.2`,
    );
    await expect(earlier.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(earlier.locator('#message')).toHaveText('First composition');
    await expect(earlier.locator('#frame')).toHaveText('30');
    await earlier.close();
    await writeFile(join(working, 'Video.tsx'), 'export default function Video( { syntax error');
    await expect
      .poll(async () => (await read(request, initial.workspaceId)).source?.error, {
        timeout: 30000,
      })
      .toBeTruthy();
    expect((await read(request, initial.workspaceId)).revisionId).toBe(second.revisionId);
    await expect(frame.locator('#message')).toHaveText('Updated composition');
    await writeFile(
      join(working, 'Video.tsx'),
      "export default function Video(){throw new Error('Broken composition');}",
    );
    await expect(page.locator('.preview-error')).toContainText('Broken composition', {
      timeout: 45000,
    });
    await expect(page.locator(`iframe[data-revision="${second.revisionId}"]`)).toHaveCSS(
      'opacity',
      '1',
    );
    await expect(page.getByRole('slider', { name: 'Video position' })).toHaveAttribute(
      'aria-valuemax',
      '2',
    );
    await writeFile(
      join(working, 'Video.tsx'),
      "throw new Error('Module initialization failed');export default function Video(){return null}",
    );
    await expect(page.locator('.preview-error')).toContainText('Module initialization failed', {
      timeout: 45000,
    });
    await writeFile(join(working, 'Video.tsx'), source('Recovered composition'));
    await writeFile(
      join(working, 'video.json'),
      JSON.stringify({
        kind: 'remotion',
        entry: 'Video.tsx',
        width: 360,
        height: 640,
        fps: 25,
        durationInFrames: 75,
      }),
    );
    await expect
      .poll(async () => (await read(request, initial.workspaceId)).revision.document.duration, {
        timeout: 45000,
      })
      .toBe(3);
    const recovered = await read(request, initial.workspaceId);
    await displayed(page, recovered);
    await expect(frame.locator('#message')).toHaveText('Recovered composition');
    await expect(page.getByRole('slider', { name: 'Video position' })).toHaveAttribute(
      'aria-valuemax',
      '3',
    );
    const ratio = (await page.locator('.stage-canvas').boundingBox())!;
    expect(ratio.width / ratio.height).toBeCloseTo(360 / 640, 2);
    const originalExport = await exportVideo(request, first, directory);
    expect(originalExport.metadata).toMatchObject({ width: 640, height: 360 });
    expect(Math.abs(originalExport.metadata.duration - 2)).toBeLessThan(0.1);
    const changedExport = await exportVideo(request, recovered, directory);
    expect(changedExport.metadata).toMatchObject({ width: 360, height: 640 });
    expect(Math.abs(changedExport.metadata.duration - 3)).toBeLessThan(0.1);
  } finally {
    releaseImage();
    await rm(directory, { recursive: true, force: true });
  }
});

test('direct video replacement keeps seconds, audio, old notes, original export and undo', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'video-media-'));
  try {
    const firstFile = join(directory, 'first.mp4'),
      secondFile = join(directory, 'second.mp4');
    for (const [path, size, duration, color] of [
      [firstFile, '640x360', '2', 'red'],
      [secondFile, '360x640', '3', 'blue'],
    ] as const) {
      await execute(
        mediaBinaries().ffmpeg,
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=${color}:s=${size}:r=25`,
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:sample_rate=48000',
          '-t',
          duration,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          path,
        ],
        { timeout: 30000 },
      );
    }
    const initial = await createVideo(request, 'Direct video');
    await page.goto(`/apps/video-editor/w/${initial.workspaceId}`);
    await displayed(page, initial);
    expect(
      (
        await request.post(`${base(initial.workspaceId)}/source/media`, {
          data: await readFile(firstFile),
          headers: {
            'Content-Type': 'video/mp4',
            'X-File-Name': 'replacement.mp4',
            'X-Base-Revision': (await read(request, initial.workspaceId)).revisionId,
          },
        })
      ).ok(),
    ).toBe(true);
    await expect
      .poll(async () => (await read(request, initial.workspaceId)).revision.document.source.kind)
      .toBe('media');
    const first = await read(request, initial.workspaceId);
    expect(first.revision.document.fps).toBeNull();
    await displayed(page, first);
    await page.keyboard.press('Escape');
    const video = page.frameLocator('iframe[data-revision]').locator('video');
    expect(await video.evaluate((video) => (video as HTMLVideoElement).muted)).toBe(false);
    await page.getByRole('button', { name: 'Mute', exact: true }).click();
    expect(await video.evaluate((video) => (video as HTMLVideoElement).muted)).toBe(true);
    const strip = page.getByRole('slider', { name: 'Video position' });
    await strip.focus();
    await strip.press('ArrowLeft');
    await expect(page.locator('.current-time')).toHaveText(/\d\d:\d\d\.\d{3}/);
    await request.post(`${base(initial.workspaceId)}/notes`, {
      data: {
        text: 'Keep the original opening',
        intent: { kind: 'change' },
        anchor: { revisionId: first.revisionId, start: 0.5, end: 1.5 },
      },
    });
    expect(
      (
        await request.post(`${base(initial.workspaceId)}/source/media`, {
          data: await readFile(secondFile),
          headers: {
            'Content-Type': 'video/mp4',
            'X-File-Name': 'replacement.mp4',
            'X-Base-Revision': (await read(request, initial.workspaceId)).revisionId,
          },
        })
      ).ok(),
    ).toBe(true);
    await expect
      .poll(async () => (await read(request, initial.workspaceId)).revision.document.width)
      .toBe(360);
    const second = await read(request, initial.workspaceId);
    await displayed(page, second);
    expect(second.notes[0]!.anchor.revisionId).toBe(first.revisionId);
    const result = await exportVideo(request, first, directory);
    expect(result.bytes).toEqual(await readFile(firstFile));
    const range = await request.get(
      `/media/video-editor/preview/${initial.workspaceId}/${first.revisionId}/source/${first.revision.document.source.entry}`,
      { headers: { Range: 'bytes=0-31' } },
    );
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(32);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Undo (⌘Z)', exact: true }).click();
    await displayed(page, first);
    expect((await read(request, initial.workspaceId)).revisionId).toBe(first.revisionId);
    await expect(page.getByRole('slider', { name: 'Video position' })).toHaveAttribute(
      'aria-valuemax',
      String(first.revision.document.duration),
    );
    await page.screenshot({ path: '.codex-ux/direct-video.png' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
