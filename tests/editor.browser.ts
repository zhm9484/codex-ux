/// <reference lib="dom" />
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { createVideo } from './browser-helpers.ts';
import type { VideoProject } from '../packages/video-domain/src/schema.ts';

async function createWorkspace(request: APIRequestContext) {
  return createVideo(request, 'Browser verification', 'structured');
}
async function readWorkspace(request: APIRequestContext, id: string) {
  return (await (
    await request.get(`/api/workspaces/${id}/apps/video-editor`)
  ).json()) as VideoProject;
}

async function readyPreview(page: Page, request: APIRequestContext, id: string) {
  const revision = (await readWorkspace(request, id)).revisionId;
  await expect(page.locator(`hyperframes-player[data-revision="${revision}"]`).last()).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.locator('hyperframes-player')).toHaveCount(1);
}

test('canvas titles edit, drag, resize and undo without timeline editing controls', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  const read = () => readWorkspace(request, workspace.workspaceId);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**', (route) => route.abort());
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  const frame = page.frameLocator('iframe');
  const title = () => frame.locator('#title-1 span');
  await expect(page.getByRole('textbox', { name: 'Feedback note' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Split at playhead' })).toHaveCount(0);
  await page.locator('hyperframes-player').evaluate((element) => {
    (element as HTMLElement).dataset.testIdentity = 'original-player';
  });
  await title().dblclick();
  await frame.getByRole('textbox', { name: 'Canvas text' }).fill('Made together.');
  await page.locator('.app-header').click({ position: { x: 600, y: 30 } });
  await expect
    .poll(async () => (await read()).revision.document.clips.find((c) => c.id === 'title-1')?.text)
    .toBe('Made together.');
  await readyPreview(page, request, workspace.workspaceId);
  await expect(page.locator('hyperframes-player')).toHaveAttribute(
    'data-test-identity',
    'original-player',
  );
  await title().click();
  let box = (await title().boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 45, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await read()).revision.document.clips.find((c) => c.id === 'title-1')!.x)
    .toBeGreaterThan(6);
  await readyPreview(page, request, workspace.workspaceId);
  await page.getByRole('button', { name: 'Resize text se' }).click({ trial: true });
  box = (await page.getByRole('button', { name: 'Resize text se' }).boundingBox())!;
  await page.mouse.move(box.x + 9, box.y + 9);
  await page.mouse.down();
  await page.mouse.move(box.x + 89, box.y + 9, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(
      async () => (await read()).revision.document.clips.find((c) => c.id === 'title-1')!.fontSize,
    )
    .toBeGreaterThan(100);
  const enlargedWidth = (await page.locator('.text-selection').boundingBox())!.width;
  await page.getByRole('button', { name: 'Undo (⌘Z)', exact: true }).click();
  await expect
    .poll(
      async () => (await read()).revision.document.clips.find((c) => c.id === 'title-1')!.fontSize,
    )
    .toBe(100);
  await readyPreview(page, request, workspace.workspaceId);
  expect((await page.locator('.text-selection').boundingBox())!.width).toBeLessThan(enlargedWidth);
  await page.locator('.app-header').click({ position: { x: 600, y: 30 } });
  await expect(page.locator('.text-selection')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('HTML scene captions are editable, movable, font-selectable and durable', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  const read = () => readWorkspace(request, workspace.workspaceId);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  const frame = page.frameLocator('iframe');
  const edition = () => frame.locator('.art-opening .edition');
  await edition().dblclick();
  await frame.getByRole('textbox', { name: 'Canvas text' }).fill('FIELDNOTES / A NEW EDITION');
  await page.locator('.app-header').click({ position: { x: 600, y: 30 } });
  await expect
    .poll(async () => (await read()).revision.document.sources.opening)
    .toContain('A NEW EDITION');
  await readyPreview(page, request, workspace.workspaceId);
  await edition().click();
  await page.getByRole('button', { name: 'Typeface' }).click();
  await page.getByRole('option', { name: 'Avenir Next', exact: true }).click();
  await expect
    .poll(async () => (await read()).revision.document.sources.opening)
    .toContain('Avenir Next');
  await readyPreview(page, request, workspace.workspaceId);
  const box = (await edition().boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await read()).revision.document.sources.opening)
    .toMatch(/translate: (?!0px 0px)/);
  await page.reload();
  await expect(edition()).toHaveText('FIELDNOTES / A NEW EDITION');
  await expect(edition()).toHaveCSS('font-family', '"Avenir Next"');
  const footer = frame.locator('.art-opening .folio span').first();
  await footer.click();
  await expect(page.locator('.text-selection')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-selection')).toHaveCount(0);
});

test('range and region comments open chat on demand and keep their original reference', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  await expect(page.locator('.scene-strip .clip-thumbnail')).toHaveCount(3, { timeout: 20000 });
  const strip = (await page.locator('.scene-strip').boundingBox())!;
  await page.mouse.move(strip.x + strip.width / 6, strip.y + 20);
  await page.mouse.down();
  await page.mouse.move(strip.x + (strip.width * 5) / 18, strip.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole('textbox', { name: 'Feedback note' })).toBeHidden();
  const noteAction = page.getByRole('button', { name: 'Add note', exact: true });
  const actionBox = (await noteAction.boundingBox())!;
  expect(actionBox.x).toBeGreaterThan(strip.x + (strip.width * 5) / 18);
  await noteAction.click();
  await page.getByRole('textbox', { name: 'Feedback note' }).fill('Let this moment breathe.');
  await page.locator('.scene-strip').click({ position: { x: (strip.width * 8) / 18, y: 20 } });
  await expect(page.getByRole('textbox', { name: 'Feedback note' })).toBeHidden();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  const saved = await readWorkspace(request, workspace.workspaceId);
  expect(saved.notes[0]?.anchor).toMatchObject({ start: 3, end: 5 });
  const canvas = (await page.locator('.stage-canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width * 0.65, canvas.y + canvas.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.9, canvas.y + canvas.height * 0.6, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.getByRole('textbox', { name: 'Feedback note' })).toBeHidden();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Feedback note' }).fill('Move this detail.');
  await page.getByRole('button', { name: 'Save note' }).click();
  expect(
    (await readWorkspace(request, workspace.workspaceId)).notes.at(-1)?.anchor.region,
  ).toMatchObject({
    width: expect.any(Number),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Feedback note' }).press('Escape');
  await expect(page.getByRole('textbox', { name: 'Feedback note' })).toBeHidden();
});

test('playhead paints between runtime samples and replacement previews retain the previous frame', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  await expect(page.locator('.preview-loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const positions = await page.evaluate(async () => {
    const values: string[] = [];
    for (let i = 0; i < 24; i++) {
      await new Promise(requestAnimationFrame);
      values.push((document.querySelector('.strip-playhead') as HTMLElement).style.left);
    }
    return values;
  });
  expect(new Set(positions).size).toBeGreaterThan(18);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await frame.locator('#title-1 span').dblclick();
  await frame.getByRole('textbox', { name: 'Canvas text' }).fill('Discard this.');
  await frame.getByRole('textbox', { name: 'Canvas text' }).press('Escape');
  expect((await readWorkspace(request, workspace.workspaceId)).revisionId).toBe(
    workspace.revisionId,
  );
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pending = false;
  await page.route(
    `**/media/video-editor/preview/${workspace.workspaceId}/*/index.html`,
    async (route) => {
      pending = true;
      await gate;
      await route.continue();
    },
  );
  const before = await readWorkspace(request, workspace.workspaceId);
  await request.post(`/api/workspaces/${workspace.workspaceId}/apps/video-editor/revisions`, {
    data: {
      requestId: crypto.randomUUID(),
      baseRevision: before.revisionId,
      label: 'External source update',
      document: {
        ...before.revision.document,
        clips: before.revision.document.clips.map((clip) =>
          clip.id === 'title-1' ? { ...clip, text: 'A clearer thought.' } : clip,
        ),
      },
    },
  });
  await expect.poll(() => pending).toBe(true);
  await expect(page.locator('hyperframes-player')).toHaveCount(2);
  await expect(page.locator('hyperframes-player').first()).toHaveCSS('opacity', '1');
  release();
  await readyPreview(page, request, workspace.workspaceId);
  await expect(frame.locator('#title-1 span')).toHaveText('A clearer thought.');
});

test('file drops import once, drafts survive closing chat and history compares saved edits', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  await expect(page.locator('.preview-loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Feedback note' });
  await note.fill('Keep this draft.');
  await page.getByRole('button', { name: 'Close chat' }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(note).toHaveValue('Keep this draft.');
  expect((await readWorkspace(request, workspace.workspaceId)).notes).toHaveLength(0);
  async function drop(target: Locator, name: string) {
    await target.evaluate((element, name) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5F8AAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      );
      transfer.items.add(new File([bytes], name, { type: 'image/png' }));
      for (const type of ['dragenter', 'drop'])
        element.dispatchEvent(
          new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
    }, name);
  }
  await drop(page.frameLocator('iframe').locator('body'), 'Canvas.png');
  await expect
    .poll(async () =>
      (await readWorkspace(request, workspace.workspaceId)).revision.document.assets.map(
        (a) => a.name,
      ),
    )
    .toEqual(['Canvas.png']);
  await drop(page.locator('.asset-drop'), 'Panel.png');
  await expect
    .poll(async () =>
      (await readWorkspace(request, workspace.workspaceId)).revision.document.assets.map(
        (a) => a.name,
      ),
    )
    .toEqual(['Canvas.png', 'Panel.png']);
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).last().click();
  await expect(page.locator('.stage-canvas')).toHaveCount(2);
});

test('failed scene-text saves restore the canvas and leave history intact', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  const frame = page.frameLocator('iframe');
  const edition = frame.locator('.art-opening .edition');
  const original = await edition.innerText();
  await page.route(
    `**/api/workspaces/${workspace.workspaceId}/apps/video-editor/revisions`,
    (route) => route.fulfill({ status: 503, json: { error: 'Save temporarily unavailable.' } }),
  );
  await edition.dblclick();
  await frame.getByRole('textbox', { name: 'Canvas text' }).fill('An unsaved change.');
  await page.locator('.app-header').click({ position: { x: 600, y: 30 } });
  await expect(page.getByRole('alert')).toContainText('Save temporarily unavailable.');
  await expect(edition).toHaveText(original);
  expect((await readWorkspace(request, workspace.workspaceId)).revisionId).toBe(
    workspace.revisionId,
  );
});

test('focused text timeline retimes, locates, collapses and deletes with undo', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  const read = () => readWorkspace(request, workspace.workspaceId);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  const title = page.frameLocator('iframe').locator('#title-1 span');
  await title.click();
  await expect(page.locator('.element-row')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.element-timeline')).toHaveCount(0);
  await title.dblclick();
  await page.frameLocator('iframe').getByRole('textbox', { name: 'Canvas text' }).press('Escape');
  await expect(page.locator('.element-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^(Expand|Collapse) timeline$/ })).toHaveCount(0);
  const block = page.getByRole('button', { name: 'Timeline: Opening title' });
  await expect(block).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: '.codex-ux/focused-timeline.png', animations: 'disabled' });
  await block.hover();
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await read()).revision.document.clips.find((clip) => clip.id === 'title-1')!.start,
    )
    .toBeGreaterThan(0);
  await readyPreview(page, request, workspace.workspaceId);
  const edge = (await block.locator('[data-edge="end"]').boundingBox())!;
  const duration = (await read()).revision.document.clips.find(
    (clip) => clip.id === 'title-1',
  )!.duration;
  await page.mouse.move(edge.x + 4, edge.y + 10);
  await page.mouse.down();
  await page.mouse.move(edge.x + 34, edge.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await read()).revision.document.clips.find((clip) => clip.id === 'title-1')!.duration,
    )
    .toBeGreaterThan(duration);
  await readyPreview(page, request, workspace.workspaceId);
  await block.dblclick();
  const selected = (await read()).revision.document.clips.find((clip) => clip.id === 'title-1')!;
  await expect(page.getByRole('slider', { name: 'Video position' })).toHaveAttribute(
    'aria-valuenow',
    String(selected.start),
  );
  await expect(page.locator('.text-selection')).toBeVisible();
  await block.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect
    .poll(async () => (await read()).revision.document.clips.some((clip) => clip.id === 'title-1'))
    .toBe(false);
  await expect(page.locator('.element-timeline')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo (⌘Z)', exact: true }).click();
  await expect
    .poll(async () => (await read()).revision.document.clips.some((clip) => clip.id === 'title-1'))
    .toBe(true);
});

