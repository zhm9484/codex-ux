import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';
import { workspaceDirectory, workspaceFiles } from '../packages/local-server/src/storage/paths.ts';
import { VideoStore } from '../packages/local-server/src/video/store.ts';
import { NativeProjects } from '../packages/local-server/src/native/projects.ts';

void test('workspaces are portable file containers and app data stays independent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-ux-workspaces-'));
  const workspaces = new WorkspaceStore(join(root, 'first'));
  const videos = new VideoStore(workspaces);
  let copiedVideos: VideoStore | undefined;
  try {
    const workspace = workspaces.create('Launch');
    const directory = workspaceDirectory(workspaces.root, workspace.id);
    assert.deepEqual(
      JSON.parse(readFileSync(join(directory, 'workspace.json'), 'utf8')),
      workspace,
    );
    assert.deepEqual(readdirSync(directory).sort(), ['apps', 'files', 'workspace.json']);
    assert.deepEqual(readdirSync(join(directory, 'apps')), []);
    assert.equal(videos.has(workspace.id), false);
    assert.equal(existsSync(join(workspaces.root, 'state.sqlite')), false);
    writeFileSync(join(workspaceFiles(workspaces.root, workspace.id), 'brief.md'), 'Shared brief');
    const another = workspaces.appDirectory(workspace.id, 'another-app');
    mkdirSync(another);
    writeFileSync(join(another, 'state.json'), '{"document":"independent"}');
    const native = new NativeProjects(workspaces.root, videos);
    const [first, second] = await Promise.all([
      native.open(workspace.id),
      native.open(workspace.id),
    ]);
    assert.equal(first.revisionId, second.revisionId);
    assert.equal(first.history.length, 1);
    const change = { requestId: randomUUID(), baseRevision: first.revisionId, label: 'Name video' };
    const saved = await native.commit(workspace.id, change, {
      ...first.revision.document,
      name: 'Video title',
    });
    assert.equal(saved.name, 'Video title');
    assert.equal(workspaces.get(workspace.id).name, 'Launch');
    await native.travel(workspace.id, saved.revisionId, 'undo');
    assert.equal(
      readFileSync(join(workspaceFiles(workspaces.root, workspace.id), 'brief.md'), 'utf8'),
      'Shared brief',
    );
    assert.equal(readFileSync(join(another, 'state.json'), 'utf8'), '{"document":"independent"}');
    assert.throws(() => workspaces.appDirectory(workspace.id, '../outside'), /Invalid/);
    videos.close();
    const copied = new WorkspaceStore(join(root, 'second'));
    cpSync(directory, workspaceDirectory(copied.root, workspace.id), { recursive: true });
    assert.deepEqual(copied.list(), [workspace]);
    copiedVideos = new VideoStore(copied);
    assert.equal(copiedVideos.get(workspace.id).revisionId, first.revisionId);
    assert.equal(copiedVideos.get(workspace.id).history.length, 2);
  } finally {
    videos.close();
    copiedVideos?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
