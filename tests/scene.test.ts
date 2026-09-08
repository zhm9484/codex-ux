import { LibraryStore } from '../packages/local-server/src/storage/library.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { SceneStore } from '../packages/local-server/src/scene/store.ts';
import { SceneProjects } from '../packages/local-server/src/scene/projects.ts';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';
import {
  identityPlacement,
  sceneSchema,
  type SceneProject,
  type SceneOperation,
} from '../packages/scene-domain/src/index.ts';
import { startServer } from '../packages/local-server/src/server.ts';
import { SceneCollaboration } from '../packages/local-server/src/scene/collaboration.ts';
import { prepare } from '../packages/local-server/src/scene/build.ts';
import { capture } from '../packages/local-server/src/scene/files.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-scene-'));
  const workspaces = new WorkspaceStore(root);
  const store = new SceneStore(workspaces);
  const library = new LibraryStore(workspaces);
  const projects = new SceneProjects(store);
  const workspace = workspaces.create('A shared scene');
  const initial = await projects.get(workspace.id);
  return {
    root,
    library,
    store,
    projects,
    workspaces,
    initial,
    id: workspace.id,
    close: async () => {
      library.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
async function observe(projects: SceneProjects, id: string) {
  await projects.get(id);
  await setTimeout(675);
  return projects.get(id);
}

void test('scene transforms are idempotent, undoable and independent from generated geometry and other apps', async () => {
  const f = await fixture();
  try {
    const sibling = join(f.workspaces.context(f.id).filesDirectory, 'video');
    await mkdir(sibling);
    await writeFile(join(sibling, 'keep.txt'), 'unrelated video');
    const source = join(f.initial.source.directory, 'scene.ts');
    const originalTime = (await stat(source)).mtimeMs;
    const original = await readFile(source, 'utf8');
    const placement = { ...identityPlacement(), position: [5, 0, 3] as [number, number, number] };
    const operation: SceneOperation = { type: 'transform', objectId: 'ribbon', placement };
    const requestId = randomUUID();
    const moved = await f.projects.operate(
      f.id,
      f.initial.revisionId,
      requestId,
      'Moved ribbon',
      operation,
    );
    assert.deepEqual(moved.document.placements.ribbon, placement);
    assert.equal(moved.source.codeHash, f.initial.source.codeHash);
    assert.equal(
      (await stat(source)).mtimeMs,
      originalTime,
      'a placement edit does not rewrite code or assets',
    );
    assert.equal(
      (await f.projects.operate(f.id, f.initial.revisionId, requestId, 'Moved ribbon', operation))
        .revisionId,
      moved.revisionId,
    );
    await assert.rejects(
      f.projects.operate(f.id, f.initial.revisionId, randomUUID(), 'Stale move', operation),
      /changed/,
    );
    const undone = await f.projects.travel(f.id, moved.revisionId, randomUUID(), 'undo');
    assert.equal(undone.document.placements.ribbon, undefined);
    const redone = await f.projects.travel(f.id, undone.revisionId, randomUUID(), 'redo');
    assert.deepEqual(redone.document.placements.ribbon, placement);
    await writeFile(source, original.replace('1.05', '1.5'));
    const updated = await observe(f.projects, f.id);
    assert.notEqual(updated.revisionId, redone.revisionId);
    assert.deepEqual(
      updated.document.placements.ribbon,
      placement,
      'regenerating geometry preserves human placement',
    );
    assert.equal(updated.history[0]?.author, 'agent');
    assert.equal(await readFile(join(sibling, 'keep.txt'), 'utf8'), 'unrelated video');
    const restored = await f.projects.restore(
      f.id,
      updated.revisionId,
      randomUUID(),
      f.initial.revisionId,
    );
    assert.notEqual(restored.revisionId, f.initial.revisionId);
    assert.equal(await readFile(source, 'utf8'), original);
    assert.equal(restored.document.placements.ribbon, undefined);
  } finally {
    await f.close();
  }
});

void test('incomplete source and missing resources preserve the last valid scene and block overwrites', async () => {
  const f = await fixture();
  try {
    const file = join(f.initial.source.directory, 'scene.ts');
    const original = await readFile(file, 'utf8');
    await writeFile(file, 'export default function broken( {');
    const failed = await observe(f.projects, f.id);
    assert.equal(failed.revisionId, f.initial.revisionId);
    assert.match(failed.source.error ?? '', /build/i);
    await assert.rejects(
      f.projects.operate(f.id, failed.revisionId, randomUUID(), 'Move', {
        type: 'transform',
        objectId: 'sphere',
        placement: identityPlacement(),
      }),
      /unsaved/,
    );
    await writeFile(file, original);
    const recovered = await observe(f.projects, f.id);
    assert.equal(recovered.source.error, null);
    assert.equal(recovered.revisionId, f.initial.revisionId);
    const document = structuredClone(recovered.document);
    document.objects.push({
      id: 'missing',
      label: 'Missing',
      kind: 'model',
      path: 'missing.glb',
      normalize: true,
    });
    await writeFile(join(f.initial.source.directory, 'scene.json'), JSON.stringify(document));
    const missing = await observe(f.projects, f.id);
    assert.match(missing.source.error ?? '', /Missing model/);
    assert.equal(missing.revisionId, recovered.revisionId);
  } finally {
    await f.close();
  }
});

void test('scene snapshots reject symlink escapes and dependency drift', async () => {
  const f = await fixture();
  try {
    const outside = join(f.root, 'outside.txt');
    await writeFile(outside, 'private');
    const link = join(f.initial.source.directory, 'asset.txt');
    await symlink(outside, link);
    await assert.rejects(capture(f.initial.source.directory, f.projects.blobs(f.id)), /symbolic/i);
    await rm(link);
    await writeFile(
      join(f.initial.source.directory, 'package.json'),
      JSON.stringify({ dependencies: { three: '0.184.0' } }),
    );
    let snapshot = await capture(f.initial.source.directory, f.projects.blobs(f.id));
    await assert.rejects(prepare(snapshot, f.store.directory(f.id)), /0.185.1/);
    await writeFile(
      join(f.initial.source.directory, 'package.json'),
      JSON.stringify({ dependencies: { 'some-extra-library': '1.0.0' } }),
    );
    snapshot = await capture(f.initial.source.directory, f.projects.blobs(f.id));
    await assert.rejects(prepare(snapshot, f.store.directory(f.id)), /pnpm-lock/);
    assert.equal(
      sceneSchema.safeParse({
        ...f.initial.document,
        objects: [f.initial.document.objects[0], f.initial.document.objects[0]],
      }).success,
      false,
    );
    assert.equal(
      sceneSchema.safeParse({ ...f.initial.document, entry: '../escape.ts' }).success,
      false,
    );
    assert.equal(
      sceneSchema.safeParse({
        ...f.initial.document,
        placements: { sphere: { ...identityPlacement(), scale: [0, 1, 1] } },
      }).success,
      false,
    );
  } finally {
    await f.close();
  }
});

void test('scene feedback snapshots its target and candidate, publishes once, and rejects stale publication', async () => {
  const f = await fixture();
  const previousCli = process.env.CODEX_UX_CODEX_BIN;
  try {
    const cli = join(f.root, 'queue');
    const argsFile = join(f.root, 'queue-args.json');
    await writeFile(
      cli,
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));`,
      { mode: 0o755 },
    );
    process.env.CODEX_UX_CODEX_BIN = cli;
    const collaboration = new SceneCollaboration(f.projects, 'http://127.0.0.1:1234', f.library);
    const requestId = randomUUID();
    const target = {
      instanceId: randomUUID(),
      session: { provider: 'codex', sessionId: 'scene-original-task-12345' },
    };
    const feedback = {
      text: 'Make the ribbon wider',
      anchor: null,
      camera: {
        position: [8, 6, 11] as [number, number, number],
        target: [0, 1, 0] as [number, number, number],
      },
      objects: [],
      annotationIds: [],
    };
    const request = await collaboration.submit(
      f.id,
      f.initial.revisionId,
      requestId,
      target,
      feedback,
      undefined,
    );
    target.session.sessionId = 'scene-other-task-67890';
    assert.equal(
      collaboration.context(f.id, requestId).target.session.sessionId,
      'scene-original-task-12345',
    );
    const args = JSON.parse(await readFile(argsFile, 'utf8')) as string[];
    assert.equal(args[2], 'scene-original-task-12345');
    assert.match(args[4]!, /scene.json/);
    const entry = join(request.candidateDirectory, 'scene.ts');
    await writeFile(entry, (await readFile(entry, 'utf8')).replace('1.05', '2.05'));
    const preview = await collaboration.preview(f.id, requestId);
    assert.ok(preview.source.baseUrl.includes('/prepared/'));
    assert.equal(f.store.head(f.id), f.initial.revisionId, 'preview does not publish');
    const published = await collaboration.publish(f.id, requestId, 'Wider ribbon');
    assert.notEqual(published.revisionId, f.initial.revisionId);
    assert.equal(
      (await collaboration.publish(f.id, requestId, 'Wider ribbon')).revisionId,
      published.revisionId,
    );
    const secondId = randomUUID();
    await collaboration.submit(f.id, published.revisionId, secondId, target, feedback, undefined);
    await f.projects.operate(f.id, published.revisionId, randomUUID(), 'User moved ribbon', {
      type: 'transform',
      objectId: 'ribbon',
      placement: identityPlacement(),
    });
    await assert.rejects(collaboration.publish(f.id, secondId, 'Stale candidate'), /changed/);
  } finally {
    if (previousCli === undefined) delete process.env.CODEX_UX_CODEX_BIN;
    else process.env.CODEX_UX_CODEX_BIN = previousCli;
    await f.close();
  }
});

void test('scene HTTP imports keep companion files, enforce conflicts and serve immutable assets with correct types', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scene-http-'));
  const server = await startServer(root, 0);
  try {
    const workspace = server.workspaces.create('Imports');
    const base = `${server.origin}/api/workspaces/${workspace.id}/apps/3d-space`;
    const post = async (path: string, data: unknown) =>
      fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    const initial = (await (await post('', {})).json()) as SceneProject;
    const importId = randomUUID();
    const files = {
      'chair/model.obj': 'mtllib materials.mtl\no Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n',
      'chair/materials.mtl': 'newmtl clay\nKd 0.7 0.4 0.2\n',
      'chair/readme.txt': 'Original companion file',
    };
    for (const [path, bytes] of Object.entries(files)) {
      assert.equal(
        (
          await fetch(`${base}/imports/${importId}/files?path=${encodeURIComponent(path)}`, {
            method: 'POST',
            body: bytes,
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await fetch(`${base}/imports/${importId}/files?path=../outside`, {
          method: 'POST',
          body: 'bad',
        })
      ).status,
      400,
    );
    const change = {
      baseRevision: initial.revisionId,
      requestId: randomUUID(),
      position: [0, 0, 0],
    };
    const importedResponse = await post(`/imports/${importId}/finish`, change);
    assert.equal(importedResponse.status, 200);
    const imported = (await importedResponse.json()) as SceneProject;
    assert.equal(imported.document.objects.length, 3);
    const file = await fetch(
      server.origin + imported.source.baseUrl + `assets/${importId}/chair/readme.txt`,
    );
    assert.equal(await file.text(), files['chair/readme.txt']);
    assert.equal(
      ((await (await post(`/imports/${importId}/finish`, change)).json()) as SceneProject)
        .revisionId,
      imported.revisionId,
    );
    assert.equal(
      (
        await post('/operations', {
          baseRevision: initial.revisionId,
          requestId: randomUUID(),
          label: 'Stale',
          operation: { type: 'transform', objectId: 'sphere', placement: identityPlacement() },
        })
      ).status,
      409,
    );
    const manifest = await fetch(server.origin + imported.source.baseUrl + 'scene.json');
    assert.equal(manifest.headers.get('content-type'), 'application/json');
    const missing = await fetch(
      server.origin + imported.source.baseUrl + 'node_modules/package.json',
    );
    assert.equal(missing.status, 404);
    const engine = await fetch(`${server.origin}/media/3d-space/engine/build/three.module.js`);
    assert.equal(engine.headers.get('content-type'), 'text/javascript');
    assert.equal(engine.status, 200);
    const other = server.workspaces.create('Other workspace');
    assert.equal(
      (
        await fetch(
          `${server.origin}/media/3d-space/source/${other.id}/${imported.revisionId}/scene.json`,
        )
      ).status,
      404,
    );
    await post('/undo', { baseRevision: imported.revisionId, requestId: randomUUID() });
    assert.equal(
      await (
        await fetch(server.origin + imported.source.baseUrl + `assets/${importId}/chair/readme.txt`)
      ).text(),
      files['chair/readme.txt'],
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

void test('3D Space opens legacy app state without losing history or creating a second database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-space-upgrade-'));
  const workspaces = new WorkspaceStore(root);
  const workspace = workspaces.create('Existing space');
  const legacy = workspaces.appDirectory(workspace.id, 'scene-3d');
  await mkdir(legacy, { recursive: true });
  const store = new SceneStore(workspaces);
  const projects = new SceneProjects(store);
  try {
    const initial = await projects.get(workspace.id);
    const moved = await projects.operate(
      workspace.id,
      initial.revisionId,
      randomUUID(),
      'Moved object',
      {
        type: 'transform',
        objectId: 'sphere',
        placement: { ...identityPlacement(), position: [4, 0, 1] },
      },
    );
    assert.equal(store.directory(workspace.id), legacy);
    assert.match(moved.source.baseUrl, /\/media\/3d-space\/source\//);
    store.close();
    const reopened = new SceneStore(workspaces);
    try {
      const restored = await new SceneProjects(reopened).get(workspace.id);
      assert.equal(restored.revisionId, moved.revisionId);
      assert.deepEqual(restored.document.placements.sphere?.position, [4, 0, 1]);
      assert.equal(restored.history.length, 2);
      await assert.rejects(stat(workspaces.appDirectory(workspace.id, '3d-space')), {
        code: 'ENOENT',
      });
    } finally {
      reopened.close();
    }
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

void test('scene requests validate workspace attachments, freeze paths and never redeliver a repeated request', async () => {
  const f = await fixture();
  const previous = process.env.CODEX_UX_CODEX_BIN;
  try {
    const count = join(f.root, 'deliveries');
    const fake = join(f.root, 'fake-codex');
    await writeFile(
      fake,
      `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(count)}, 'sent\\n');`,
      { mode: 0o755 },
    );
    process.env.CODEX_UX_CODEX_BIN = fake;
    const collaboration = new SceneCollaboration(f.projects, 'http://127.0.0.1:1234', f.library);
    const ref = await f.library.upload(f.id, 'palette.txt', Buffer.from('Warm colors'));
    const target = {
      instanceId: randomUUID(),
      session: { provider: 'codex', sessionId: randomUUID() },
    };
    const feedback = {
      text: 'Use the attached palette',
      anchor: null,
      camera: {
        position: [8, 6, 11] as [number, number, number],
        target: [0, 1, 0] as [number, number, number],
      },
      objects: [],
      annotationIds: [],
      attachmentIds: [ref.id],
    };
    const requestId = randomUUID();
    const result = await collaboration.submit(
      f.id,
      f.initial.revisionId,
      requestId,
      target,
      feedback,
      undefined,
    );
    assert.deepEqual(result.attachments, [ref]);
    assert.equal(
      f.store.head(f.id),
      f.initial.revisionId,
      'attaching materials does not edit the scene',
    );
    await writeFile(ref.path, 'Changed palette');
    await collaboration.submit(f.id, f.initial.revisionId, requestId, target, feedback, undefined);
    assert.equal(await readFile(count, 'utf8'), 'sent\n');
    assert.equal(collaboration.context(f.id, requestId).attachments[0]!.size, ref.size);
    await assert.rejects(
      collaboration.submit(f.id, f.initial.revisionId, randomUUID(), target, feedback, undefined),
      /changed/,
    );
    const other = f.workspaces.create('Other workspace');
    const foreign = await f.library.upload(other.id, 'private.txt', Buffer.from('Other workspace'));
    await assert.rejects(
      collaboration.submit(
        f.id,
        f.initial.revisionId,
        randomUUID(),
        target,
        { ...feedback, attachmentIds: [foreign.id] },
        undefined,
      ),
      /not found/,
    );
    await rm(ref.path);
    await assert.rejects(
      collaboration.submit(f.id, f.initial.revisionId, randomUUID(), target, feedback, undefined),
      /unavailable/,
    );
    assert.equal(
      await readFile(count, 'utf8'),
      'sent\n',
      'invalid references fail before delivery',
    );
  } finally {
    if (previous === undefined) delete process.env.CODEX_UX_CODEX_BIN;
    else process.env.CODEX_UX_CODEX_BIN = previous;
    await f.close();
  }
});
