import { readFile } from 'node:fs/promises';
import { nativePreview } from './native/preview.ts';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { durationOf } from '@codex-ux/video-domain';
import type { VideoServices } from './video/routes.ts';
import type { Thumbnails } from './video/thumbnails.ts';
import { materialize, readCandidate, videoDirectory } from './video/files.ts';
import { contained } from './storage/paths.ts';
import { compositionHtml, sceneHtml } from './video/composition.ts';
import { serveFile } from './static.ts';
import { HttpError } from './errors.ts';
import { playerPage } from './video/player-page.ts';

const require = createRequire(import.meta.url);
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
  if (path === '/engine/player.js') {
    await serveFile(
      req,
      res,
      join(dirname(require.resolve('@hyperframes/player')), 'hyperframes-player.js'),
      true,
    );
    return true;
  }
  const capture = /^\/capture\/([\w-]+)\/([\w-]+)$/.exec(path);
  if (capture) {
    const [, id, rev] = capture;
    const r = s.store.revision(id!, rev!);
    const t = Math.max(
      0,
      Math.min(durationOf(r.document), Number(url.searchParams.get('time')) || 0),
    );
    res.setHeader('Content-Type', 'text/html');
    res.end(playerPage(`/media/video-editor/preview/${id}/${rev}/index.html`, r.document, t));
    return true;
  }
  const thumbnail = /^\/thumbnails\/([\w-]+)\/([\w-]+)$/.exec(path);
  if (thumbnail) {
    const [, id, rev] = thumbnail;
    const r = s.store.revision(id!, rev!);
    const time = Number(url.searchParams.get('time'));
    if (!Number.isFinite(time) || time < 0 || time > durationOf(r.document))
      throw new HttpError(400, 'Invalid frame time.');
    await serveFile(req, res, await thumbs.get(id!, r, time), true);
    return true;
  }
  const preview = /^\/preview\/([\w-]+)\/([\w-]+)\/(.+)$/.exec(path);
  if (preview) {
    const [, id, rev, file] = preview;
    const r = s.store.revision(id!, rev!);
    const dir = await materialize(s.root, id!, r);
    if (file === 'index.html') {
      res.setHeader('Content-Type', 'text/html');
      const html = r.document.native?.files['index.html']?.text;
      res.end(html === undefined ? compositionHtml(r.document, true) : nativePreview(html));
      return true;
    }
    await serveFile(req, res, contained(dir, file!), true);
    return true;
  }
  const candidate = /^\/candidate\/([\w-]+)\/([\w-]+)\/(.+)$/.exec(path);
  if (candidate) {
    const [, id, requestId, file] = candidate;
    s.collaboration.request(id!, requestId!);
    const request = s.collaboration.request(id!, requestId!);
    const base = s.store.revision(id!, request.base_revision);
    const doc = base.document.native ? base.document : await readCandidate(s.root, id!, requestId!);
    if (file === 'preview.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        playerPage(`/media/video-editor/candidate/${id}/${requestId}/index.html`, doc, 0, true),
      );
      return true;
    }
    if (doc.native) {
      const directory = contained(videoDirectory(s.root, id!), 'requests', requestId!);
      if (file === 'index.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end(nativePreview(await readFile(contained(directory, file), 'utf8')));
      } else await serveFile(req, res, contained(directory, file!));
      return true;
    }
    if (file === 'index.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end(compositionHtml(doc, true));
      return true;
    }
    if (file === 'vendor/gsap.js') {
      await serveFile(req, res, require.resolve('gsap/dist/gsap.min.js'));
      return true;
    }
    if (file?.startsWith('scenes/')) {
      const c = doc.clips.find((c) => `scenes/${c.id}.html` === file);
      if (!c?.sourceId) throw new HttpError(404, 'Scene not found.');
      res.setHeader('Content-Type', 'text/html');
      res.end(sceneHtml(doc.sources[c.sourceId] ?? '', c, doc));
      return true;
    }
    if (file?.startsWith('assets/')) {
      await serveFile(req, res, contained(videoDirectory(s.root, id!), file));
      return true;
    }
    throw new HttpError(404, 'Candidate resource not found.');
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
