import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { AppDefinition } from '@codex-ux/protocol';
import { repositoryRoot } from './config.ts';

export interface HostedApp extends AppDefinition {
  distDirectory: string;
}
const hostedApps = z
  .array(
    z.strictObject({
      id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      name: z.string().min(1).max(100),
      distDirectory: z.string().refine(isAbsolute, 'App distDirectory must be absolute.'),
    }),
  )
  .refine(
    (apps) => new Set(apps.map((app) => app.id)).size === apps.length,
    'App IDs must be unique.',
  );

export function readApps(): HostedApp[] {
  const file = process.env.CODEX_UX_APPS_FILE;
  return hostedApps.parse(
    file
      ? JSON.parse(readFileSync(file, 'utf8'))
      : [
          {
            id: 'video-editor',
            name: 'Video Editor',
            distDirectory: resolve(repositoryRoot, 'skills/codex-ux-video-editor/dist'),
          },
          {
            id: '3d-space',
            name: '3D Space',
            distDirectory: resolve(repositoryRoot, 'skills/codex-ux-3d-space/dist'),
          },
        ],
  );
}
export function validateApps(apps: unknown) {
  return hostedApps.parse(apps);
}
