import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, readdir, stat, copyFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, isAbsolute, basename, dirname } from 'node:path';
import type { ChangeRequest } from '@codex-ux/protocol';
import { starterFiles, type VideoDocument, type Asset } from '@codex-ux/video-domain';
import type { VideoStore } from '../video/store.ts';
import { HttpError } from '../errors.ts';
import { prepareVideo } from '../video/files.ts';
import { videoDirectory, sourceDirectory } from '../video/paths.ts';
import {
  inventory,
  prepareDocument,
  snapshot,
  captureFiles,
  writeProject,
  digest,
  excludedSourceNames,
} from './files.ts';

const require = createRequire(import.meta.url);
const filesKey = (doc: VideoDocument) =>
  digest(
    JSON.stringify(
      Object.entries(doc.files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, f]) => [path, f.hash, f.size]),
    ),
  );
/** The working source and its revision head are serialized together, independently of the engine. */
export class VideoProjects {
  readonly root: string;
  readonly store: VideoStore;
  private queues = new Map<string, Promise<unknown>>();
  private scans = new Map<
    string,
    { signature: string; since: number; accepted?: string | undefined }
  >();
  private errors = new Map<string, string>();
  constructor(root: string, store: VideoStore) {
    this.root = root;
    this.store = store;
  }
  private async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(work);
    this.queues.set(id, task);
    try {
      return await task;
    } finally {
      if (this.queues.get(id) === task) this.queues.delete(id);
    }
  }
  status(id: string) {
    return { directory: sourceDirectory(this.root, id), error: this.errors.get(id) };
  }
  async open(id: string) {
    return this.exclusive(id, async () => {
      if (this.store.has(id)) return this.store.get(id);
      const directory = sourceDirectory(this.root, id);
      await mkdir(directory, { recursive: true });
      const inventoryBefore = await inventory(directory);
      if (inventoryBefore.files.length) {
        const doc = await snapshot(this.root, id, directory, this.store.workspaces.get(id).name);
        await prepareVideo(this.root, id, doc);
        if ((await inventory(directory)).signature !== inventoryBefore.signature)
          throw new HttpError(409, 'Source changed while opening. Try again.');
        return this.store.create(id, doc);
      }
      const stage = join(videoDirectory(this.root, id), 'starter-' + randomUUID());
      try {
        for (const [path, text] of Object.entries(starterFiles())) {
          await mkdir(dirname(join(stage, path)), { recursive: true });
          await writeFile(join(stage, path), text);
        }
        await mkdir(join(stage, 'vendor'), { recursive: true });
        await copyFile(require.resolve('gsap/dist/gsap.min.js'), join(stage, 'vendor/gsap.js'));
        const doc = await snapshot(this.root, id, stage, this.store.workspaces.get(id).name);
        if ((await inventory(directory)).signature !== inventoryBefore.signature)
          throw new HttpError(409, 'Source changed while opening. Try again.');
        await this.checkout(id, doc);
        return this.store.create(id, doc);
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  async importSource(id: string, baseRevision: string, path: string, asset?: Asset) {
    return this.exclusive(id, async () => {
      const current = this.store.get(id);
      this.assertBase(current.revisionId, baseRevision);
      if (!isAbsolute(path))
        throw new HttpError(400, 'Use an absolute source file or project directory.');
      const stage = join(videoDirectory(this.root, id), 'import-' + randomUUID());
      try {
        let directory = path;
        if ((await stat(path)).isFile()) {
          if (!/\.(mp4|webm)$/i.test(path))
            throw new HttpError(415, 'Use an MP4, WebM, or project directory.');
          await mkdir(stage, { recursive: true });
          const entry = basename(path);
          await copyFile(path, join(stage, entry));
          await writeFile(
            join(stage, 'video.json'),
            JSON.stringify({ kind: 'media', entry }, null, 2) + '\n',
          );
          directory = stage;
        }
        const doc = await snapshot(this.root, id, directory, current.name, asset ? [asset] : []);
        await prepareVideo(this.root, id, doc);
        await this.assertUnchanged(id, current.revision.document);
        return await this.commitFiles(
          id,
          { requestId: randomUUID(), baseRevision, label: `Import ${doc.source.kind} source` },
          doc,
        );
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  async sync(id: string) {
    return this.exclusive(id, async () => {
      const current = this.store.get(id);
      const directory = sourceDirectory(this.root, id);
      try {
        const signature = (await inventory(directory)).signature;
        const prior = this.scans.get(id);
        if (prior?.accepted === signature) return;
        if (prior?.signature !== signature) {
          this.scans.set(id, { signature, since: Date.now(), accepted: prior?.accepted });
          return;
        }
        if (Date.now() - prior.since < 650) return;
        const doc = await snapshot(
          this.root,
          id,
          directory,
          current.name,
          current.revision.document.assets,
        );
        if (filesKey(doc) !== filesKey(current.revision.document)) {
          await prepareVideo(this.root, id, doc);
          if ((await inventory(directory)).signature !== signature)
            throw new HttpError(
              409,
              'Source changed while preparing the preview. Waiting for a stable save.',
            );
          this.store.commit(
            id,
            {
              requestId: randomUUID(),
              baseRevision: current.revisionId,
              label: 'Update video source',
            },
            doc,
            'agent',
          );
        }
        this.scans.set(id, { signature, since: Date.now(), accepted: signature });
        this.errors.delete(id);
      } catch (error) {
        this.errors.set(
          id,
          error instanceof Error ? error.message : 'Could not update this video.',
        );
      }
    });
  }
  async commit(
    id: string,
    change: ChangeRequest,
    document: VideoDocument,
    author: 'user' | 'agent' = 'user',
  ) {
    return this.exclusive(id, async () => {
      if (
        this.store
          .database(id)
          .prepare('SELECT revision_id FROM operations WHERE request_id=?')
          .get(change.requestId)
      )
        return this.store.get(id);
      const current = this.store.get(id);
      this.assertBase(current.revisionId, change.baseRevision);
      await this.assertUnchanged(id, current.revision.document);
      const doc = await prepareDocument(this.root, id, document);
      await prepareVideo(this.root, id, doc);
      await this.assertUnchanged(id, current.revision.document);
      return this.commitFiles(id, change, doc, author);
    });
  }
  async travel(id: string, base: string, direction: 'undo' | 'redo') {
    return this.exclusive(id, async () => {
      const current = this.store.get(id);
      await this.assertUnchanged(id, current.revision.document);
      const next = this.store.travel(id, base, direction);
      try {
        await this.checkout(id, next.revision.document);
      } catch (error) {
        this.store.travel(id, next.revisionId, direction === 'undo' ? 'redo' : 'undo');
        throw error;
      }
      this.errors.delete(id);
      return this.store.get(id);
    });
  }
  private assertBase(current: string, base: string) {
    if (current !== base)
      throw new HttpError(409, 'This video has changed. Refresh before saving.', 'stale_revision');
  }
  private async assertUnchanged(id: string, doc: VideoDocument) {
    const actual = await captureFiles(this.root, id, sourceDirectory(this.root, id));
    if (filesKey({ ...doc, files: actual }) !== filesKey(doc))
      throw new HttpError(
        409,
        'Source files have changed. Wait for the preview to update before editing.',
        'stale_revision',
      );
  }
  private async commitFiles(
    id: string,
    change: ChangeRequest,
    doc: VideoDocument,
    author: 'user' | 'agent' = 'user',
  ) {
    const prior = this.store.get(id);
    this.assertBase(prior.revisionId, change.baseRevision);
    await this.checkout(id, doc);
    try {
      const result = this.store.commit(id, change, doc, author);
      this.errors.delete(id);
      return result;
    } catch (error) {
      await this.checkout(id, prior.revision.document);
      throw error;
    }
  }
  private async checkout(id: string, doc: VideoDocument) {
    const directory = sourceDirectory(this.root, id);
    const stage = directory + '-' + randomUUID();
    const backup = stage + '-previous';
    await mkdir(stage, { recursive: true });
    const moved: { from: string; to: string }[] = [];
    let backedUp = false;
    const preserve = async (from: string, to: string) => {
      for (const entry of await readdir(from, { withFileTypes: true })) {
        const old = join(from, entry.name),
          next = join(to, entry.name);
        if (excludedSourceNames.has(entry.name)) {
          await mkdir(to, { recursive: true });
          await rename(old, next);
          moved.push({ from: old, to: next });
        } else if (entry.isDirectory()) await preserve(old, next);
      }
    };
    try {
      await writeProject(this.root, id, doc.files, stage);
      try {
        await rename(directory, backup);
        backedUp = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      try {
        if (backedUp) await preserve(backup, stage);
        await rename(stage, directory);
      } catch (error) {
        for (const move of moved.reverse()) await rename(move.to, move.from);
        if (backedUp) await rename(backup, directory);
        throw error;
      }
      await rm(backup, { recursive: true, force: true });
      const signature = (await inventory(directory)).signature;
      this.scans.set(id, { signature, since: Date.now(), accepted: signature });
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
}
