import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { SceneServices } from './routes.ts';
import { threeDirectory } from './build.ts';
import { safeFile } from './files.ts';
import { serveFile } from '../static.ts';
import { HttpError } from '../errors.ts';

export async function sceneMedia(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  s: SceneServices,
) {
  const path = url.pathname.replace(/^\/apps\/scene-3d(?=\/media\/scene-3d\/engine\/)/, '');
  if (!path.startsWith('/media/scene-3d/')) return false;
  const engine = /^\/media\/scene-3d\/engine\/(build|addons)\/(.+)$/.exec(path);
  if (engine) {
    const relative = decodeURIComponent(engine[2]!);
    if (!/\.(?:js|wasm)$/.test(relative)) throw new HttpError(404, 'Runtime resource not found.');
    const root = join(threeDirectory, engine[1] === 'build' ? 'build' : 'examples/jsm');
    await serveFile(req, res, await safeFile(root, relative));
    return true;
  }
  const bundle = /^\/media\/scene-3d\/bundle\/([a-f0-9-]{36})\/([a-f0-9]{64})\/module\.js$/.exec(
    path,
  );
  if (bundle) {
    await serveFile(
      req,
      res,
      join(s.projects.store.directory(bundle[1]!), 'bundles', bundle[2]!, 'module.js'),
      true,
    );
    return true;
  }
  const source = /^\/media\/scene-3d\/(source|prepared)\/([a-f0-9-]{36})\/([a-f0-9-]+)\/(.+)$/.exec(
    path,
  );
  if (source) {
    const kind = source[1]!,
      id = source[2]!,
      version = source[3]!,
      encoded = source[4]!;
    const relative = decodeURIComponent(encoded);
    if (kind === 'prepared' && !/^[a-f0-9]{64}$/.test(version))
      throw new HttpError(404, 'Preview not found.');
    const snapshot =
      kind === 'source'
        ? s.projects.store.revision(id, version).snapshot
        : await s.collaboration.previewSnapshot(id, version);
    const resource = Object.hasOwn(snapshot.files, relative) ? snapshot.files[relative] : undefined;
    if (!resource) throw new HttpError(404, 'Scene resource is not in this version.');
    await serveFile(req, res, join(s.projects.blobs(id), resource.hash), true, relative);
    return true;
  }
  throw new HttpError(404, 'Scene media not found.');
}
