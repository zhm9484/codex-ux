import { lstat, readdir, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { HttpError } from '../errors.ts';

/** List one directory without following links outside the workspace. */
export async function listWorkspaceFiles(root: string, path: string) {
  const parts = path.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.' || part.includes('\\')))
    throw new HttpError(400, 'Invalid directory path.');
  let directory = root;
  for (const part of parts) {
    directory = join(directory, part);
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new HttpError(403, 'Only workspace directories can be opened.');
  }
  const resolved = await realpath(directory);
  const base = await realpath(root);
  if (resolved !== base && !resolved.startsWith(base + sep))
    throw new HttpError(403, 'Path is outside the workspace.');
  const entries = await readdir(directory, { withFileTypes: true });
  return {
    path: parts.join('/'),
    entries: entries
      .filter((entry) => entry.name !== '.DS_Store')
      .map((entry) => ({
        name: entry.name,
        kind: entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : 'file',
      }))
      .sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
      ),
  };
}
