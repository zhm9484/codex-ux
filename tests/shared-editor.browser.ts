/// <reference lib="dom" />
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '../packages/protocol/src/index.ts';
import type {
  CameraView,
  SceneFeedback,
  SceneProject,
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

async function openScene(page: Page, request: APIRequestContext) {
  const workspace = (await (
    await request.post('/api/workspaces', { data: { name: 'Shared collaboration UI' } })
  ).json()) as Workspace;
  const base = `/api/workspaces/${workspace.id}/apps/3d-space`;
  await page.goto(`/apps/3d-space/w/${workspace.id}`);
  await expect(page.locator('.scene-opening')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally' })).toBeVisible();
  const project = (await (await request.get(base + '/context')).json()) as SceneProject;
  return { workspace, base, project };
}
async function bind(page: Page, sessionId: string) {
  await page.getByRole('button', { name: 'Agent connection' }).click();
  const modal = page.getByRole('dialog', { name: 'Agent connection' });
  await modal.getByText('Use a task ID or link').click();
  await modal.getByLabel('Session ID or task link').fill(sessionId);
  await modal.getByRole('button', { name: 'Save connection' }).click();
  await modal.getByRole('button', { name: 'Close agent connection' }).click();
}

test('3D Chat opens on demand, preserves draft context and attachments, and sends with the shared shortcut', async ({
  page,
  request,
}) => {
  const { workspace, base, project } = await openScene(page, request);
  const messages: {
    baseRevision: string;
    target: { session: { sessionId: string } };
    feedback: SceneFeedback;
  }[] = [];
  // Never send a real message to an agent during verification.
  await page.route(`**${base}/requests`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    messages.push(route.request().postDataJSON() as (typeof messages)[number]);
    await route.fulfill({ json: { state: 'sent', error: null } });
  });
  await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeHidden();
  await page.waitForTimeout(700);
  const camera = await page.evaluate(
    () =>
      (
        window as unknown as { __sceneEditor: { state: () => { camera: CameraView } } }
      ).__sceneEditor.state().camera,
  );
  const chat = page.getByRole('button', { name: 'Chat', exact: true });
  await chat.click();
  const input = page.getByRole('textbox', { name: 'Chat message' });
  await input.fill('Use this reference');
  await input.press('Enter');
  await input.pressSequentially('Keep the framing');
  expect(messages).toHaveLength(0);
  await input.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['palette'], 'palette.txt', { type: 'text/plain' }));
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  });
  await expect(input.locator('[data-reference]')).toHaveCount(1);
  await input.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['o Example'], 'model.obj', { type: 'text/plain' }));
    element.dispatchEvent(
      new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
    element.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
  });
  await expect(input.locator('[data-reference]')).toHaveCount(2);
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  const referenceIds = await input
    .locator('[data-reference]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-reference')));
  const draft = await input.innerText();
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await expect(chat).toBeFocused();
  await expect(input).toBeHidden();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await chat.click();
  await expect(input).toHaveText(draft, { useInnerText: true });
  await expect(input.locator('[data-reference]')).toHaveCount(2);
  await input.press('ControlOrMeta+Enter');
  const modal = page.getByRole('dialog', { name: 'Agent connection' });
  await expect(modal).toBeVisible();
  expect(messages).toHaveLength(0);
  await modal.getByText('Use a task ID or link').click();
  const sessionId = randomUUID();
  await modal.getByLabel('Session ID or task link').fill(sessionId);
  await modal.getByRole('button', { name: 'Save connection' }).click();
  expect(messages).toHaveLength(0);
  await modal.getByRole('button', { name: 'Continue sending' }).click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]!.baseRevision).toBe(project.revisionId);
  expect(messages[0]!.feedback.camera).toEqual(camera);
  expect(messages[0]!.feedback.attachmentIds).toEqual(referenceIds);
  expect(messages[0]!.target.session.sessionId).toBe(sessionId);
  await expect(input).toBeEmpty();
  const head = (await (await request.get(base + '/context')).json()) as SceneProject;
  expect(head.revisionId).toBe(project.revisionId);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Library' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.getByRole('button', { name: 'Select workspace' }).click();
  await page.getByRole('link', { name: 'Choose or create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  await expect(page.getByRole('button', { name: workspace.name })).toBeVisible();
});

