/// <reference lib="dom" />
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Workspace } from '../packages/protocol/src/index.ts';
import type {
  SceneProject,
  VisibleObject,
  CameraView,
} from '../packages/scene-domain/src/index.ts';

test.use({
  launchOptions: {
    ...(process.env.CODEX_UX_CHROME
      ? { executablePath: process.env.CODEX_UX_CHROME }
      : process.platform === 'darwin'
        ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
        : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});
type State = {
  revisionId: string;
  selected: string | null;
  camera: CameraView;
  objects: (VisibleObject & { screen: { x: number; y: number } })[];
  geometries: number;
};
const state = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __sceneEditor: { state: () => State } }).__sceneEditor.state(),
  );
async function open(page: Page, request: APIRequestContext) {
  const workspace = (await (
    await request.post('/api/workspaces', { data: { name: 'Scene browser verification' } })
  ).json()) as Workspace;
  const path = `/api/workspaces/${workspace.id}/apps/3d-space`;
  const initial = (await (await request.post(path, { data: {} })).json()) as SceneProject;
  await page.goto(`/apps/3d-space/w/${workspace.id}`);
  await expect(page).toHaveTitle('3D Space · Codex UX');
  await expect(page.locator('.app-brand > span').first()).toHaveText('3D Space');
  await expect
    .poll(async () => (await state(page)).revisionId, { timeout: 15000 })
    .toBe(initial.revisionId);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  return {
    initial,
    read: async () => (await (await request.get(path + '/context')).json()) as SceneProject,
  };
}
async function drag(page: Page, id: string, dx: number, dy: number, cancel = false) {
  const object = (await state(page)).objects.find((item) => item.id === id)!;
  await page.mouse.move(object.screen.x, object.screen.y);
  await page.mouse.down();
  await page.mouse.move(object.screen.x + dx, object.screen.y + dy, { steps: 12 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}

test('direct transforms preserve camera, survive refresh, undo, cancel and anchor notes', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { initial, read } = await open(page, request);
  // Let the initial framing transition finish before measuring the camera.
  await page.waitForTimeout(700);
  const camera = (await state(page)).camera;
  await drag(page, 'sphere', 50, 10);
  await expect.poll(async () => (await read()).revisionId).not.toBe(initial.revisionId);
  const moved = await read();
  expect((await state(page)).camera).toEqual(camera);
  await page.getByRole('button', { name: 'Rotate object', exact: true }).click();
  await drag(page, 'sphere', 30, 0);
  await expect
    .poll(async () => (await read()).document.placements.sphere?.rotation[1])
    .not.toBe(moved.document.placements.sphere!.rotation[1]);
  const rotated = await read();
  await page.getByRole('button', { name: 'Resize object', exact: true }).click();
  await drag(page, 'sphere', 25, -10);
  await expect
    .poll(async () => (await read()).document.placements.sphere?.scale[0])
    .not.toBe(rotated.document.placements.sphere!.scale[0]);
  const scaled = await read();
  expect((await state(page)).camera).toEqual(camera);
  await drag(page, 'sphere', 30, 0, true);
  expect((await read()).revisionId).toBe(scaled.revisionId);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () => (await read()).document.placements.sphere)
    .toEqual(rotated.document.placements.sphere);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(async () => (await read()).document.placements.sphere)
    .toEqual(scaled.document.placements.sphere);
  await page.reload();
  await expect
    .poll(async () => (await state(page)).revisionId, { timeout: 15000 })
    .toBe(scaled.revisionId);
  expect((await state(page)).objects.find((item) => item.id === 'sphere')!.placement).toEqual(
    scaled.document.placements.sphere,
  );
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Annotate a place', exact: true }).click();
  const sphere = (await state(page)).objects.find((item) => item.id === 'sphere')!;
  await page.mouse.click(sphere.screen.x, sphere.screen.y);
  await page.getByRole('button', { name: 'Ask agent about this place' }).click();
  await page.getByRole('textbox', { name: 'Chat message' }).fill('Make this warmer');
  await page.getByRole('button', { name: 'Pin note', exact: true }).click();
  await expect.poll(async () => (await read()).document.annotations.length).toBe(1);
  expect((await read()).document.annotations[0]!.anchor.objectId).toBe('sphere');
  expect(errors).toEqual([]);
});

test('ordinary source updates retain placement; runtime and syntax errors recover', async ({
  page,
  request,
}) => {
  const { initial, read } = await open(page, request);
  await page.waitForTimeout(700);
  await drag(page, 'sphere', 35, 0);
  await expect.poll(async () => (await read()).revisionId).not.toBe(initial.revisionId);
  const moved = await read();
  const file = join(initial.source.directory, 'scene.ts');
  const original = await readFile(file, 'utf8');
  await writeFile(file, original.replace('Ribbon', 'Sculpture'));
  await expect
    .poll(async () => (await state(page)).objects.find((item) => item.id === 'ribbon')?.label, {
      timeout: 15000,
    })
    .toBe('Sculpture');
  expect((await state(page)).objects.find((item) => item.id === 'sphere')!.placement).toEqual(
    moved.document.placements.sphere,
  );
  const good = await state(page);
  await writeFile(file, 'export default () => { throw new Error("Deliberate runtime failure"); };');
  await expect(page.getByText(/Deliberate runtime failure/)).toBeVisible({ timeout: 15000 });
  expect((await state(page)).revisionId).toBe(good.revisionId);
  await writeFile(file, 'export default function ( {');
  await expect.poll(async () => (await read()).source.error, { timeout: 15000 }).toBeTruthy();
  expect((await state(page)).revisionId).toBe(good.revisionId);
  await writeFile(file, original);
  await expect
    .poll(async () => (await state(page)).objects.find((item) => item.id === 'ribbon')?.label, {
      timeout: 15000,
    })
    .toBe('Ribbon');
  expect((await state(page)).objects.find((item) => item.id === 'sphere')!.placement).toEqual(
    moved.document.placements.sphere,
  );
});

test('model import uses real loaders; mobile navigation remains available without a composer', async ({
  page,
  request,
}) => {
  const { read } = await open(page, request);
  await page.getByTestId('model-files').setInputFiles([
    {
      name: 'triangle.obj',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'mtllib triangle.mtl\no Triangle\nv -1 0 0\nv 1 0 0\nv 0 2 0\nusemtl Blue\nf 1 2 3\n',
      ),
    },
    {
      name: 'triangle.mtl',
      mimeType: 'text/plain',
      buffer: Buffer.from('newmtl Blue\nKd 0.1 0.4 0.9\n'),
    },
  ]);
  await expect.poll(async () => (await state(page)).objects.length, { timeout: 15000 }).toBe(4);
  expect(
    (await read()).document.objects.some(
      (object) => object.kind === 'model' && object.path.endsWith('triangle.obj'),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Show whole space', exact: true }).click();
  expect(
    await page
      .locator('.app-header')
      .evaluate((header) => header.scrollWidth <= header.clientWidth),
  ).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add to space', exact: true })).toBeVisible();
});
