import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { environments } from '../environment.ts';
import { HttpError } from '../errors.ts';
const execute = promisify(execFile);
const require = createRequire(import.meta.url);
export function mediaBinaries() {
  return {
    ffmpeg: process.env.CODEX_UX_FFMPEG ?? (require('ffmpeg-static') as string),
    ffprobe:
      process.env.CODEX_UX_FFPROBE ??
      (require('@ffprobe-installer/ffprobe') as { path: string }).path,
  };
}
async function probeBinary() {
  if (process.env.CODEX_UX_FFPROBE) return process.env.CODEX_UX_FFPROBE;
  await environments.ensure('probe');
  return (require('@ffprobe-installer/ffprobe') as { path: string }).path;
}
async function probe(file: string) {
  let binary: string;
  try {
    binary = await probeBinary();
  } catch (error) {
    throw new HttpError(
      503,
      `Media information tool could not be prepared: ${error instanceof Error ? error.message : String(error)}`,
      'environment_failed',
    );
  }
  const { stdout } = await execute(
    binary,
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file],
    { timeout: 10000, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: {
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      tags?: { rotate?: string };
      side_data_list?: { rotation?: number }[];
    }[];
  };
}
function validDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0.1 || duration > 3600)
    throw new Error('Invalid duration.');
  return duration;
}
export async function mediaDuration(file: string) {
  try {
    return validDuration((await probe(file)).format?.duration);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'environment_failed') throw error;
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new HttpError(
        503,
        'FFprobe is unavailable. Check the configured media information tool.',
        'environment_failed',
      );
    throw new HttpError(
      422,
      'Could not read this media file. Use a playable file between 0.1 seconds and one hour.',
    );
  }
}
export async function probeVideo(file: string) {
  try {
    const metadata = await probe(file);
    const video = metadata.streams?.find((s) => s.codec_type === 'video');
    if (!video?.width || !video.height) throw new Error('Missing video stream.');
    if (!['h264', 'vp8', 'vp9', 'av1'].includes(video.codec_name))
      throw new Error('Unsupported browser codec.');
    const rotation =
      video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
      Number(video.tags?.rotate ?? 0);
    const swap = Math.abs(rotation) % 180 === 90;
    return {
      width: swap ? video.height : video.width,
      height: swap ? video.width : video.height,
      duration: validDuration(metadata.format?.duration),
    };
  } catch (error) {
    if (error instanceof HttpError && error.code === 'environment_failed') throw error;
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new HttpError(
        503,
        'FFprobe is unavailable. Check the configured media information tool.',
        'environment_failed',
      );
    throw new HttpError(
      422,
      'Use a playable H.264 MP4 or VP8/VP9/AV1 WebM video between 0.1 seconds and one hour.',
    );
  }
}