test('tool island moves, remembers its position, opens adjacent notes and supports fullscreen', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  await expect(page.locator('.preview-loading')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assets', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'HyperFrames project' })).toHaveCount(0);
  await expect(page.locator('.app-header').getByRole('button', { name: 'History' })).toBeVisible();
  const grip = page.getByRole('button', { name: 'Move video tools' });
  let box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 110, box.y + box.height / 2 + 30, { steps: 10 });
  await page.mouse.up();
  box = (await page.locator('.tool-island').boundingBox())!;
  expect(box.x).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  const popup = (await page.locator('.chat-popover').boundingBox())!;
  expect(popup.x).toBeGreaterThan(box.x + box.width);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.chat-popover')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await page.reload();
  await expect(page.locator('.tool-island')).toBeVisible();
  expect((await page.locator('.tool-island').boundingBox())!.x).toBeCloseTo(box.x, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = (await page.locator('.tool-island').boundingBox())!;
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(380);
  expect(narrow.y + narrow.height).toBeLessThanOrEqual(834);
  await page.screenshot({ path: '.codex-ux/editor-narrow.png' });
});

test('background revisions wait for unfinished canvas typing', async ({ page, request }) => {
  const workspace = await createWorkspace(request);
  await page.goto(`/apps/video-editor/w/${workspace.workspaceId}`);
  const frame = page.frameLocator('iframe');
  await frame.locator('#title-1 span').dblclick();
  const input = frame.getByRole('textbox', { name: 'Canvas text' });
  await input.fill('Still writing this thought');
  const response = await request.post(
    `/api/workspaces/${workspace.workspaceId}/apps/video-editor/revisions`,
    {
      data: {
        requestId: crypto.randomUUID(),
        baseRevision: workspace.revisionId,
        label: 'External edit while typing',
        document: {
          ...workspace.revision.document,
          clips: workspace.revision.document.clips.map((clip) =>
            clip.id === 'title-1' ? { ...clip, text: 'An external revision.' } : clip,
          ),
        },
      },
    },
  );
  expect(response.ok()).toBe(true);
  for (let i = 0; i < 2; i++) {
    await page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/workspaces/${workspace.workspaceId}/apps/video-editor`) &&
        response.request().method() === 'GET',
    );
    await expect(input).toHaveText('Still writing this thought');
  }
  await expect(page.locator('hyperframes-player')).toHaveCount(1);
  await input.press('Escape');
  await readyPreview(page, request, workspace.workspaceId);
  await expect(frame.locator('#title-1 span')).toHaveText('An external revision.');
});
