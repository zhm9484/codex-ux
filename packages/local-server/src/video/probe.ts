import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { HttpError } from '../errors.ts';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

export async function mediaDuration(file: string) {
  const binary =
    process.env.HYPERFRAMES_FFPROBE_PATH ?? (require('ffprobe-static') as { path: string }).path;
  try {
    const { stdout } = await execute(
      binary,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        file,
      ],
      { timeout: 10000, maxBuffer: 1024 * 1024 },
    );
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration < 0.1 || duration > 3600)
      throw new Error('Invalid duration.');
    return duration;
  } catch {
    throw new HttpError(
      422,
      'Could not read this media file. Use a playable file between 0.1 seconds and one hour.',
    );
  }
}
