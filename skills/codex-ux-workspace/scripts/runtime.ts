import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { Environments } from './environments.ts';
import { acquireLock } from './lock.ts';

export function browserRuntime(runtime: string) {
  const require = createRequire(join(runtime, 'packages/local-server/package.json'));
  return {
    playwright: require('playwright-core') as { chromium: { executablePath(): string } },
    cli: join(dirname(require.resolve('playwright-core/package.json')), 'cli.js'),
  };
}

/** Source is immutable; production dependencies have separate capability/ABI cache identities. */
export async function prepareRuntime(
  runtime: string,
  bundle: { build: string; files: Record<string, string> },
  env: NodeJS.ProcessEnv,
) {
  await mkdir(dirname(runtime), { recursive: true });
  const release = await acquireLock(`${runtime}.lock`);
  try {
    const ready = join(runtime, '.ready');
    if ((await readFile(ready, 'utf8').catch(() => '')) !== bundle.build) {
      for (const [path, content] of Object.entries(bundle.files)) {
        if (isAbsolute(path) || path.split(/[\\/]/).some((part) => part === '..' || !part))
          throw new Error('Invalid runtime resource path.');
        await mkdir(dirname(join(runtime, path)), { recursive: true });
        await writeFile(join(runtime, path), content);
      }
      await mkdir(join(runtime, 'node_modules/@codex-ux'), { recursive: true });
      for (const path of Object.keys(bundle.files).filter((p) =>
        /^packages\/[^/]+\/package.json$/.test(p),
      )) {
        const pkg = JSON.parse(bundle.files[path]!) as { name: string };
        try {
          await symlink(
            join(runtime, 'node_modules'),
            join(runtime, dirname(path), 'node_modules'),
            'junction',
          );
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        }
        try {
          await symlink(
            join(runtime, dirname(path)),
            join(runtime, 'node_modules', pkg.name),
            'junction',
          );
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        }
      }
      await writeFile(ready, bundle.build);
    }
    const environments = new Environments(
      runtime,
      env.CODEX_UX_CACHE_DIR ?? dirname(dirname(runtime)),
    );
    const timer = setInterval(() => {
      console.error(environments.list().find((s) => s.id === 'core')?.stage);
    }, 1000);
    try {
      await environments.ensure('core');
    } finally {
      clearInterval(timer);
    }
  } finally {
    await release();
  }
}
