import { createRequire } from 'node:module';
import { access, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { installDependencies } from './install.ts';

export function browserRuntime(runtime: string) {
  const require = createRequire(join(runtime, 'packages/local-server/package.json'));
  return {
    playwright: require('playwright-core') as { chromium: { executablePath(): string } },
    cli: join(dirname(require.resolve('playwright-core/package.json')), 'cli.js'),
  };
}

/** Install at the final path: Windows pnpm junctions cannot survive a directory rename. */
export async function prepareRuntime(
  runtime: string,
  bundle: { build: string; files: Record<string, string> },
  env: NodeJS.ProcessEnv,
  install = installDependencies,
) {
  await mkdir(dirname(runtime), { recursive: true });
  // Different data roots can share this cache, so the data-root launcher lock is insufficient.
  const lockPath = `${runtime}.lock`;
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    throw new Error(
      `Runtime preparation is already locked at ${lockPath}. Wait for its owner or inspect a stale lock before retrying.`,
      { cause: error },
    );
  }
  const ready = join(runtime, '.ready');
  try {
    await lock.writeFile(String(process.pid));
    const marked = (await readFile(ready, 'utf8').catch(() => '')) === bundle.build;
    if (marked) {
      try {
        browserRuntime(runtime);
        return;
      } catch {
        // Older launchers marked caches ready before renaming and breaking their junctions.
      }
    }
    await rm(ready, { force: true });
    for (const [path, content] of Object.entries(bundle.files)) {
      if (isAbsolute(path) || path.split(/[\\/]/).some((part) => part === '..' || !part))
        throw new Error('Invalid runtime resource path.');
      await mkdir(dirname(join(runtime, path)), { recursive: true });
      await writeFile(join(runtime, path), content);
    }
    console.error('Preparing pinned runtime dependencies…');
    const repair = await access(join(runtime, 'node_modules')).then(
      () => true,
      () => false,
    );
    await install(runtime, env, repair);
    browserRuntime(runtime);
    await writeFile(ready, bundle.build);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
