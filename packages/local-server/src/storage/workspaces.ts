import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Workspace } from '@codex-ux/protocol';
import { HttpError } from '../errors.ts';
import { appDirectory, workspaceDirectory, workspaceFiles } from './paths.ts';

const metadata = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  createdAt: z.iso.datetime(),
});

/** Workspace identity lives beside its files, independently of any app database. */
export class WorkspaceStore {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
    mkdirSync(join(root, 'workspaces'), { recursive: true });
  }
  list(): Workspace[] {
    return readdirSync(join(this.root, 'workspaces'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => this.get(entry.name))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }
  get(id: string): Workspace {
    let text: string;
    try {
      text = readFileSync(join(workspaceDirectory(this.root, id), 'workspace.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new HttpError(404, 'Workspace metadata not found.');
      throw error;
    }
    const workspace = metadata.parse(JSON.parse(text));
    if (workspace.id !== id) throw new HttpError(400, 'Workspace directory and identity disagree.');
    return workspace;
  }
  create(name: string): Workspace {
    const workspace = metadata.parse({
      id: randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    });
    const directory = workspaceDirectory(this.root, workspace.id);
    const stage = join(this.root, 'workspaces', `.create-${workspace.id}`);
    try {
      mkdirSync(join(stage, 'files'), { recursive: true });
      mkdirSync(join(stage, 'apps'));
      writeFileSync(join(stage, 'workspace.json'), JSON.stringify(workspace, null, 2) + '\n');
      renameSync(stage, directory);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
    return workspace;
  }
  context(id: string) {
    return {
      ...this.get(id),
      directory: workspaceDirectory(this.root, id),
      filesDirectory: workspaceFiles(this.root, id),
    };
  }
  appDirectory(id: string, appId: string) {
    this.get(id);
    return appDirectory(this.root, id, appId);
  }
}
