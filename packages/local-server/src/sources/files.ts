import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile, copyFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import {
  sourceSchema,
  hyperframesMetadata,
  videoSchema,
  type ProjectFiles,
  type VideoDocument,
  type Asset,
} from '@codex-ux/video-domain';
import { contained } from '../storage/paths.ts';
import { videoDirectory, blobsDirectory } from '../video/paths.ts';
import { HttpError } from '../errors.ts';
import { probeVideo } from '../video/probe.ts';

export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const excludedSourceNames: ReadonlySet<string> = new Set([
  '.git',
  '.DS_Store',
  'node_modules',
  'dist',
  'build',
  '.cache',
  '.next',
  '.video-editor',
]);
const editable = /\.(?:html?|[cm]?js|jsx|tsx?|css|json)$/i;
export async function inventory(directory: string) {
  const root = await realpath(directory);
  const files: { path: string; size: number; mtime: number; ctime: number }[] = [];
  async function walk(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (excludedSourceNames.has(entry.name)) continue;
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new HttpError(
          400,
          `Resolve source symbolic links before importing: ${relative(root, file)}`,
        );
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const info = await stat(file);
        files.push({
          path: relative(root, file).split(sep).join('/'),
          size: info.size,
          mtime: info.mtimeMs,
          ctime: info.ctimeMs,
        });
        if (files.length > 20000) throw new HttpError(400, 'Project exceeds 20,000 source files.');
      }
    }
  }
  await walk(root);
  if (files.reduce((sum, file) => sum + file.size, 0) > 2 * 1024 ** 3)
    throw new HttpError(400, 'Project exceeds the 2 GB snapshot limit.');
  return { files, signature: digest(JSON.stringify(files)) };
}
async function saveBlob(root: string, id: string, bytes: Buffer) {
  const hash = digest(bytes);
  await mkdir(blobsDirectory(root, id), { recursive: true });
  await writeFile(join(blobsDirectory(root, id), hash), bytes, { flag: 'wx' }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    },
  );
  return hash;
}
export async function captureFiles(
  root: string,
  id: string,
  directory: string,
): Promise<ProjectFiles> {
  const before = await inventory(directory);
  const files: ProjectFiles = {};
  let textSize = 0;
  for (const file of before.files) {
    const bytes = await readFile(contained(directory, file.path));
    const hash = await saveBlob(root, id, bytes);
    const text = editable.test(file.path) ? bytes.toString('utf8') : undefined;
    textSize += text === undefined ? 0 : bytes.length;
    if (textSize > 8 * 1024 * 1024) throw new HttpError(400, 'Editable source exceeds 8 MB.');
    files[file.path] = { hash, size: bytes.length, ...(text === undefined ? {} : { text }) };
  }
  if ((await inventory(directory)).signature !== before.signature)
    throw new HttpError(409, 'Project files changed during capture. Waiting for a stable save.');
  return files;
}
export async function inspectFiles(
  root: string,
  id: string,
  files: ProjectFiles,
  name: string,
  assets: Asset[] = [],
): Promise<VideoDocument> {
  const manifest = files['video.json']?.text;
  const videos = Object.keys(files).filter(
    (path) => !path.includes('/') && /\.(mp4|webm)$/i.test(path),
  );
  const source = sourceSchema.parse(
    manifest === undefined
      ? files['index.html']
        ? { kind: 'hyperframes', entry: 'index.html' }
        : videos.length === 1
          ? { kind: 'media', entry: videos[0] }
          : (() => {
              throw new HttpError(
                400,
                'Add video.json to identify the video source, or import a single video file.',
              );
            })()
      : JSON.parse(manifest),
  );
  const entry = files[source.entry];
  if (!entry) throw new HttpError(400, `Video source entry is missing: ${source.entry}`);
  let metadata: { width: number; height: number; duration: number; fps: number | null };
  switch (source.kind) {
    case 'hyperframes':
      metadata = { ...hyperframesMetadata(entry.text ?? ''), fps: source.fps };
      break;
    case 'remotion':
      metadata = {
        width: source.width,
        height: source.height,
        duration: source.durationInFrames / source.fps,
        fps: source.fps,
      };
      break;
    case 'media': {
      if (!/\.(mp4|webm)$/i.test(source.entry))
        throw new HttpError(415, 'Use an MP4 or WebM source.');
      metadata = {
        ...(await probeVideo(contained(blobsDirectory(root, id), entry.hash))),
        fps: null,
      };
      break;
    }
  }
  return videoSchema.parse({ version: 1, name, source, files, ...metadata, assets });
}
export async function snapshot(
  root: string,
  id: string,
  directory: string,
  name: string,
  assets: Asset[] = [],
) {
  return inspectFiles(root, id, await captureFiles(root, id, directory), name, assets);
}
/** Normalize source text and verify every binary against this workspace's blob store. */
export async function prepareDocument(root: string, id: string, document: VideoDocument) {
  const doc = structuredClone(document);
  for (const asset of doc.assets) {
    const path = `assets/${asset.file}`;
    if (doc.files[path]) continue;
    const bytes = await readFile(contained(videoDirectory(root, id), 'assets', asset.file));
    doc.files[path] = { hash: await saveBlob(root, id, bytes), size: bytes.length };
    if (asset.mime.startsWith('font/') && doc.source.kind === 'hyperframes') {
      const entry = doc.files[doc.source.entry];
      if (entry?.text) {
        const style = `<style>@font-face{font-family:"${asset.id}";src:url("assets/${asset.file}");font-display:block}</style>`;
        entry.text = /<\/head>/i.test(entry.text)
          ? entry.text.replace(/<\/head>/i, `${style}</head>`)
          : style + entry.text;
      }
    }
  }
  let textSize = 0;
  for (const [path, file] of Object.entries(doc.files)) {
    if (path.split('/').some((part) => excludedSourceNames.has(part)))
      throw new HttpError(
        400,
        'Generated and tooling directories cannot be revision source files.',
      );
    if (file.text !== undefined) {
      if (!editable.test(path))
        throw new HttpError(400, 'Inline source must be HTML, JS, TS, CSS or JSON.');
      const bytes = Buffer.from(file.text);
      textSize += bytes.length;
      file.hash = await saveBlob(root, id, bytes);
      file.size = bytes.length;
    } else {
      const bytes = await readFile(contained(blobsDirectory(root, id), file.hash));
      if (bytes.length !== file.size || digest(bytes) !== file.hash)
        throw new HttpError(400, `Resource mismatch: ${path}`);
    }
  }
  if (
    textSize > 8 * 1024 * 1024 ||
    Object.keys(doc.files).length > 20000 ||
    Object.values(doc.files).reduce((sum, f) => sum + f.size, 0) > 2 * 1024 ** 3
  )
    throw new HttpError(400, 'Project exceeds source snapshot limits.');
  return inspectFiles(root, id, doc.files, doc.name, doc.assets);
}
export async function writeProject(
  root: string,
  id: string,
  files: ProjectFiles,
  directory: string,
) {
  for (const [path, file] of Object.entries(files)) {
    const target = contained(directory, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(contained(blobsDirectory(root, id), file.hash), target);
  }
}
