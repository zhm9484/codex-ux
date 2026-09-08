import { createServer } from 'node:http';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { VideoStore } from './video/store.ts';
import { readApps, validateApps, type HostedApp } from './apps.ts';
import { WorkspaceStore } from './storage/workspaces.ts';
import { VideoCollaboration } from './video/collaboration.ts';
import { RenderJobs } from './video/jobs.ts';
import { Thumbnails } from './video/thumbnails.ts';
import { api, type Services } from './routes.ts';
import { mediaRoutes } from './media-routes.ts';
import { serveFile } from './static.ts';
import { contained } from './storage/paths.ts';
import { json } from './http.ts';
import { HttpError } from './errors.ts';
import { VideoProjects } from './sources/projects.ts';
import { repositoryRoot } from './config.ts';
import { Connections } from './connections.ts';

export async function startServer(
  root: string,
  port: number,
  dev = false,
  hostedApps: HostedApp[] = readApps(),
) {
  const origin = `http://127.0.0.1:${port}`;
  const apps = validateApps(hostedApps);
  const workspaces = new WorkspaceStore(root);
  const store = new VideoStore(workspaces);
  const projects = new VideoProjects(root, store);
  const services: Services = {
    connections: new Connections(),
    workspaces,
    apps,
    video: {
      projects,
      store,
      root,
      collaboration: new VideoCollaboration(store, root, origin, projects),
      jobs: new RenderJobs(root),
    },
  };
  const thumbnails = new Thumbnails(root, origin);
  let vite: ViteDevServer | undefined;
  const server = createServer((req, res) => {
    void (async () => {
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`)
        throw new HttpError(403, 'Invalid host.');
      if (
        req.headers.origin &&
        req.headers.origin !== origin &&
        req.headers.origin !== `http://localhost:${port}`
      )
        throw new HttpError(403, 'Cross-origin access is not allowed.');
      const url = new URL(req.url ?? '/', origin);
      const path = url.pathname;
      if (path === '/api/health') {
        json(res, {
          service: 'codex-ux',
          version: 3,
          dataRoot: root,
          runtimeBuild: process.env.CODEX_UX_RUNTIME_BUILD ?? 'development',
        });
        return;
      }
      if (path.startsWith('/api/')) {
        await api(req, res, path, services);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new HttpError(405, 'Method not allowed.');
      if (await mediaRoutes(req, res, url, services.video, thumbnails)) return;
      if (path === '/') {
        const escape = (text: string) =>
          text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
        res.setHeader('Content-Type', 'text/html');
        res.end(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Codex UX</title><body><h1>Codex UX</h1><ul>${apps.map((app) => `<li><a href="/apps/${app.id}/">${escape(app.name)}</a></li>`).join('')}</ul></body></html>`,
        );
        return;
      }
      if (vite && (path.startsWith('/apps/video-editor/') || path.startsWith('/@'))) {
        vite.middlewares(req, res, () => {
          json(res, { error: 'Not found' }, 404);
        });
        return;
      }
      const match = /^\/apps\/([a-z0-9-]+)(\/.*)?$/.exec(path);
      const app = apps.find((app) => app.id === match?.[1]);
      if (!app) throw new HttpError(404, 'App not found.');
      if (!match?.[2]) {
        res.writeHead(302, { Location: `/apps/${app.id}/` });
        res.end();
        return;
      }
      const relative = decodeURIComponent(match[2]);
      const file =
        relative === '/' || /^\/w\/[a-zA-Z0-9-]+$/.test(relative)
          ? join(app.distDirectory, 'index.html')
          : contained(app.distDirectory, relative.slice(1));
      await serveFile(req, res, file);
    })().catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status =
        error instanceof HttpError ? error.status : error instanceof ZodError ? 400 : 500;
      const message =
        error instanceof ZodError
          ? error.issues.map((i) => i.message).join(' ')
          : error instanceof Error
            ? error.message
            : 'Unexpected error.';
      if (status >= 500) console.error(error);
      json(
        res,
        { error: message, code: error instanceof HttpError ? error.code : 'request_failed' },
        status,
      );
    });
  });
  if (dev)
    vite = await createViteServer({
      root: join(repositoryRoot, 'apps/video-editor'),
      configFile: join(repositoryRoot, 'apps/video-editor/vite.config.ts'),
      server: { middlewareMode: true, ws: { server } },
      appType: 'spa',
    });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    server,
    store,
    workspaces,
    close: async () => {
      await thumbnails.close();
      await vite?.close();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      store.close();
    },
  };
}
