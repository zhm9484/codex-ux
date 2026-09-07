import { join } from 'node:path';
import { appDirectory, workspaceFiles } from '../storage/paths.ts';
export const videoDirectory = (root: string, id: string) => appDirectory(root, id, 'video-editor');
export const sourceDirectory = (root: string, id: string) =>
  join(workspaceFiles(root, id), 'video');
export const blobsDirectory = (root: string, id: string) => join(videoDirectory(root, id), 'blobs');