test('3D history requires an explicit restore; stale drafts and uncertain HTTP delivery retain their identity', async ({
  page,
  request,
}) => {
  const { base, project } = await openScene(page, request);
  await bind(page, randomUUID());
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Chat message' });
  await input.fill('Keep this request tied to its original scene');
  await page.getByRole('button', { name: 'Close chat' }).click();
  await request.post(base + '/operations', {
    data: {
      baseRevision: project.revisionId,
      requestId: randomUUID(),
      label: 'Moved sphere',
      operation: {
        type: 'transform',
        objectId: 'sphere',
        placement: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    },
  });
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as unknown as { __sceneEditor: { state: () => { revisionId: string } } }
          ).__sceneEditor.state().revisionId,
      ),
    )
    .not.toBe(project.revisionId);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'History', exact: true });
  await expect(history.getByRole('button', { name: 'Restore' })).toHaveCount(1);
  const oldRow = history.locator('.history-row').filter({ hasText: project.history[0]!.label });
  await oldRow.locator('span').nth(1).click();
  expect(
    ((await (await request.get(base + '/context')).json()) as SceneProject).revisionId,
  ).not.toBe(project.revisionId);
  const beforeRestore = ((await (await request.get(base + '/context')).json()) as SceneProject)
    .revisionId;
  await oldRow.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(history).toBeHidden();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as unknown as { __sceneEditor: { state: () => { revisionId: string } } }
          ).__sceneEditor.state().revisionId,
      ),
    )
    .not.toBe(beforeRestore);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  // Capture the stale base without allowing this test to dispatch a real agent message.
  await page.route(`**${base}/requests`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    expect((route.request().postDataJSON() as { baseRevision: string }).baseRevision).toBe(
      project.revisionId,
    );
    await route.fulfill({
      status: 409,
      json: { error: 'The scene changed. Use the current view.' },
    });
  });
  await page.getByRole('button', { name: 'Send now', exact: true }).click();
  await expect(page.locator('.feedback-composer').getByRole('alert')).toContainText(/changed/);
  await expect(input).toContainText('Keep this request');
  await page.getByRole('button', { name: 'Draft context' }).click();
  await page.getByRole('button', { name: 'Use current view' }).click();
  const payloads: object[] = [];
  let fail = true;
  await page.route(`**${base}/requests/*`, (route) => route.abort());
  await page.route(`**${base}/requests`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    payloads.push(route.request().postDataJSON() as object);
    if (fail) {
      fail = false;
      await route.abort();
    } else await route.fulfill({ json: { state: 'sent', error: null } });
  });
  await page.getByRole('button', { name: 'Send now', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check delivery', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check delivery', exact: true }).click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toEqual(payloads[0]);
  await expect(input).toBeEmpty();
});

for (const app of ['video-editor', '3d-space']) {
  test(`${app} shared controls clamp, restore focus, and preserve drafts on narrow screens`, async ({
    page,
    request,
  }) => {
    const workspace = (await (
      await request.post('/api/workspaces', {
        data: { name: 'A workspace with a deliberately long name for small screens' },
      })
    ).json()) as Workspace;
    await page.goto(`/apps/${app}/w/${workspace.id}`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const chat = page.getByRole('button', { name: 'Chat', exact: true });
    await expect(chat).toBeVisible();
    await page.waitForTimeout(1000);
    const grip = page.getByRole('button', { name: 'Move collaboration tools' });
    await grip.focus();
    await grip.press('ArrowRight');
    const position = await page.locator('.tool-island').boundingBox();
    await chat.click();
    const input = page.getByRole('textbox', { name: 'Chat message' });
    await expect(input).toBeFocused();
    const composer = page.getByRole('dialog', { name: 'Chat', exact: true });
    await expect(composer.getByRole('button', { name: 'Draft context' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const beforeWriting = (await composer.boundingBox())!;
    await input.fill(
      Array.from(
        { length: 24 },
        (_, i) => `Thought ${i + 1}: leave enough room for the subject.`,
      ).join('\n'),
    );
    const afterWriting = (await composer.boundingBox())!;
    expect(afterWriting.x).toBe(beforeWriting.x);
    expect(afterWriting.y).toBe(beforeWriting.y);
    expect(afterWriting.height).toBeGreaterThan(beforeWriting.height);
    expect(await input.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await expect(composer.getByRole('button', { name: 'Send now' })).toBeVisible();
    const moveComposer = composer.getByRole('button', { name: 'Move composer' });
    await moveComposer.focus();
    await moveComposer.press('ArrowRight');
    expect((await composer.boundingBox())!.x).toBe(beforeWriting.x + 10);
    const handle = (await moveComposer.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 35, handle.y + handle.height / 2 + 20, {
      steps: 5,
    });
    await page.mouse.up();
    const movedComposer = (await composer.boundingBox())!;
    expect(movedComposer.x).toBe(beforeWriting.x + 45);
    expect(movedComposer.y).toBe(beforeWriting.y + 20);
    await input.fill('Keep this draft');
    await input.press('Escape');
    await expect(input).toBeHidden();
    await expect(chat).toBeFocused();
    await chat.click();
    await expect(input).toHaveText('Keep this draft');
    for (const width of [600, 390, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await expect
        .poll(async () => {
          const panel = await composer.boundingBox();
          return (
            !!panel &&
            panel.x >= 10 &&
            panel.x + panel.width <= width - 10 &&
            panel.y + panel.height <= 690
          );
        })
        .toBe(true);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width);
    }
    await composer.getByRole('button', { name: 'Draft context' }).click();
    await input.fill('A longer thought. '.repeat(60));
    await page.setViewportSize({ width: 390, height: 350 });
    await expect
      .poll(async () => {
        const action = await composer.getByRole('button', { name: 'Send now' }).boundingBox();
        return !!action && action.y >= 12 && action.y + action.height <= 338;
      })
      .toBe(true);
    await expect(input).toBeVisible();
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByRole('button', { name: 'Close chat' }).click();
    await page.getByRole('button', { name: 'Agent connection' }).click();
    const modal = page.getByRole('dialog', { name: 'Agent connection' });
    await modal.getByText('Use a task ID or link').click();
    await modal.getByLabel('Session ID or task link').fill('bad');
    await modal.getByRole('button', { name: 'Save connection' }).click();
    await expect(modal.getByRole('alert')).toContainText('valid Codex');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Agent connection' })).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await expect(page.locator('.tool-island')).toBeVisible();
    expect((await page.locator('.tool-island').boundingBox())!.x).toBe(position!.x);
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeHidden();
  });
}
