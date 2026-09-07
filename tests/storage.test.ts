import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../packages/local-server/src/storage/database.ts';
import { WorkspaceStore } from '../packages/local-server/src/storage/workspaces.ts';

void test('durable revisions support undo, redo, branching, deduplication and isolation', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-ux-storage-'));
  let db = openDatabase(root);
  try {
    let store = new WorkspaceStore(db);
    const first = store.create('First');
    const other = store.create('Other');
    const change = { requestId: randomUUID(), baseRevision: first.revisionId, label: 'Rename' };
    const second = store.commit(first.id, change, { ...first.revision.document, name: 'Second' });
    assert.equal(
      store.commit(first.id, change, first.revision.document).revisionId,
      second.revisionId,
    );
    assert.equal(store.get(first.id).history.length, 2);
    assert.throws(
      () => store.commit(first.id, { ...change, requestId: randomUUID() }, first.revision.document),
      /changed/,
    );
    assert.throws(() => store.revision(other.id, second.revisionId), /not found/);
    assert.equal(store.get(other.id).name, 'Other');
    const undone = store.travel(first.id, second.revisionId, 'undo');
    assert.equal(undone.name, 'First');
    assert.equal(undone.canRedo, true);
    const redone = store.travel(first.id, undone.revisionId, 'redo');
    assert.equal(redone.revisionId, second.revisionId);
    store.travel(first.id, second.revisionId, 'undo');
    const branch = store.commit(
      first.id,
      { requestId: randomUUID(), baseRevision: first.revisionId, label: 'Branch' },
      { ...first.revision.document, name: 'Branch' },
    );
    assert.equal(branch.canRedo, false);
    assert.equal(branch.history.length, 3);
    assert.equal(store.revision(first.id, second.revisionId).document.name, 'Second');
    db.close();
    db = openDatabase(root);
    store = new WorkspaceStore(db);
    assert.equal(store.get(first.id).revisionId, branch.revisionId);
    assert.equal(store.get(first.id).history.length, 3);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
