import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { LibraryStore } from './storage/library.ts';
import { json, readJson, readBody } from './http.ts';
import { serveFile } from './static.ts';
import { HttpError } from './errors.ts';

export async function libraryApi(
  req: IncomingMessage,
  res: ServerResponse,
  workspaceId: string,
  rest: string,
  library: LibraryStore,
) {
  const url = new URL(req.url!, 'http://localhost');
  if (rest === '' && req.method === 'GET') {
    json(res, library.sources(workspaceId));
    return;
  }
  if (rest === '/browse' && req.method === 'GET') {
    json(res, await library.browse(url.searchParams.get('path') || undefined));
    return;
  }
  if (rest === '/sources' && req.method === 'POST') {
    const { path } = z
      .strictObject({ path: z.string().min(1).max(4096) })
      .parse(await readJson(req));
    json(res, await library.add(workspaceId, path));
    return;
  }
  if (rest.startsWith('/sources/') && req.method === 'DELETE') {
    library.remove(workspaceId, rest.slice(9));
    json(res, library.sources(workspaceId));
    return;
  }
  if (rest === '/search' && req.method === 'GET') {
    json(
      res,
      await library.search(
        workspaceId,
        (url.searchParams.get('q') ?? '').slice(0, 200),
        url.searchParams.get('source') || undefined,
      ),
    );
    return;
  }
  if (rest === '/references' && req.method === 'POST') {
    const { sourceId, relativePath } = z
      .strictObject({ sourceId: z.string().min(1), relativePath: z.string().max(4096) })
      .parse(await readJson(req));
    json(res, await library.reference(workspaceId, sourceId, relativePath));
    return;
  }
  if (rest === '/uploads' && req.method === 'POST') {
    json(
      res,
      await library.upload(
        workspaceId,
        decodeURIComponent(String(req.headers['x-file-name'] ?? 'attachment')),
        await readBody(req, 100 * 1024 * 1024),
      ),
    );
    return;
  }
  const content = /^\/references\/([\w-]+)\/content$/.exec(rest);
  if (content && (req.method === 'GET' || req.method === 'HEAD')) {
    const [ref] = await library.validate(workspaceId, [content[1]!]);
    if (ref!.kind === 'directory') throw new HttpError(400, 'Directories have no file preview.');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    if (!/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm)|audio\/)/.test(ref!.mime))
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(ref!.name)}`,
      );
    await serveFile(req, res, ref!.path);
    return;
  }
  throw new HttpError(404, 'Library endpoint not found.');
}
