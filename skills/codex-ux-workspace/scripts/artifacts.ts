import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Capture bytes once so skill replacement cannot change a running app's resources. */
export async function appSnapshot(directory: string) {
  const files = new Map<string, Buffer>();
  async function visit(relative: string) {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.set(path, await readFile(join(directory, path)));
      else throw new Error('App distribution must contain ordinary files, not symlinks.');
    }
  }
  await visit('');
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    const bytes = files.get(path)!;
    hash.update(path).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  return { hash: hash.digest('hex'), files };
}

export async function prepareApp(directory: string, expectedHash: string, cache: string) {
  const snapshot = await appSnapshot(directory);
  if (snapshot.hash !== expectedHash || !snapshot.files.has('index.html'))
    throw new Error('The app distribution is incomplete or changed. Reinstall matching skills.');
  const target = join(cache, 'apps', snapshot.hash);
  if ((await readFile(join(target, '.ready'), 'utf8').catch(() => '')) === snapshot.hash)
    return target;
  const stage = `${target}-${randomUUID()}`;
  try {
    for (const [path, bytes] of snapshot.files) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), bytes);
    }
    await writeFile(join(stage, '.ready'), snapshot.hash);
    try {
      await rename(stage, target);
    } catch (error) {
      if ((await readFile(join(target, '.ready'), 'utf8').catch(() => '')) !== snapshot.hash)
        throw error;
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return target;
}
