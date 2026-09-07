import { mkdir, writeFile, readFile, access, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Revision, VideoDocument } from '@codex-ux/video-domain';
import { writeProject, snapshot, digest } from '../sources/files.ts';
import { buildRemotion } from '../sources/remotion.ts';
import { videoDirectory } from './paths.ts';
export { videoDirectory } from './paths.ts';

const preparing = new Map<string, Promise<string>>();
/** Immutable source and its derived artifacts share a content key, including the adapter versions. */
export async function prepareVideo(root: string, id: string, doc: VideoDocument) {
  const files = Object.fromEntries(
    Object.entries(doc.files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, file]) => [path, { hash: file.hash, size: file.size }]),
  );
  const key = digest(
    JSON.stringify({
      adapter: 1,
      hyperframes: '0.8.30',
      remotion: '4.0.522',
      source: doc.source,
      files,
    }),
  );
  const directory = join(videoDirectory(root, id), 'presentations', key);
  const existing = preparing.get(directory);
  if (existing) return existing;
  const task = (async () => {
    try {
      await access(join(directory, '.ready'));
      return directory;
    } catch {
      /* Prepare an immutable presentation. */
    }
    const stage = directory + '-' + randomUUID();
    try {
      await mkdir(join(stage, 'source'), { recursive: true });
      await writeProject(root, id, doc.files, join(stage, 'source'));
      if (doc.source.kind === 'remotion') await buildRemotion(root, id, doc, stage);
      await writeFile(join(stage, 'document.json'), JSON.stringify(doc));
      await writeFile(join(stage, '.ready'), 'ready');
      await rename(stage, directory);
      return directory;
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  })();
  preparing.set(directory, task);
  try {
    return await task;
  } finally {
    preparing.delete(directory);
  }
}
export async function writeCandidate(
  root: string,
  id: string,
  requestId: string,
  revision: Revision,
) {
  const directory = join(videoDirectory(root, id), 'requests', requestId);
  await mkdir(directory, { recursive: true });
  await writeProject(root, id, revision.document.files, directory);
  return directory;
}
export async function readCandidate(
  root: string,
  id: string,
  requestId: string,
  base: VideoDocument,
) {
  const directory = join(videoDirectory(root, id), 'requests', requestId);
  return snapshot(root, id, directory, base.name, base.assets);
}
export async function previewCss(directory: string) {
  try {
    await readFile(join(directory, 'preview', 'player.css'));
    return '<link rel="stylesheet" href="./player.css">';
  } catch {
    return '';
  }
}
