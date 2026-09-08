import { link, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const dead = (pid: number) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ESRCH';
  }
};

/** Publish complete ownership atomically. Reclaiming a dead owner is itself serialized. */
export async function acquireLock(
  path: string,
  signal?: AbortSignal,
  waiting?: () => void,
): Promise<() => Promise<void>> {
  const owner = `${process.pid} ${randomUUID()}`;
  const stage = `${path}.${owner.replace(' ', '-')}`;
  await writeFile(stage, owner, { flag: 'wx' });
  const deadline = Date.now() + 650_000;
  try {
    while (true) {
      signal?.throwIfAborted();
      try {
        await link(stage, path);
        return async () => {
          if ((await readFile(path, 'utf8').catch(() => '')) === owner)
            await rm(path, { force: true });
        };
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
      const previous = await readFile(path, 'utf8').catch(() => '');
      if (dead(Number(previous.split(' ')[0]))) {
        const release = await acquireLock(`${path}.reclaim`, signal);
        try {
          if ((await readFile(path, 'utf8').catch(() => '')) === previous)
            await rm(path, { force: true });
        } finally {
          await release();
        }
        continue;
      }
      if (Date.now() > deadline)
        throw new Error(`Preparation is locked at ${path}; inspect its owner before retrying.`);
      waiting?.();
      await delay(200, undefined, { signal });
    }
  } finally {
    await rm(stage, { force: true });
  }
}
