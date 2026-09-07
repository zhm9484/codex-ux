import { randomUUID } from 'node:crypto';
import { cp, mkdir, rename, rm } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import type { ChangeRequest } from '@codex-ux/protocol';
import type { VideoDocument } from '@codex-ux/video-domain';
import type { WorkspaceStore } from '../storage/workspaces.ts';
import { HttpError } from '../errors.ts';
import { materialize, workspaceDirectory } from '../video/files.ts';
import {
  inventory,
  prepareNative,
  sameProject,
  snapshot,
  sourceDirectory,
  writeNative,
} from './files.ts';

/** One serialized file transaction per workspace; filesystem saves become ordinary revisions. */
export class NativeProjects {
  readonly root: string;
  readonly store: WorkspaceStore;
  constructor(root: string, store: WorkspaceStore) {
    this.root = root;
    this.store = store;
  }
  private queues = new Map<string, Promise<unknown>>();
  private scans = new Map<
    string,
    { signature: string; since: number; accepted?: string | undefined }
  >();
  private errors = new Map<string, string>();
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
  async enable(id: string, directory?: string) {
    return this.exclusive(id, async () => {
      const w = this.store.get(id);
      if (!directory && w.revision.document.native) return w;
      if (directory && !isAbsolute(directory))
        throw new HttpError(400, 'Use an absolute project directory.');
      const source = directory ?? (await materialize(this.root, id, w.revision));
      const stage = join(workspaceDirectory(this.root, id), `import-${randomUUID()}`);
      try {
        await mkdir(stage, { recursive: true });
        if (directory) {
          // Inventory validates the input before copying; never follow links out of a project.
          await inventory(directory);
          await cp(source, stage, { recursive: true, dereference: false });
        } else {
          await cp(source, stage, { recursive: true });
          await rm(join(stage, '.ready'), { force: true });
        }
        const doc = await snapshot(this.root, id, stage, w.revision.document);
        return await this.commitFiles(
          id,
          {
            requestId: randomUUID(),
            baseRevision: w.revisionId,
            label: directory ? 'Import HyperFrames project' : 'Open native HyperFrames source',
          },
          doc,
        );
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    });
  }
  async sync(id: string) {
    return this.exclusive(id, async () => {
      const w = this.store.get(id);
      if (!w.revision.document.native) return;
      try {
        const directory = sourceDirectory(this.root, id);
        const signature = (await inventory(directory)).signature;
        const prior = this.scans.get(id);
        if (prior?.accepted === signature) return;
        if (prior?.signature !== signature) {
          this.scans.set(id, { signature, since: Date.now(), accepted: prior?.accepted });
          return;
        }
        if (Date.now() - prior.since < 650) return;
        const doc = await snapshot(this.root, id, directory, w.revision.document);
        if (!sameProject(doc, w.revision.document))
          this.store.commit(
            id,
            {
              requestId: randomUUID(),
              baseRevision: w.revisionId,
              label: 'Update HyperFrames source',
            },
            doc,
            'agent',
          );
        this.scans.set(id, { signature, since: Date.now(), accepted: signature });
        this.errors.delete(id);
      } catch (error) {
        this.errors.set(
          id,
          error instanceof Error ? error.message : 'Could not update the project.',
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
        this.store.db
          .prepare('SELECT revision_id FROM operations WHERE workspace_id=? AND request_id=?')
          .get(id, change.requestId)
      )
        return this.store.get(id);
      const current = this.store.get(id);
      if (current.revision.document.native)
        await this.assertUnchanged(id, current.revision.document);
      return this.commitFiles(id, change, await prepareNative(this.root, id, document), author);
    });
  }
  async travel(id: string, base: string, direction: 'undo' | 'redo') {
    return this.exclusive(id, async () => {
      const current = this.store.get(id);
      if (current.revision.document.native)
        await this.assertUnchanged(id, current.revision.document);
      const next = this.store.travel(id, base, direction);
      try {
        if (next.revision.document.native) await this.checkout(id, next.revision.document);
      } catch (error) {
        this.store.travel(id, next.revisionId, direction === 'undo' ? 'redo' : 'undo');
        throw error;
      }
      return this.store.get(id);
    });
  }
  private async assertUnchanged(id: string, doc: VideoDocument) {
    const actual = await snapshot(this.root, id, sourceDirectory(this.root, id), doc);
    if (!sameProject(actual, doc))
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
    if (prior.revisionId !== change.baseRevision)
      throw new HttpError(409, 'This video has changed. Refresh before saving.', 'stale_revision');
    if (doc.native) await this.checkout(id, doc);
    try {
      const result = this.store.commit(id, change, doc, author);
      this.errors.delete(id);
      return result;
    } catch (error) {
      if (prior.revision.document.native) await this.checkout(id, prior.revision.document);
      throw error;
    }
  }
  private async checkout(id: string, doc: VideoDocument) {
    const directory = sourceDirectory(this.root, id);
    const stage = `${directory}-${randomUUID()}`;
    const backup = `${stage}-previous`;
    await mkdir(stage, { recursive: true });
    try {
      await writeNative(this.root, id, doc, stage);
      let moved = false;
      try {
        await rename(directory, backup);
        moved = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      try {
        await rename(stage, directory);
      } catch (error) {
        if (moved) await rename(backup, directory);
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
