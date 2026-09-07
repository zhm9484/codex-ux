import { createServer } from 'node:http';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { openDatabase } from './storage/database.ts';
import { WorkspaceStore } from './storage/workspaces.ts';
import { Collaboration } from './collaboration.ts';
import { RenderJobs } from './video/jobs.ts';
import { Thumbnails } from './video/thumbnails.ts';
import { api, type Services } from './routes.ts';
import { mediaRoutes } from './media-routes.ts';
import { serveFile } from './static.ts';
import { contained } from './video/files.ts';
import { json } from './http.ts';
import { HttpError } from './errors.ts';
import { NativeProjects } from './native/projects.ts';
import { repositoryRoot } from './config.ts';

export async function startServer(root: string, port: number, dev = false) {
  const origin = `http://127.0.0.1:${port}`;
  const db = openDatabase(root);
  const store = new WorkspaceStore(db);
  const initial = !store.list().length ? store.create('A little room') : null;
  const native = new NativeProjects(root, store);
  if (initial) await native.enable(initial.id);
  const services: Services = {
    native,
    store,
    collaboration: new Collaboration(store, root, origin, native),
    jobs: new RenderJobs(root),
    root,
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
        json(res, { service: 'codex-ux', version: 1, dataRoot: root });
        return;
      }
      if (path.startsWith('/api/')) {
        await api(req, res, path, services);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new HttpError(405, 'Method not allowed.');
      if (await mediaRoutes(req, res, url, services, thumbnails)) return;
      if (vite) {
        vite.middlewares(req, res, () => {
          json(res, { error: 'Not found' }, 404);
        });
        return;
      }
      const dist = join(repositoryRoot, 'apps/video-editor/dist');
      const file =
        path === '/' || path.startsWith('/w/')
          ? join(dist, 'index.html')
          : contained(dist, decodeURIComponent(path.slice(1)));
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
    close: async () => {
      await thumbnails.close();
      await vite?.close();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      db.close();
    },
  };
}
