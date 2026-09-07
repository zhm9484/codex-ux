import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VideoStore } from '../packages/local-server/src/video/store.ts';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';

void test('durable revisions support undo, redo, branching, deduplication and isolation', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-ux-storage-'));
  const workspaces = new WorkspaceStore(root);
  let store = new VideoStore(workspaces);
  try {
    const first = store.create(workspaces.create('First').id);
    const other = store.create(workspaces.create('Other').id);
    const change = { requestId: randomUUID(), baseRevision: first.revisionId, label: 'Rename' };
    const second = store.commit(first.workspaceId, change, {
      ...first.revision.document,
      name: 'Second',
    });
    assert.equal(
      store.commit(first.workspaceId, change, first.revision.document).revisionId,
      second.revisionId,
    );
    assert.equal(store.get(first.workspaceId).history.length, 2);
    assert.throws(
      () =>
        store.commit(
          first.workspaceId,
          { ...change, requestId: randomUUID() },
          first.revision.document,
        ),
      /changed/,
    );
    assert.throws(() => store.revision(other.workspaceId, second.revisionId), /not found/);
    assert.equal(store.get(other.workspaceId).name, 'Other');
    const undone = store.travel(first.workspaceId, second.revisionId, 'undo');
    assert.equal(undone.name, 'First');
    assert.equal(undone.canRedo, true);
    const redone = store.travel(first.workspaceId, undone.revisionId, 'redo');
    assert.equal(redone.revisionId, second.revisionId);
    store.travel(first.workspaceId, second.revisionId, 'undo');
    const branch = store.commit(
      first.workspaceId,
      { requestId: randomUUID(), baseRevision: first.revisionId, label: 'Branch' },
      { ...first.revision.document, name: 'Branch' },
    );
    assert.equal(branch.canRedo, false);
    assert.equal(branch.history.length, 3);
    assert.equal(store.revision(first.workspaceId, second.revisionId).document.name, 'Second');
    store.close();
    store = new VideoStore(new WorkspaceStore(root));
    assert.equal(store.get(first.workspaceId).revisionId, branch.revisionId);
    assert.equal(store.get(first.workspaceId).history.length, 3);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
