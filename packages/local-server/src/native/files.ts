import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile, copyFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { nativeMetadata, videoSchema, type VideoDocument } from '@codex-ux/video-domain';
import { contained, workspaceDirectory } from '../video/files.ts';
import { HttpError } from '../errors.ts';

export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const sourceDirectory = (root: string, id: string) =>
  join(workspaceDirectory(root, id), 'project');
const blobsDirectory = (root: string, id: string) => join(workspaceDirectory(root, id), 'blobs');

export async function inventory(directory: string) {
  const root = await realpath(directory);
  const files: { path: string; size: number; mtime: number; ctime: number }[] = [];
  async function walk(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === '.git' || entry.name === '.DS_Store') continue;
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new HttpError(
          400,
          `Resolve symbolic links before importing: ${relative(root, file)}`,
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
        if (files.length > 20000)
          throw new HttpError(
            400,
            'Project exceeds 20,000 files. Use a browser-ready project directory.',
          );
      }
    }
  }
  await walk(root);
  if (files.reduce((sum, file) => sum + file.size, 0) > 2 * 1024 ** 3)
    throw new HttpError(400, 'Project exceeds the 2 GB snapshot limit.');
  return { files, signature: digest(JSON.stringify(files)) };
}
export async function snapshot(root: string, id: string, directory: string, base: VideoDocument) {
  const before = await inventory(directory);
  const blobs = blobsDirectory(root, id);
  await mkdir(blobs, { recursive: true });
  const files: NonNullable<VideoDocument['native']>['files'] = {};
  let htmlSize = 0;
  for (const file of before.files) {
    const bytes = await readFile(contained(directory, file.path));
    const hash = digest(bytes);
    await writeFile(join(blobs, hash), bytes, { flag: 'wx' }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      },
    );
    const text = /\.html?$/i.test(file.path) ? bytes.toString('utf8') : undefined;
    htmlSize += text?.length ?? 0;
    if (htmlSize > 4 * 1024 * 1024)
      throw new HttpError(400, 'Editable HTML exceeds the 4 MB snapshot limit.');
    files[file.path] = { hash, size: bytes.length, ...(text === undefined ? {} : { text }) };
  }
  if ((await inventory(directory)).signature !== before.signature)
    throw new HttpError(409, 'Project files changed during capture. Waiting for a stable save.');
  const html = files['index.html']?.text;
  if (!html) throw new HttpError(400, 'A native HyperFrames project needs index.html at its root.');
  const metadata = nativeMetadata(html);
  return videoSchema.parse({
    ...base,
    width: metadata.width,
    height: metadata.height,
    clips: [],
    sources: {},
    native: { entry: 'index.html', duration: metadata.duration, files },
  });
}

/** Normalize UI-edited HTML and verify every resource exists before committing a revision. */
export async function prepareNative(root: string, id: string, document: VideoDocument) {
  if (!document.native) return document;
  const doc = structuredClone(document);
  const blobs = blobsDirectory(root, id);
  await mkdir(blobs, { recursive: true });
  for (const asset of doc.assets) {
    const path = `assets/${asset.file}`;
    if (!doc.native!.files[path]) {
      const bytes = await readFile(contained(workspaceDirectory(root, id), 'assets', asset.file));
      const hash = digest(bytes);
      await writeFile(join(blobs, hash), bytes);
      doc.native!.files[path] = { hash, size: bytes.length };
      if (asset.mime.startsWith('font/')) {
        const entry = doc.native!.files['index.html'];
        if (entry?.text) {
          const style = `<style>@font-face{font-family:"${asset.id}";src:url("assets/${asset.file}");font-display:block}</style>`;
          entry.text = /<\/head>/i.test(entry.text)
            ? entry.text.replace(/<\/head>/i, `${style}</head>`)
            : style + entry.text;
        }
      }
    }
  }
  for (const [path, file] of Object.entries(doc.native!.files)) {
    if (file.text !== undefined) {
      if (!/\.html?$/i.test(path))
        throw new HttpError(400, 'Inline source editing is restricted to HTML files.');
      file.hash = digest(file.text);
      file.size = Buffer.byteLength(file.text);
      await writeFile(join(blobs, file.hash), file.text, { flag: 'wx' }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        },
      );
    } else {
      const info = await stat(contained(blobs, file.hash));
      if (info.size !== file.size) throw new HttpError(400, `Resource size mismatch: ${path}`);
    }
  }
  const metadata = nativeMetadata(doc.native!.files[doc.native!.entry]?.text ?? '');
  doc.width = metadata.width;
  doc.height = metadata.height;
  doc.native!.duration = metadata.duration;
  return videoSchema.parse(doc);
}
export async function writeNative(root: string, id: string, doc: VideoDocument, directory: string) {
  for (const [path, file] of Object.entries(doc.native!.files)) {
    const target = contained(directory, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(contained(blobsDirectory(root, id), file.hash), target);
  }
}
export const sameProject = (a: VideoDocument, b: VideoDocument) =>
  JSON.stringify(a.native) === JSON.stringify(b.native);
