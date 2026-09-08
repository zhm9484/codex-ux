import type { LibraryStore } from '../storage/library.ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LibraryReference, CollaborationTarget } from '@codex-ux/protocol';
import type {
  SceneDocument,
  SceneFeedback,
  SceneProject,
  SceneSnapshot,
} from '@codex-ux/scene-domain';
import { deliver } from '../agents.ts';
import { HttpError } from '../errors.ts';
import { capture, hash, materialize } from './files.ts';
import { prepare } from './build.ts';
import type { SceneProjects } from './projects.ts';

interface RequestContext {
  requestId: string;
  workspaceId: string;
  appId: '3d-space';
  baseRevision: string;
  target: CollaborationTarget;
  feedback: SceneFeedback;
  attachments: LibraryReference[];
  document: SceneDocument;
  candidateDirectory: string;
  screenshotPath: string | null;
}
interface RequestRow {
  id: string;
  context: string;
  state: string;
  error: string | null;
  revision_id: string | null;
}
export class SceneCollaboration {
  readonly projects: SceneProjects;
  readonly origin: string;
  readonly library: LibraryStore;
  constructor(projects: SceneProjects, origin: string, library: LibraryStore) {
    this.projects = projects;
    this.origin = origin;
    this.library = library;
  }
  row(id: string, requestId: string) {
    const row = this.projects.store
      .database(id)
      .prepare('SELECT * FROM requests WHERE id=?')
      .get(requestId) as unknown as RequestRow | undefined;
    if (!row) throw new HttpError(404, 'Scene request not found.');
    return row;
  }
  context(id: string, requestId: string) {
    const row = this.row(id, requestId);
    const context = JSON.parse(row.context) as RequestContext;
    return {
      ...context,
      attachments: context.attachments ?? [],
      appId: '3d-space' as const,
      state: row.state,
      error: row.error,
      publishedRevision: row.revision_id,
      currentRevision: this.projects.store.head(id),
      previewUrl: `${this.origin}/apps/3d-space/w/${id}?candidate=${requestId}`,
      publishUrl: `${this.origin}/api/workspaces/${id}/apps/3d-space/requests/${requestId}/publish`,
    };
  }
  list(id: string) {
    return (
      this.projects.store
        .database(id)
        .prepare('SELECT * FROM requests ORDER BY rowid DESC LIMIT 30')
        .all() as unknown as RequestRow[]
    ).map((row) => {
      const context = JSON.parse(row.context) as RequestContext;
      return {
        id: row.id,
        state: row.state,
        error: row.error,
        text: context.feedback.text,
        annotationIds: context.feedback.annotationIds,
      };
    });
  }
  async submit(
    id: string,
    base: string,
    requestId: string,
    target: CollaborationTarget,
    feedback: SceneFeedback,
    screenshot: string | undefined,
  ) {
    const created = await this.projects.exclusive(id, async () => {
      const db = this.projects.store.database(id);
      if (db.prepare('SELECT id FROM requests WHERE id=?').get(requestId)) return false;
      await this.projects.assertCurrent(id, base);
      if (feedback.anchor && feedback.anchor.revisionId !== base)
        throw new HttpError(
          409,
          'The scene changed since this point was selected. Select it again.',
        );
      const snapshot = this.projects.store.revision(id, base).snapshot;
      if (
        feedback.annotationIds.some(
          (noteId) => !snapshot.document.annotations.some((note) => note.id === noteId),
        )
      )
        throw new HttpError(409, 'An annotation no longer exists. Refresh before sending.');
      const attachments = await this.library.validate(id, feedback.attachmentIds ?? []);
      const directory = join(this.projects.store.directory(id), 'requests', requestId);
      const context: RequestContext = {
        requestId,
        workspaceId: id,
        appId: '3d-space',
        baseRevision: base,
        target,
        feedback,
        attachments,
        document: snapshot.document,
        candidateDirectory: join(directory, 'source'),
        screenshotPath: screenshot ? join(directory, 'view.png') : null,
      };
      db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(
        requestId,
        JSON.stringify(context),
        'preparing',
        null,
        null,
      );
      try {
        await materialize(snapshot, this.projects.blobs(id), context.candidateDirectory);
        if (screenshot) {
          const bytes = Buffer.from(screenshot.slice('data:image/png;base64,'.length), 'base64');
          if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            throw new HttpError(400, 'Expected a PNG scene capture.');
          await writeFile(context.screenshotPath!, bytes);
        }
        db.prepare("UPDATE requests SET state='sending' WHERE id=?").run(requestId);
      } catch (error) {
        db.prepare("UPDATE requests SET state='failed',error=? WHERE id=?").run(
          error instanceof Error ? error.message : 'Preparation failed.',
          requestId,
        );
        throw error;
      }
      return true;
    });
    if (created) {
      const endpoint = `${this.origin}/api/workspaces/${id}/apps/3d-space/requests/${requestId}`;
      try {
        await deliver(
          target.session,
          `3D Space feedback request ${requestId}, explicitly sent by the user. GET ${endpoint} for the captured camera, selected point/object, visible object IDs and transforms, annotations, attachment references with absolute paths, screenshot path, and isolated candidate directory. Read referenced materials from their original paths and copy only resources used in the scene into the candidate; leave originals untouched. Edit only that candidate for this request. scene.json stores imported objects, user placements and annotations; preserve them unless the request changes them. The entry (normally scene.ts) exports a default function createScene(ctx), optionally async. Use ordinary Three.js imports; ctx.scene, ctx.root, ctx.register(id, object, label), ctx.assetUrl(path), ctx.loadModel(path), ctx.onFrame(callback), ctx.onClick(object, callback), ctx.onDispose(callback), and ctx.invalidate() are available. Keep registered IDs stable. Three.js is pinned to 0.185.1; extra packages require package.json and a pnpm-lock.yaml (install scripts are disabled). The registered root's placement belongs to the editor; animate children. Inspect the preview URL from the context before publishing. POST {"label":"A concise description"} to ${endpoint}/publish once; publication checks the base and creates an undoable version. If blocked POST {"message":"..."} to ${endpoint}/error. Do not edit app-private blobs/builds/database or queue another agent session.`,
        );
        this.projects.store
          .database(id)
          .prepare("UPDATE requests SET state='sent' WHERE id=? AND state='sending'")
          .run(requestId);
      } catch (error) {
        this.projects.store
          .database(id)
          .prepare(
            "UPDATE requests SET state='delivery-unknown',error=? WHERE id=? AND state='sending'",
          )
          .run(error instanceof Error ? error.message : 'Delivery not confirmed.', requestId);
        throw new HttpError(
          502,
          'Delivery could not be confirmed. Check the connected task before sending again.',
        );
      }
    }
    return this.context(id, requestId);
  }
  async preview(id: string, requestId: string): Promise<SceneProject> {
    return this.projects.exclusive(id, async () => {
      const request = this.context(id, requestId);
      const snapshot = await capture(request.candidateDirectory, this.projects.blobs(id));
      await prepare(snapshot, this.projects.store.directory(id));
      const key = hash(JSON.stringify(snapshot.files));
      const directory = join(this.projects.store.directory(id), 'previews');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${key}.json`), JSON.stringify(snapshot));
      return {
        ...this.projects.context(id),
        revisionId: request.baseRevision,
        document: snapshot.document,
        history: [],
        canUndo: false,
        canRedo: false,
        source: {
          directory: request.candidateDirectory,
          codeHash: snapshot.codeHash,
          bundleUrl: snapshot.document.entry
            ? `/media/3d-space/bundle/${id}/${snapshot.codeHash}/module.js`
            : null,
          baseUrl: `/media/3d-space/prepared/${id}/${key}/`,
          error: null,
          pending: false,
        },
      };
    });
  }
  async previewSnapshot(id: string, key: string) {
    return JSON.parse(
      await readFile(join(this.projects.store.directory(id), 'previews', `${key}.json`), 'utf8'),
    ) as SceneSnapshot;
  }
  async publish(id: string, requestId: string, label: string) {
    return this.projects.exclusive(id, async () => {
      const row = this.row(id, requestId);
      if (row.state === 'published') return this.projects.context(id);
      if (row.state === 'failed')
        throw new HttpError(409, 'This request has failed. Send a new request.');
      const request = this.context(id, requestId);
      const signature = await this.projects.assertCurrent(id, request.baseRevision);
      const snapshot = await capture(request.candidateDirectory, this.projects.blobs(id));
      await this.projects.accept(
        id,
        snapshot,
        request.baseRevision,
        signature,
        label,
        'agent',
        requestId,
      );
      this.projects.store
        .database(id)
        .prepare("UPDATE requests SET state='published',revision_id=?,error=NULL WHERE id=?")
        .run(this.projects.store.head(id), requestId);
      return this.projects.context(id);
    });
  }
}
