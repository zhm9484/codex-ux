import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyOperation,
  type SceneOperation,
  type SceneProject,
  type SceneSnapshot,
} from '@codex-ux/scene-domain';
import type { SceneStore } from './store.ts';
import { capture, checkout, hash, scan, starterCode, starterScene } from './files.ts';
import { prepare } from './build.ts';
import { HttpError } from '../errors.ts';

interface SourceStatus {
  signature: string;
  pending: string;
  since: number;
  error: string | null;
}
export class SceneProjects {
  readonly store: SceneStore;
  private locks = new Map<string, Promise<unknown>>();
  private statuses = new Map<string, SourceStatus>();
  constructor(store: SceneStore) {
    this.store = store;
  }
  sourceDirectory(id: string) {
    return join(this.store.workspaces.context(id).filesDirectory, 'scene');
  }
  blobs(id: string) {
    return join(this.store.directory(id), 'blobs');
  }
  exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(id) ?? Promise.resolve()).catch(() => {}).then(work);
    this.locks.set(id, next);
    void next
      .finally(() => {
        if (this.locks.get(id) === next) this.locks.delete(id);
      })
      .catch(() => {});
    return next;
  }
  async initialize(id: string) {
    if (this.store.row(id)) return;
    const source = this.sourceDirectory(id);
    await mkdir(source, { recursive: true });
    if (!(await readdir(source)).length) {
      await writeFile(join(source, 'scene.json'), JSON.stringify(starterScene, null, 2) + '\n');
      await writeFile(join(source, 'scene.ts'), starterCode);
    }
    const snapshot = await capture(source, this.blobs(id));
    await prepare(snapshot, this.store.directory(id));
    this.store.commit(id, snapshot, 'A place to begin', 'user');
    await this.markCurrent(id);
  }
  async markCurrent(id: string) {
    this.statuses.set(id, {
      signature: (await scan(this.sourceDirectory(id))).signature,
      pending: '',
      since: 0,
      error: null,
    });
  }
  context(id: string): SceneProject {
    const revisionId = this.store.head(id);
    const revision = this.store.revision(id, revisionId);
    const status = this.statuses.get(id);
    const media = `/media/3d-space`;
    return {
      workspaceId: id,
      revisionId,
      document: revision.snapshot.document,
      history: this.store.history(id),
      canUndo: revision.parentId !== null,
      canRedo: (JSON.parse(this.store.row(id)!.redo) as string[]).length > 0,
      source: {
        directory: this.sourceDirectory(id),
        codeHash: revision.snapshot.codeHash,
        bundleUrl: revision.snapshot.document.entry
          ? `${media}/bundle/${id}/${revision.snapshot.codeHash}/module.js`
          : null,
        baseUrl: `${media}/source/${id}/${revisionId}/`,
        error: status?.error ?? null,
        pending: !!status?.pending,
      },
    };
  }
  async get(id: string) {
    return this.exclusive(id, async () => {
      await this.initialize(id);
      try {
        const signature = (await scan(this.sourceDirectory(id))).signature;
        const status = this.statuses.get(id);
        if (status?.signature === signature) return this.context(id);
        if (!status || status.pending !== signature) {
          this.statuses.set(id, {
            signature: status?.signature ?? '',
            pending: signature,
            since: Date.now(),
            error: null,
          });
          return this.context(id);
        }
        if (status.error || Date.now() - status.since < 650) return this.context(id);
        const snapshot = await capture(this.sourceDirectory(id), this.blobs(id));
        await prepare(snapshot, this.store.directory(id));
        if ((await scan(this.sourceDirectory(id))).signature !== signature)
          throw new HttpError(409, 'Waiting for a stable source save.');
        const current = this.store.revision(id, this.store.head(id));
        if (JSON.stringify(snapshot.files) !== JSON.stringify(current.snapshot.files))
          this.store.commit(id, snapshot, 'Updated scene source', 'agent');
        await this.markCurrent(id);
      } catch (error) {
        const status = this.statuses.get(id) ?? {
          signature: '',
          pending: '',
          since: 0,
          error: null,
        };
        status.error = error instanceof Error ? error.message : 'Could not read scene source.';
        this.statuses.set(id, status);
      }
      return this.context(id);
    });
  }
  async assertCurrent(id: string, base: string) {
    if (this.store.head(id) !== base)
      throw new HttpError(
        409,
        'The scene changed. Review the latest version before editing.',
        'stale_revision',
      );
    const signature = (await scan(this.sourceDirectory(id))).signature;
    if (signature === this.statuses.get(id)?.signature) return signature;
    const snapshot = await capture(this.sourceDirectory(id), this.blobs(id));
    if (
      JSON.stringify(snapshot.files) !==
      JSON.stringify(this.store.revision(id, base).snapshot.files)
    )
      throw new HttpError(
        409,
        'Scene source has unsaved changes. Wait for a valid source update before editing.',
        'source_changed',
      );
    return signature;
  }
  async operate(
    id: string,
    base: string,
    operationId: string,
    label: string,
    operation: SceneOperation,
  ) {
    return this.exclusive(id, async () => {
      await this.initialize(id);
      if (this.store.committed(id, operationId)) return this.context(id);
      const signature = await this.assertCurrent(id, base);
      const previous = this.store.revision(id, base).snapshot;
      const document = applyOperation(previous.document, operation);
      if (operation.type === 'annotate' && operation.annotation.anchor.revisionId !== base)
        throw new HttpError(
          409,
          'This annotation belongs to an earlier view. Select the point again.',
        );
      const bytes = Buffer.from(JSON.stringify(document, null, 2) + '\n');
      const digest = hash(bytes);
      await writeFile(join(this.blobs(id), digest), bytes);
      const snapshot = {
        ...previous,
        document,
        files: { ...previous.files, 'scene.json': { hash: digest, size: bytes.length } },
      };
      await this.accept(id, snapshot, base, signature, label, 'user', operationId);
      return this.context(id);
    });
  }
  async accept(
    id: string,
    snapshot: SceneSnapshot,
    base: string,
    signature: string,
    label: string,
    author: 'user' | 'agent',
    operationId: string,
  ) {
    await prepare(snapshot, this.store.directory(id));
    if (
      this.store.head(id) !== base ||
      (await scan(this.sourceDirectory(id))).signature !== signature
    )
      throw new HttpError(
        409,
        'The scene changed during preparation. Review the latest version before publishing.',
        'stale_revision',
      );
    const previous = this.store.revision(id, base).snapshot;
    try {
      await checkout(snapshot, this.blobs(id), this.sourceDirectory(id), previous);
      this.store.commit(id, snapshot, label, author, operationId);
      await this.markCurrent(id);
    } catch (error) {
      // Keep a recoverable working copy when a write fails before committing the head.
      if (this.store.head(id) === base)
        await checkout(previous, this.blobs(id), this.sourceDirectory(id)).catch(() => {});
      throw error;
    }
  }
  async travel(id: string, base: string, operationId: string, direction: 'undo' | 'redo') {
    return this.exclusive(id, async () => {
      if (this.store.committed(id, operationId)) return this.context(id);
      await this.assertCurrent(id, base);
      const { target, redo } = this.store.travelTarget(id, direction);
      await checkout(
        this.store.revision(id, target).snapshot,
        this.blobs(id),
        this.sourceDirectory(id),
        this.store.revision(id, base).snapshot,
      );
      const db = this.store.database(id);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE project SET head=?,redo=? WHERE id=1').run(target, JSON.stringify(redo));
        db.prepare('INSERT INTO operations VALUES(?,?)').run(operationId, target);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      await this.markCurrent(id);
      return this.context(id);
    });
  }
  async restore(id: string, base: string, operationId: string, revisionId: string) {
    return this.exclusive(id, async () => {
      if (this.store.committed(id, operationId)) return this.context(id);
      const signature = await this.assertCurrent(id, base);
      const revision = this.store.revision(id, revisionId);
      await this.accept(
        id,
        revision.snapshot,
        base,
        signature,
        `Restored ${revision.label}`,
        'user',
        operationId,
      );
      return this.context(id);
    });
  }
}
