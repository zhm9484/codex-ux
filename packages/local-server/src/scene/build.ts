import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { z } from 'zod';
import type { SceneSnapshot } from '@codex-ux/scene-domain';
import { hash, materialize } from './files.ts';
import { HttpError } from '../errors.ts';

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
export const threeDirectory = dirname(dirname(require.resolve('three')));
const pending = new Map<string, Promise<void>>();

async function dependencies(snapshot: SceneSnapshot, directory: string, blobs: string) {
  const manifest = snapshot.files['package.json'];
  if (!manifest) return [];
  const text = await readFile(join(blobs, manifest.hash), 'utf8');
  const pkg = z
    .object({
      dependencies: z.record(z.string(), z.string()).optional(),
      devDependencies: z.record(z.string(), z.string()).optional(),
    })
    .passthrough()
    .parse(JSON.parse(text));
  const deps = { ...pkg.devDependencies, ...pkg.dependencies };
  if (deps.three && deps.three !== '0.185.1')
    throw new HttpError(
      400,
      'Scene uses Three.js 0.185.1. Keep that version when declaring three.',
    );
  if (!Object.keys(deps).some((name) => name !== 'three' && name !== '@types/three')) return [];
  const lock = snapshot.files['pnpm-lock.yaml'];
  if (!lock)
    throw new HttpError(400, 'Extra scene dependencies need package.json and pnpm-lock.yaml.');
  const lockText = await readFile(join(blobs, lock.hash), 'utf8');
  const cache = join(directory, 'dependencies', hash(text + lockText));
  if (
    !(await access(join(cache, '.ready')).then(
      () => true,
      () => false,
    ))
  ) {
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, 'package.json'), text);
    await writeFile(join(cache, 'pnpm-lock.yaml'), lockText);
    await writeFile(join(cache, 'pnpm-workspace.yaml'), 'packages: []\n');
    try {
      await execute(
        process.execPath,
        [
          join(dirname(require.resolve('pnpm/package.json')), 'bin/pnpm.cjs'),
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
          '--ignore-pnpmfile',
          '--config.manage-package-manager-versions=false',
        ],
        { cwd: cache, timeout: 180000, maxBuffer: 2 * 1024 ** 2 },
      );
      await writeFile(join(cache, '.ready'), 'ready');
    } catch (error) {
      throw new HttpError(
        422,
        `Scene dependencies could not be installed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
  return [join(cache, 'node_modules')];
}

export async function prepare(snapshot: SceneSnapshot, directory: string) {
  if (!snapshot.document.entry) return;
  const output = join(directory, 'bundles', snapshot.codeHash);
  if (
    await access(join(output, 'module.js')).then(
      () => true,
      () => false,
    )
  )
    return;
  const running = pending.get(output);
  if (running) return running;
  const task = (async () => {
    const blobs = join(directory, 'blobs');
    const source = join(output, 'source');
    await materialize(snapshot, blobs, source, true);
    const nodePaths = await dependencies(snapshot, directory, blobs);
    try {
      const result = await build({
        absWorkingDir: source,
        entryPoints: [snapshot.document.entry!],
        outfile: join(output, 'module.js'),
        write: false,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2023',
        external: ['three', 'three/*'],
        nodePaths,
        sourcemap: 'inline',
        logLevel: 'silent',
        plugins: [
          {
            name: 'scene-document-boundary',
            setup(builder) {
              builder.onResolve({ filter: /(?:^|\/)scene\.json$/ }, () => ({
                errors: [
                  {
                    text: 'scene.json holds editor state. Keep code parameters in another module or JSON file.',
                  },
                ],
              }));
            },
          },
        ],
      });
      await writeFile(join(output, 'module.js'), result.outputFiles[0]!.contents);
    } catch (error) {
      throw new HttpError(
        422,
        `Scene code could not build: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  })();
  pending.set(output, task);
  try {
    await task;
  } finally {
    pending.delete(output);
  }
}
