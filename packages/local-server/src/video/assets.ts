import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Asset } from '@codex-ux/video-domain';
import { videoDirectory } from './files.ts';
import { HttpError } from '../errors.ts';
import { mediaDuration } from './probe.ts';

const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};
export async function saveAsset(
  root: string,
  workspaceId: string,
  name: string,
  mime: string,
  bytes: Buffer,
): Promise<Asset> {
  const extension = extensions[mime];
  if (!extension)
    throw new HttpError(415, 'Use PNG, JPEG, WebP, GIF, MP4, WebM, audio, or a font file.');
  if (!bytes.length) throw new HttpError(400, 'The file is empty.');
  const id = randomUUID(),
    file = `${id}.${extension}`;
  const dir = join(videoDirectory(root, workspaceId), 'assets');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), bytes, { flag: 'wx' });
  try {
    const duration = /^(audio|video)\//.test(mime) ? await mediaDuration(join(dir, file)) : null;
    return {
      id,
      file,
      name: name.slice(0, 200),
      mime,
      size: bytes.length,
      ...(duration === null ? {} : { duration }),
    };
  } catch (error) {
    await rm(join(dir, file), { force: true });
    throw error;
  }
}
