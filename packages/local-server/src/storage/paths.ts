import { resolve, sep } from 'node:path';
import { HttpError } from '../errors.ts';

export function contained(root: string, ...parts: string[]) {
  const target = resolve(root, ...parts);
  if (!target.startsWith(resolve(root) + sep))
    throw new HttpError(403, 'Path is outside the workspace.');
  return target;
}
function identifier(value: string) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(value)) throw new HttpError(400, 'Invalid identifier.');
  return value;
}
export const workspaceDirectory = (root: string, id: string) =>
  contained(root, 'workspaces', identifier(id));
export const workspaceFiles = (root: string, id: string) =>
  contained(workspaceDirectory(root, id), 'files');
export const appDirectory = (root: string, id: string, appId: string) =>
  contained(workspaceDirectory(root, id), 'apps', identifier(appId));
