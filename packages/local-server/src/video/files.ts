import { mkdir, writeFile, readFile, copyFile, access } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { videoSchema, type Revision, type VideoDocument } from '@codex-ux/video-domain';
import { compositionHtml, sceneHtml } from './composition.ts';
import { writeNative } from '../native/files.ts';
import { HttpError } from '../errors.ts';

const require = createRequire(import.meta.url);
export function contained(root: string, ...parts: string[]) {
  const target = resolve(root, ...parts);
  if (!target.startsWith(resolve(root) + sep))
    throw new HttpError(403, 'Path is outside the workspace.');
  return target;
}
export const workspaceDirectory = (root: string, id: string) => contained(root, 'workspaces', id);
export async function materialize(root: string, workspaceId: string, revision: Revision) {
  const dir = contained(workspaceDirectory(root, workspaceId), 'revisions', revision.id);
  try {
    await access(join(dir, '.ready'));
    return dir;
  } catch {
    /* Build only immutable, complete revisions. */
  }
  if (revision.document.native) {
    await mkdir(dir, { recursive: true });
    await writeNative(root, workspaceId, revision.document, dir);
    await writeFile(join(dir, '.ready'), 'ready');
    return dir;
  }
  await mkdir(join(dir, 'scenes'), { recursive: true });
  await mkdir(join(dir, 'assets'), { recursive: true });
  await mkdir(join(dir, 'vendor'), { recursive: true });
  const doc = revision.document;
  await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(dir, 'vendor/gsap.js'));
  for (const asset of doc.assets)
    await copyFile(
      contained(workspaceDirectory(root, workspaceId), 'assets', asset.file),
      join(dir, 'assets', asset.file),
    );
  for (const c of doc.clips) {
    if (c.kind === 'scene' && c.sourceId)
      await writeFile(
        join(dir, 'scenes', `${c.id}.html`),
        sceneHtml(doc.sources[c.sourceId] ?? '', c, doc),
      );
  }
  await writeFile(join(dir, 'index.html'), compositionHtml(doc));
  await writeFile(join(dir, '.ready'), 'ready');
  return dir;
}
export async function writeCandidate(
  root: string,
  workspaceId: string,
  requestId: string,
  revision: Revision,
) {
  const dir = contained(workspaceDirectory(root, workspaceId), 'requests', requestId);
  await mkdir(join(dir, 'scenes'), { recursive: true });
  if (revision.document.native) await writeNative(root, workspaceId, revision.document, dir);
  else await writeFile(join(dir, 'project.json'), JSON.stringify(revision.document, null, 2));
  for (const [id, source] of Object.entries(revision.document.sources))
    await writeFile(join(dir, 'scenes', `${id}.html`), source);
  return dir;
}
export async function readCandidate(
  root: string,
  workspaceId: string,
  requestId: string,
): Promise<VideoDocument> {
  const dir = contained(workspaceDirectory(root, workspaceId), 'requests', requestId);
  const doc = videoSchema.parse(JSON.parse(await readFile(join(dir, 'project.json'), 'utf8')));
  for (const id of Object.keys(doc.sources))
    doc.sources[id] = await readFile(contained(dir, 'scenes', `${id}.html`), 'utf8');
  return videoSchema.parse(doc);
}
