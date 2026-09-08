import { readFile } from 'node:fs/promises';
import { hyperframesPreview } from './sources/hyperframes-preview.ts';
import { standaloneRuntime } from './sources/standalone.ts';
import { environments } from './environment.ts';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { clampTime, videoSchema, type VideoDocument } from '@codex-ux/video-domain';
import type { VideoServices } from './video/routes.ts';
import type { Thumbnails } from './video/thumbnails.ts';
import { prepareVideo, readCandidate, previewCss } from './video/files.ts';
import { videoDirectory } from './video/paths.ts';
import { contained } from './storage/paths.ts';
import { serveFile } from './static.ts';
import { HttpError } from './errors.ts';
import { playerPage } from './video/player-page.ts';

const require = createRequire(import.meta.url);
async function presentation(
  req: IncomingMessage,
  res: ServerResponse,
  directory: string,
  doc: VideoDocument,
  file: string,
) {
  if (file === 'player.html') {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(playerPage(doc, await previewCss(directory)));
    return;
  }
  if (file.startsWith('source/')) {
    const relative = file.slice(7);
    if (!doc.files[relative]) throw new HttpError(404, 'Source resource not found.');
    if (doc.source.kind === 'hyperframes' && relative === doc.source.entry) {
      res.setHeader('Content-Type', 'text/html');
      res.end(hyperframesPreview(doc.files[relative].text ?? ''));
      return;
    }
  } else if (!file.startsWith('preview/')) throw new HttpError(404, 'Preview resource not found.');
  await serveFile(req, res, contained(directory, file), true);
}
export async function mediaRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  s: VideoServices,
  thumbs: Thumbnails,
) {
  if (!url.pathname.startsWith('/media/video-editor/')) return false;
  const path = decodeURIComponent(url.pathname.slice('/media/video-editor'.length));
  if (path === '/engine/runtime.js') {
    await environments.ensure('hyperframes');
    await serveFile(
      req,
      res,
      join(
        dirname(require.resolve('@hyperframes/core/package.json')),
        'dist/hyperframe.runtime.iife.js',
      ),
      true,
    );
    return true;
  }
  if (path === '/engine/preview.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(
      await standaloneRuntime(url.searchParams.get('kind') === 'media' ? 'media' : 'hyperframes'),
    );
    return true;
  }
  const capture = /^\/capture\/([\w-]+)\/([\w-]+)$/.exec(path);
  if (capture) {
    const [, id, rev] = capture;
    const r = s.store.revision(id!, rev!);
    const time = clampTime(r.document, Number(url.searchParams.get('time')) || 0);
    res.writeHead(302, {
      Location: `/media/video-editor/preview/${id}/${rev}/player.html?time=${time}`,
    });
    res.end();
    return true;
  }
  const thumbnail = /^\/thumbnails\/([\w-]+)\/([\w-]+)$/.exec(path);
  if (thumbnail) {
    const [, id, rev] = thumbnail;
    const r = s.store.revision(id!, rev!);
    const time = Number(url.searchParams.get('time'));
    if (!Number.isFinite(time) || time < 0 || time > r.document.duration)
      throw new HttpError(400, 'Invalid frame time.');
    await serveFile(req, res, await thumbs.get(id!, r, clampTime(r.document, time)), true);
    return true;
  }
  const preview = /^\/preview\/([\w-]+)\/([\w-]+)\/(.+)$/.exec(path);
  if (preview) {
    const [, id, rev, file] = preview;
    const r = s.store.revision(id!, rev!);
    await presentation(req, res, await prepareVideo(s.root, id!, r.document), r.document, file!);
    return true;
  }
  const candidate = /^\/candidate\/([\w-]+)\/([\w-]+)\/player.html$/.exec(path);
  if (candidate) {
    const [, id, requestId] = candidate;
    const request = s.collaboration.request(id!, requestId!);
    const base = s.store.revision(id!, request.base_revision);
    const doc = await readCandidate(s.root, id!, requestId!, base.document);
    const directory = await prepareVideo(s.root, id!, doc);
    const key = directory.split('/').at(-1)!;
    res.writeHead(302, {
      Location: `/media/video-editor/prepared/${id}/${key}/player.html${url.search}`,
    });
    res.end();
    return true;
  }
  const prepared = /^\/prepared\/([\w-]+)\/([a-f0-9]{64})\/(.+)$/.exec(path);
  if (prepared) {
    const [, id, key, file] = prepared;
    s.store.row(id!);
    const directory = contained(videoDirectory(s.root, id!), 'presentations', key!);
    const doc = videoSchema.parse(
      JSON.parse(await readFile(join(directory, 'document.json'), 'utf8')),
    );
    await presentation(req, res, directory, doc, file!);
    return true;
  }
  const resource = /^\/(assets|exports)\/([\w-]+)\/([\w.-]+)$/.exec(path);
  if (resource) {
    const [, kind, id, file] = resource;
    s.store.row(id!);
    await serveFile(req, res, contained(videoDirectory(s.root, id!), kind!, file!), true);
    return true;
  }
  return false;
}
