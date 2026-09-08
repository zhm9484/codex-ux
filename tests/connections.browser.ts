/// <reference lib="dom" />
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Connection } from '../packages/protocol/src/index.ts';
import { createVideo } from './browser-helpers.ts';

test('agent invitation binds only the opened page and confirms the actual instance', async ({
  page,
  context,
  request,
}) => {
  const video = await createVideo(request, 'Agent invitation');
  const session = { provider: 'codex', sessionId: randomUUID() };
  const invitation = (await (
    await request.post('/api/connections', {
      data: {
        appId: 'video-editor',
        workspaceId: video.workspaceId,
        session,
      },
    })
  ).json()) as Connection;
  expect(invitation.state).toBe('waiting-page');
  const url = `/apps/video-editor/w/${video.workspaceId}`;
  await page.goto(`${url}#connect=${invitation.code}`);
  await expect
    .poll(
      async () =>
        ((await (await request.get(`/api/connections/${invitation.code}`)).json()) as Connection)
          .state,
    )
    .toBe('connected');
  expect(new URL(page.url()).hash).toBe('');
  const receipt = (await (
    await request.get(`/api/connections/${invitation.code}`)
  ).json()) as Connection;
  const state = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('codex-ux:app-instance:video-editor')!) as {
        instance: { id: string };
        bindings: Record<string, unknown>;
      },
  );
  expect(receipt.instanceId).toBe(state.instance.id);
  expect(state.bindings[video.workspaceId]).toEqual(session);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByText('Agent invitation', { exact: true }).first()).toBeVisible();
  const otherState = await other.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('codex-ux:app-instance:video-editor')!) as {
        bindings: Record<string, unknown>;
      },
  );
  expect(otherState.bindings[video.workspaceId]).toBeUndefined();
  await page.reload();
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(
            () =>
              JSON.parse(sessionStorage.getItem('codex-ux:app-instance:video-editor')!) as {
                bindings: Record<string, unknown>;
              },
          )
        ).bindings[video.workspaceId],
    )
    .toEqual(session);
  await other.close();
});

test('page code supports deliberate takeover and workspace changes cancel the receipt', async ({
  page,
  request,
}) => {
  const video = await createVideo(request, 'Page pairing');
  const other = await createVideo(request, 'Other pairing workspace');
  await page.goto(`/apps/video-editor/w/${video.workspaceId}`);
  await page.getByRole('button', { name: 'Agent connection', exact: true }).click();
  await page.getByRole('button', { name: 'Connect current agent' }).click();
  const code = await page.getByLabel('Give this connection code to your agent').inputValue();
  const session = { provider: 'codex', sessionId: randomUUID() };
  expect((await request.post(`/api/connections/${code}/connect`, { data: { session } })).ok()).toBe(
    true,
  );
  await expect(
    page.getByText('This page confirmed the connection.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Connect current agent' }).click();
  const next = await page.getByLabel('Give this connection code to your agent').inputValue();
  const replacement = { provider: 'codex', sessionId: randomUUID() };
  expect(
    (
      await request.post(`/api/connections/${next}/connect`, { data: { session: replacement } })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(`/api/connections/${next}/connect`, {
        data: { session: replacement, replaceSession: session },
      })
    ).ok(),
  ).toBe(true);
  await expect(page.getByText(replacement.sessionId)).toBeVisible();
  // The existing workspace picker changes the selected page, not a global binding.
  await page.getByRole('button', { name: 'Close agent connection' }).click();
  await page.getByRole('button', { name: 'Select workspace' }).click();
  await page.getByRole('button', { name: 'Other pairing workspace', exact: true }).click();
  await expect
    .poll(
      async () =>
        ((await (await request.get(`/api/connections/${next}`)).json()) as Connection).state,
    )
    .toBe('disconnected');
  expect(page.url()).toContain(other.workspaceId);
});

test('a late page acknowledgement cannot bind a workspace selected after the request', async ({
  page,
  request,
}) => {
  const first = await createVideo(request, 'Pending connection');
  const second = await createVideo(request, 'Switched connection');
  const invitation = (await (
    await request.post('/api/connections', {
      data: {
        appId: 'video-editor',
        workspaceId: first.workspaceId,
        session: { provider: 'codex', sessionId: randomUUID() },
      },
    })
  ).json()) as Connection;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const accepting = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`**/api/connections/${invitation.code}/accept`, async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto(`/apps/video-editor/w/${first.workspaceId}#connect=${invitation.code}`);
    await accepting;
    await page.getByRole('button', { name: 'Select workspace' }).click();
    await page.getByRole('button', { name: 'Switched connection', exact: true }).click();
    release();
    await expect
      .poll(
        async () =>
          ((await (await request.get(`/api/connections/${invitation.code}`)).json()) as Connection)
            .state,
      )
      .toBe('disconnected');
    const saved = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem('codex-ux:app-instance:video-editor')!) as {
          bindings: Record<string, unknown>;
        },
    );
    expect(saved.bindings[first.workspaceId]).toBeUndefined();
    expect(saved.bindings[second.workspaceId]).toBeUndefined();
  } finally {
    release();
  }
});
