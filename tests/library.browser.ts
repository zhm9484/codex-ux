/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import { realpath, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createVideo } from './browser-helpers.ts';
import type { VideoProject } from '../packages/video-domain/src/schema.ts';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5F8AAAAASUVORK5CYII=';

test('Library locations, @ references, paste, undo and note attachment edits share local materials', async ({
  page,
  request,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'ux-library-browser-'));
  try {
    await writeFile(join(directory, 'hero.png'), Buffer.from(png, 'base64'));
    await writeFile(join(directory, 'brand-guide.pdf'), 'reference');
    await mkdir(join(directory, 'clips'));
    const video = await createVideo(request, 'Shared library');
    const base = `/api/workspaces/${video.workspaceId}/apps/video-editor`;
    const read = async () => (await (await request.get(base)).json()) as VideoProject;
    await page.goto(`/apps/video-editor/w/${video.workspaceId}`);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('button', { name: 'Add location' }).click();
    await page.getByLabel('Local path').fill(directory);
    await page.getByRole('button', { name: 'Add path', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('hero.png', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close library' }).click();
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Chat message' });
    await input.fill('Use @hero');
    const result = page.getByRole('option', { name: /hero.png/ });
    await expect(result).toBeVisible();
    await page.screenshot({ path: '/tmp/library-at-desktop.png', animations: 'disabled' });
    await input.press('Enter');
    await expect(input.locator('[data-reference]')).toHaveCount(1);
    await input.press('Meta+z');
    await expect(input.locator('[data-reference]')).toHaveCount(0);
    await input.press('Meta+Shift+z');
    await expect(input.locator('[data-reference]')).toHaveCount(1);
    await input.evaluate((element, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    }, png);
    await expect(input.locator('[data-reference]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Add note to list' }).click();
    await expect.poll(async () => (await read()).notes[0]?.attachments?.length).toBe(2);
    const note = (await read()).notes[0]!;
    expect(note.attachments![0]!.path).toBe(await realpath(join(directory, 'hero.png')));
    expect(note.attachments![1]!.path).toContain('/files/attachments/');
    expect((await read()).revisionId).toBe(video.revisionId);
    await page.getByRole('button', { name: 'Edit note 1', exact: true }).click();
    const editing = page.getByLabel('Edit note 1 text');
    await expect(editing.locator('[data-reference]')).toHaveCount(2);
    await editing.fill('No references needed for this note');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(async () => (await read()).notes[0]?.attachments?.length).toBe(0);
    await page.reload();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('hero.png', { exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/library-mobile.png', animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
