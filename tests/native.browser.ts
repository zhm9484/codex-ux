/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, copyFile, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVideo } from './browser-helpers.ts';
import type { VideoProject } from '../packages/video-domain/src/schema.ts';

const require = createRequire(new URL('../packages/local-server/package.json', import.meta.url));
const program = `import { message } from './lib/message.js';
document.querySelector('#caption').dataset.moduleLoaded = message;
const ctx = document.querySelector('canvas').getContext('2d'); ctx.fillStyle = '#555'; ctx.fillRect(5,5,30,30);
window.__timelines = window.__timelines || {}; window.__timelines.main = gsap.timeline({paused:true}).to({}, {duration:8});`;

test('native projects preserve runtime dependencies, UI edits and drafts through external updates and errors', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const input = await mkdtemp(join(tmpdir(), 'video-editor-browser-'));
  try {
    await mkdir(join(input, 'lib'));
    await mkdir(join(input, 'scenes'));
    await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(input, 'gsap.js'));
    await writeFile(
      join(input, 'style.css'),
      'html,body{margin:0;width:640px;height:360px}#root{width:640px;height:360px;background:#faf8f2;position:relative}#caption{position:absolute;top:120px;left:60px;font:40px Georgia;color:#222}canvas{position:absolute;right:30px;top:30px}[data-composition-src]{pointer-events:none}',
    );
    await writeFile(join(input, 'lib/message.js'), 'export const message = "modules work";');
    await writeFile(join(input, 'app.js'), program);
    await writeFile(
      join(input, 'scenes/detail.html'),
      '<template><div data-composition-id="detail" data-width="640" data-height="360" data-duration="8"><p id="detail" style="position:absolute;bottom:20px;left:60px;font:14px Arial">Nested detail</p></div><script>window.__timelines = window.__timelines || {}; window.__timelines.detail = gsap.timeline({paused:true}).to({}, {duration:8});</script></template>',
    );
    await writeFile(join(input, 'payload.bin'), Buffer.from([10, 44, 255]));
    await writeFile(
      join(input, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="style.css"><script src="gsap.js"></script></head><body><div id="root" data-composition-id="main" data-width="640" data-height="360" data-duration="8"><p id="caption" data-start="0" data-duration="8">Native title</p><canvas width="60" height="60"></canvas><div data-composition-id="detail" data-composition-src="scenes/detail.html" data-start="0" data-duration="8" data-width="640" data-height="360"></div></div><script type="module" src="app.js"></script><!-- unchanged sentinel --></body></html>',
    );
    const initial = await createVideo(request, 'Native verification');
    const base = `/api/workspaces/${initial.workspaceId}/apps/video-editor`;
    const imported = await request.post(`${base}/source`, {
      data: { directory: input, baseRevision: initial.revisionId },
    });
    expect(imported.ok()).toBe(true);
    const original = (await imported.json()) as VideoProject;
    const source = (await (await request.get(`${base}/source`)).json()) as { directory: string };
    const read = async () => (await (await request.get(base)).json()) as VideoProject;
    await page.goto(`/apps/video-editor/w/${initial.workspaceId}`);
    const frame = () => page.frameLocator('iframe');
    await expect(frame().locator('#caption')).toHaveAttribute('data-module-loaded', 'modules work');
    await expect(frame().locator('p#detail')).toHaveText('Nested detail');
    await frame().locator('#caption').dblclick();
    await frame().getByRole('textbox', { name: 'Canvas text' }).fill('Edited natively');
    await page.locator('.app-header').click({ position: { x: 500, y: 25 } });
    await expect
      .poll(async () => (await read()).revision.document.native!.files['index.html']!.text)
      .toContain('Edited natively');
    await expect(page.locator('hyperframes-player')).toHaveCount(1);
    await expect(frame().locator('#caption')).toHaveText('Edited natively');
    expect(await readFile(join(source.directory, 'app.js'), 'utf8')).toBe(program);
    const current = await read();
    await request.post(`${base}/notes`, {
      data: {
        text: 'Original note',
        anchor: { revisionId: original.revisionId, start: 3, end: 3 },
      },
    });
    const strip = (await page.locator('.scene-strip').boundingBox())!;
    await page.locator('.scene-strip').click({ position: { x: (strip.width * 3) / 8, y: 20 } });
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await page.getByRole('textbox', { name: 'Feedback note' }).fill('Keep my unsent draft');
    await writeFile(
      join(source.directory, 'style.css'),
      (await readFile(join(source.directory, 'style.css'), 'utf8')) + '\n#root{background:#efedf4}',
    );
    await expect
      .poll(async () => (await read()).revisionId, { timeout: 10000 })
      .not.toBe(current.revisionId);
    const updated = await read();
    await expect(
      page.locator(`hyperframes-player[data-revision="${updated.revisionId}"]`),
    ).toHaveCSS('opacity', '1');
    await expect(page.locator('hyperframes-player')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Feedback note' })).toHaveValue(
      'Keep my unsent draft',
    );
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('.current-time')).toHaveText('00:03:00');
    await expect(frame().locator('#root')).toHaveCSS('background-color', 'rgb(239, 237, 244)');
    expect(updated.notes[0]!.anchor.revisionId).toBe(original.revisionId);
    await page.screenshot({ path: '.codex-ux/native-preview.png' });
    await page.getByRole('button', { name: 'Save note' }).click();
    expect((await read()).notes.at(-1)!.anchor.revisionId).toBe(current.revisionId);
    await writeFile(join(source.directory, 'app.js'), 'throw new Error("Broken external script");');
    await expect(page.locator('.preview-error')).toBeVisible({ timeout: 18000 });
    await expect(page.locator('hyperframes-player').first()).toHaveCSS('opacity', '1');
    await writeFile(join(source.directory, 'app.js'), program);
    await expect(page.locator('.preview-error')).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator('hyperframes-player')).toHaveCount(1);
    await expect(page.locator('.current-time')).toHaveText('00:03:00');
    await frame().locator('#caption').dblclick();
    await frame().getByRole('textbox', { name: 'Canvas text' }).press('Escape');
    await page.getByRole('button', { name: 'Timeline: Edited natively' }).dblclick();
    await expect(page.locator('.text-selection')).toBeVisible();
    await page.keyboard.press('Delete');
    await expect
      .poll(async () => (await read()).revision.document.native!.files['index.html']!.text)
      .not.toContain('Edited natively');
    await page.getByRole('button', { name: 'Undo (⌘Z)', exact: true }).click();
    await expect
      .poll(async () => (await read()).revision.document.native!.files['index.html']!.text)
      .toContain('Edited natively');
    const forExport = await read();
    const exportResponse = await request.post(`${base}/exports`, {
      data: { revisionId: forExport.revisionId },
    });
    expect(exportResponse.ok()).toBe(true);
    const job = (await exportResponse.json()) as { id: string };
    await expect
      .poll(
        async () =>
          ((await (await request.get(`${base}/exports/${job.id}`)).json()) as { state: string })
            .state,
        {
          timeout: 60000,
        },
      )
      .toBe('complete');
    const result = (await (await request.get(`${base}/exports/${job.id}`)).json()) as {
      url: string;
    };
    expect((await (await request.get(result.url)).body()).length).toBeGreaterThan(1000);
  } finally {
    await rm(input, { recursive: true, force: true });
  }
});
