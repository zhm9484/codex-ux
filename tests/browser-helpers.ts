import { expect, type APIRequestContext } from '@playwright/test';
import type { Workspace } from '../packages/protocol/src/index.ts';
import type { VideoProject } from '../packages/video-domain/src/schema.ts';

export async function createVideo(
  request: APIRequestContext,
  name: string,
  format: 'native' | 'structured' = 'native',
) {
  const created = await request.post('/api/workspaces', { data: { name } });
  expect(created.status()).toBe(201);
  const workspace = (await created.json()) as Workspace;
  const opened = await request.post(`/api/workspaces/${workspace.id}/apps/video-editor`, {
    data: { format },
  });
  expect(opened.ok()).toBe(true);
  return (await opened.json()) as VideoProject;
}
