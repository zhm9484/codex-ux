import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listWorkspaceFiles } from '../packages/local-server/src/storage/files.ts';

void test('workspace browser lists nested files and refuses traversal and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workspace-files-'));
  try {
    await mkdir(join(root, 'video'));
    await writeFile(join(root, 'video', 'index.html'), 'source');
    await symlink(tmpdir(), join(root, 'outside'));
    assert.deepEqual(await listWorkspaceFiles(root, 'video'), {
      path: 'video',
      entries: [{ name: 'index.html', kind: 'file' }],
    });
    assert.equal((await listWorkspaceFiles(root, '')).entries[0]!.name, 'video');
    await assert.rejects(listWorkspaceFiles(root, '../'));
    await assert.rejects(listWorkspaceFiles(root, 'outside'));
    await assert.rejects(listWorkspaceFiles(root, 'video/../../'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
