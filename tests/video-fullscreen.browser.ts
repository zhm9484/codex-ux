/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import type { Workspace } from '../packages/video-domain/src/schema.ts';

for (const embedded of [false, true]) {
  test(`video fullscreen preserves playback and supports seeking (${embedded ? 'embedded fallback' : 'native'})`, async ({
    page,
    request,
  }) => {
    if (embedded) {
      await page.addInitScript(() => {
        Element.prototype.requestFullscreen = () => Promise.reject(new Error('Not allowed'));
      });
      await page.setViewportSize({ width: 600, height: 800 });
    }
    const created = await request.post('/api/workspaces', {
      data: { name: 'Fullscreen verification', native: false },
    });
    const workspace = (await created.json()) as Workspace;
    if (embedded) {
      const updated = await request.post(`/api/workspaces/${workspace.id}/revisions`, {
        data: {
          baseRevision: workspace.revisionId,
          requestId: crypto.randomUUID(),
          label: 'Portrait format',
          document: { ...workspace.revision.document, width: 360, height: 640 },
        },
      });
      expect(updated.ok()).toBe(true);
    }
    await page.goto(`/w/${workspace.id}`);
    await expect(page.locator('.preview-loading')).toHaveCount(0);
    const strip = page.getByRole('slider', { name: 'Video position' });
    const stripBox = (await strip.boundingBox())!;
    await strip.click({ position: { x: stripBox.width / 6, y: 20 } });
    await expect(page.locator('.current-time')).toHaveText('00:03:00');
    await page.locator('hyperframes-player').evaluate((player) => {
      (player as HTMLElement).dataset.testIdentity = 'same-player';
    });
    await page.getByRole('button', { name: 'Video fullscreen', exact: true }).click();
    await expect(page.locator('.video-fullscreen')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.fullscreenElement?.classList.contains('viewing-space') ?? false,
      ),
    ).toBe(!embedded);
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('.tool-island')).toBeHidden();
    await expect(page.locator('.collaboration-space')).toBeHidden();
    await expect(page.locator('.current-time')).toHaveText('00:03:00');
    const canvas = (await page.locator('.stage-canvas').boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(canvas.width / canvas.height).toBeCloseTo(embedded ? 360 / 640 : 16 / 9, 2);
    expect(canvas.x).toBeGreaterThanOrEqual(0);
    expect(canvas.y).toBeGreaterThanOrEqual(0);
    const progress = page.getByRole('slider', { name: 'Playback position' });
    const progressBox = (await progress.boundingBox())!;
    expect(canvas.y + canvas.height).toBeLessThan(progressBox.y);
    expect(progressBox.y + progressBox.height).toBeLessThan(viewport.height);
    await progress.click({ position: { x: progressBox.width / 3, y: 12 } });
    await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(5.5);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await progress.click({ position: { x: progressBox.width / 2, y: 12 } });
    await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(8.5);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    const paused = Number(await progress.inputValue());
    await page.screenshot({
      path: `.codex-ux/video-fullscreen-${embedded ? 'portrait' : 'landscape'}.png`,
      animations: 'disabled',
    });
    if (embedded) await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: 'Exit video fullscreen' }).click();
    await expect(page.locator('.video-fullscreen')).toHaveCount(0);
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.tool-island')).toBeVisible();
    await expect(page.locator('hyperframes-player')).toHaveCount(1);
    await expect(page.locator('hyperframes-player')).toHaveAttribute(
      'data-test-identity',
      'same-player',
    );
    expect(Number(await strip.getAttribute('aria-valuenow'))).toBeCloseTo(paused, 0);
  });
}
