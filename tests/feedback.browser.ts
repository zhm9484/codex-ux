/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createVideo } from './browser-helpers.ts';
import type { VideoProject } from '../packages/video-domain/src/schema.ts';

test('draft delivery stays separate from queued notes, preserves retries, and exposes sent history', async ({
  page,
  request,
}) => {
  const video = await createVideo(request, 'Feedback workflow');
  const base = `/api/workspaces/${video.workspaceId}/apps/video-editor`;
  const submitted = new Set<string>();
  const captures: string[][] = [];
  let fail = true;
  await page.route(`**${base}`, async (route) => {
    const response = await route.fetch();
    const project = (await response.json()) as VideoProject;
    project.notes = project.notes.map((note) =>
      submitted.has(note.id) ? { ...note, requestId: 'test-request' } : note,
    );
    await route.fulfill({ response, json: project });
  });
  await page.route(`**${base}/requests/test-request`, (route) =>
    route.fulfill({ json: { state: 'sent' } }),
  );
  // Delivery is intercepted; the test never sends a real Codex message.
  await page.route(`**${base}/requests`, async (route) => {
    const body = route.request().postDataJSON() as { noteIds: string[] };
    captures.push(body.noteIds);
    if (fail) {
      fail = false;
      await route.fulfill({ status: 503, json: { error: 'Temporary delivery failure' } });
    } else {
      body.noteIds.forEach((id) => submitted.add(id));
      await route.fulfill({ json: { requestId: 'test-request' } });
    }
  });
  await page.goto(`/apps/video-editor/w/${video.workspaceId}`);
  await expect(page.locator('.preview-loading')).toHaveCount(0);
  await expect(page.locator('iframe[data-revision]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByLabel('Chat message').fill('Save this for later');
  await page.getByRole('button', { name: 'Add note to list' }).click();
  const board = page.getByRole('region', { name: 'Pending notes' });
  await expect(board.getByText('Save this for later')).toBeVisible();
  await board.getByRole('button', { name: 'Edit note 1', exact: true }).click();
  await page.getByLabel('Edit note 1 text').fill('Save this edited note for later');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(board.getByText('Save this edited note for later')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByLabel('Chat message').fill('Send only this draft');
  await page.getByRole('button', { name: 'Send now', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Agent connection' });
  await expect(modal).toBeVisible();
  await modal.getByText('Use a task ID or link', { exact: true }).click();
  await modal.getByLabel('Session ID or task link').fill(randomUUID());
  await modal.getByRole('button', { name: 'Save connection' }).click();
  await modal.getByRole('button', { name: 'Continue sending' }).click();
  await expect(page.getByLabel('Chat message')).toHaveText('Send only this draft');
  await expect(page.locator('.feedback-composer').getByRole('alert')).toContainText(
    'Temporary delivery failure',
  );
  await page.getByRole('button', { name: 'Send now', exact: true }).click();
  await expect.poll(() => captures.length).toBe(2);
  expect(captures[0]).toEqual(captures[1]);
  expect(captures[0]).toHaveLength(1);
  await expect(board.locator('.note-card')).toHaveCount(1);
  const project = (await (await request.get(base)).json()) as VideoProject;
  expect(project.notes).toHaveLength(2);
  await board.getByRole('button', { name: 'Send all' }).click();
  await expect(board).toHaveCount(0);
  expect(captures[2]).not.toEqual(captures[1]);
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await board.getByRole('button', { name: 'History' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Notes history' }).locator('.note-card'),
  ).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Notes history' })).toHaveCount(0);
});

test('notes board clamps and remembers its position, and header dialogs fit a narrow screen', async ({
  page,
  request,
}) => {
  const video = await createVideo(request, 'Compact tools');
  await page.goto(`/apps/video-editor/w/${video.workspaceId}`);
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  const grip = page.getByRole('button', { name: 'Move notes' });
  await grip.focus();
  await grip.press('ArrowLeft');
  const before = await page.locator('.notes-board').boundingBox();
  await page.getByRole('button', { name: 'Collapse notes' }).click();
  await expect(page.getByRole('button', { name: 'Send all' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand notes' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  expect((await page.locator('.notes-board').boundingBox())!.x).toBe(before!.x);
  await page.setViewportSize({ width: 390, height: 844 });
  const board = await page.locator('.notes-board').boundingBox();
  expect(board!.x).toBeGreaterThanOrEqual(0);
  expect(board!.x + board!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Library' }).click();
  const modal = page.getByRole('dialog', { name: 'Library' });
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Your local materials', { exact: true })).toBeVisible();
  const rect = await modal.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/editor-polish-mobile-files.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Agent connection' }).click();
  await expect(page.getByRole('dialog', { name: 'Agent connection' })).toBeVisible();
  await page.screenshot({ path: '/tmp/editor-polish-mobile-agent.png', animations: 'disabled' });
});

test('Send now captures its destination before asynchronous draft storage', async ({
  page,
  request,
}) => {
  const video = await createVideo(request, 'Captured draft destination');
  const base = `/api/workspaces/${video.workspaceId}/apps/video-editor`;
  const firstSession = randomUUID();
  const nextSession = randomUUID();
  await page.goto(`/apps/video-editor/w/${video.workspaceId}`);
  await page.getByRole('button', { name: 'Agent connection' }).click();
  await page.getByText('Use a task ID or link', { exact: true }).click();
  await page.getByLabel('Session ID or task link').fill(firstSession);
  await page.getByRole('button', { name: 'Save connection' }).click();
  await page.getByRole('button', { name: 'Close agent connection' }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByLabel('Chat message').fill('Keep the original destination');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saving = false;
  let received = '';
  await page.route(`**${base}/notes`, async (route) => {
    saving = true;
    await gate;
    await route.continue();
  });
  await page.route(`**${base}/requests`, async (route) => {
    received = (route.request().postDataJSON() as { target: { session: { sessionId: string } } })
      .target.session.sessionId;
    await route.fulfill({ json: { requestId: 'test-request' } });
  });
  try {
    await page.getByRole('button', { name: 'Send now', exact: true }).click();
    await expect.poll(() => saving).toBe(true);
    await page.getByRole('button', { name: 'Agent connection' }).click();
    await page.getByText('Use a task ID or link', { exact: true }).click();
    await page.getByLabel('Session ID or task link').fill(nextSession);
    await page.getByRole('button', { name: 'Save connection' }).click();
    release();
    await expect.poll(() => received).toBe(firstSession);
  } finally {
    release();
  }
});

test('Chat and Add note share a readable draft and preserve its anchor across entry points', async ({
  page,
  request,
}) => {
  const video = await createVideo(request, 'Shared composer');
  const base = `/api/workspaces/${video.workspaceId}/apps/video-editor`;
  await page.goto(`/apps/video-editor/w/${video.workspaceId}`);
  await expect(page.locator('.preview-loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'Chat', exact: true });
  const input = page.getByLabel('Chat message');
  await input.fill('Give this moment a softer transition');
  await page.getByLabel('Request kind').selectOption('transition');
  await page.getByLabel('Transition duration').fill('0.8');
  const anchor = await composer
    .getByRole('button', { name: 'Locate referenced frame' })
    .textContent();
  await page.getByRole('button', { name: 'Close chat' }).click();
  await page.getByRole('slider', { name: 'Video position' }).focus();
  await page.keyboard.press('ArrowRight');
  await page
    .frameLocator('iframe[data-revision]')
    .frameLocator('iframe')
    .locator('body')
    .click({ button: 'right', position: { x: 40, y: 40 } });
  await page.getByRole('menuitem', { name: 'Add note', exact: true }).click();
  await expect(input).toHaveText('Give this moment a softer transition');
  await expect(page.getByLabel('Transition duration')).toHaveValue('0.8');
  await expect(composer.getByRole('button', { name: 'Locate referenced frame' })).toHaveText(
    anchor!,
  );
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const rect = await composer.boundingBox();
        return (
          !!rect &&
          rect.x >= 0 &&
          rect.y >= 0 &&
          rect.x + rect.width <= viewport.width &&
          rect.y + rect.height <= viewport.height
        );
      })
      .toBe(true);
    await expect(input).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send now', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Add note to list' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Pending notes' })
      .getByText('Give this moment a softer transition'),
  ).toBeVisible();
  const project = (await (await request.get(base)).json()) as VideoProject;
  expect(project.notes).toHaveLength(1);
  expect(project.notes[0]!.intent).toEqual({ kind: 'transition', duration: 0.8 });
});
