/// <reference lib="dom" />
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createVideo } from './browser-helpers.ts';
import type { CollaborationTarget } from '../packages/protocol/src/index.ts';

async function connection(page: Page) {
  if (!(await page.getByRole('button', { name: 'Configure Codex connection' }).isVisible()))
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
  if (!(await page.getByRole('textbox', { name: 'Session ID or task link' }).isVisible()))
    await page.getByRole('button', { name: 'Configure Codex connection' }).click();
  return page.getByRole('textbox', { name: 'Session ID or task link' });
}
async function bind(page: Page, sessionId: string) {
  await (await connection(page)).fill(sessionId);
  await page.getByRole('button', { name: 'Save connection' }).click();
  await expect(page.getByText('Codex session saved', { exact: true })).toBeVisible();
}
async function select(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Close panel' }).isVisible())
    await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Select workspace' }).click();
  await page.locator('.workspace-option').filter({ hasText: name }).click();
  await expect(page.getByRole('button', { name: 'Select workspace' })).toContainText(name);
}
const savedState = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem('codex-ux:app-instance:video-editor')!);

test('instances isolate bindings, restore each workspace on return and reload, and clear copied pages', async ({
  page,
  context,
  request,
}) => {
  const first = await createVideo(request, `Instance A ${randomUUID()}`);
  const second = await createVideo(request, `Instance B ${randomUUID()}`);
  const url = `/apps/video-editor/w/${first.workspaceId}`;
  const x = randomUUID(),
    y = randomUUID(),
    z = randomUUID();
  await page.goto(url);
  await bind(page, x);
  const original = JSON.parse(await savedState(page)) as { instance: { id: string } };
  const other = await context.newPage();
  await other.goto(url);
  await expect(await connection(other)).toHaveValue('');
  await bind(other, y);
  await expect(await connection(page)).toHaveValue(x);
  await select(page, second.name);
  await expect(await connection(page)).toHaveValue('');
  await bind(page, z);
  await select(page, first.name);
  await expect(await connection(page)).toHaveValue(x);
  await page.reload();
  await expect(await connection(page)).toHaveValue(x);
  expect((JSON.parse(await savedState(page)) as { instance: { id: string } }).instance.id).toBe(
    original.instance.id,
  );
  await expect(await connection(other)).toHaveValue(y);

  const popupPromise = context.waitForEvent('page');
  await page.evaluate(() => {
    window.open(location.href, '_blank');
  });
  const copied = await popupPromise;
  await copied.waitForLoadState();
  await expect(await connection(copied)).toHaveValue('');
  // A browser restore can copy storage and navigation history. The live owner still wins.
  await copied.evaluate(
    (state) => sessionStorage.setItem('codex-ux:app-instance:video-editor', state),
    await savedState(page),
  );
  await copied.reload();
  await expect(await connection(copied)).toHaveValue('');
  expect(
    (JSON.parse(await savedState(copied)) as { instance: { id: string } }).instance.id,
  ).not.toBe(original.instance.id);
  await copied.close();
  await expect(await connection(page)).toHaveValue(x);
  await other.close();
});

test('sending captures the current instance and session before switching workspaces', async ({
  page,
  request,
}) => {
  const first = await createVideo(request, `Request A ${randomUUID()}`);
  const second = await createVideo(request, `Request B ${randomUUID()}`);
  const base = `/api/workspaces/${first.workspaceId}/apps/video-editor`;
  await request.post(`${base}/notes`, {
    data: {
      intent: { kind: 'change' },
      text: 'A precise change',
      anchor: { revisionId: first.revisionId, start: 0, end: 1 },
    },
  });
  await page.goto(`/apps/video-editor/w/${first.workspaceId}`);
  const sessionId = randomUUID();
  await bind(page, sessionId);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let capture!: (body: { target: CollaborationTarget; noteIds: string[] }) => void;
  const captured = new Promise<{ target: CollaborationTarget; noteIds: string[] }>((resolve) => {
    capture = resolve;
  });
  await page.route(`**${base}/requests`, async (route) => {
    capture(route.request().postDataJSON() as { target: CollaborationTarget; noteIds: string[] });
    await pending;
    await route.fulfill({ json: { requestId: randomUUID() } });
  });
  await page.getByRole('button', { name: 'Send 1 note to Codex' }).click();
  const body = await captured;
  try {
    await select(page, second.name);
    await expect(await connection(page)).toHaveValue('');
    expect(body.target.session).toEqual({ provider: 'codex', sessionId });
    expect(body.target.instanceId).toBe(
      (JSON.parse(await savedState(page)) as { instance: { id: string } }).instance.id,
    );
    expect(body.noteIds).toHaveLength(1);
  } finally {
    release();
  }
});
