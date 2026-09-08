import { libraryApi } from './library-routes.ts';
import type { LibraryStore } from './storage/library.ts';
import { listWorkspaceFiles } from './storage/files.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { WorkspaceStore } from './storage/workspaces.ts';
import type { HostedApp } from './apps.ts';
import { videoApi, type VideoServices } from './video/routes.ts';
import { json, readJson } from './http.ts';
import { HttpError } from './errors.ts';
import type { Connections } from './connections.ts';
import { connectionApi } from './connection-routes.ts';
import { validateApps } from './apps.ts';
import { codexCapability } from '@codex-ux/adapter-codex';
import { sceneApi, type SceneServices } from './scene/routes.ts';

export interface Services {
  library: LibraryStore;
  workspaces: WorkspaceStore;
  apps: HostedApp[];
  video: VideoServices;
  connections: Connections;
  scene: SceneServices;
}
export async function api(req: IncomingMessage, res: ServerResponse, path: string, s: Services) {
  if (path === '/api/agents/codex' && req.method === 'GET') {
    json(res, await codexCapability());
    return;
  }
  if (await connectionApi(req, res, path, s)) return;
  if (path === '/api/apps' && req.method === 'POST') {
    const [app] = validateApps([await readJson(req)]);
    const index = s.apps.findIndex((item) => item.id === app!.id);
    if (index < 0) s.apps.push(app!);
    else s.apps[index] = app!;
    json(res, { id: app!.id, name: app!.name });
    return;
  }
  if (path === '/api/apps' && req.method === 'GET') {
    json(
      res,
      s.apps.map(({ id, name }) => ({ id, name })),
    );
    return;
  }
  if (path === '/api/workspaces') {
    if (req.method === 'GET') {
      json(res, s.workspaces.list());
      return;
    }
    if (req.method === 'POST') {
      const { name } = z
        .strictObject({ name: z.string().trim().min(1).max(100) })
        .parse(await readJson(req));
      json(res, s.workspaces.create(name), 201);
      return;
    }
  }
  const match = /^\/api\/workspaces\/([a-zA-Z0-9-]+)(.*)$/.exec(path);
  if (match) {
    const id = match[1]!;
    const rest = match[2]!;
    s.workspaces.get(id);
    if (rest === '' && req.method === 'GET') {
      json(res, s.workspaces.context(id));
      return;
    }
    if (rest === '/library' || rest.startsWith('/library/')) {
      await libraryApi(req, res, id, rest.slice(8), s.library);
      return;
    }
    if (rest === '/files' && req.method === 'GET') {
      json(
        res,
        await listWorkspaceFiles(
          s.workspaces.context(id).filesDirectory,
          new URL(req.url!, 'http://localhost').searchParams.get('path') ?? '',
        ),
      );
      return;
    }
    const app = /^\/apps\/([a-z0-9-]+)(.*)$/.exec(rest);
    if (app && app[1] === 'scene-3d' && s.apps.some((entry) => entry.id === app[1])) {
      await sceneApi(req, res, id, app[2]!, s.scene);
      return;
    }
    if (app && s.apps.some((entry) => entry.id === app[1]) && app[1] === 'video-editor') {
      await videoApi(req, res, id, app[2]!, s.video);
      return;
    }
  }
  throw new HttpError(404, 'Endpoint not found.');
}
