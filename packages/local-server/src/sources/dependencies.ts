import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, access, symlink, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { VideoDocument } from '@codex-ux/video-domain';
import { digest } from './files.ts';
import { videoDirectory } from '../video/paths.ts';
import { HttpError } from '../errors.ts';

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
export const runtimeVersions = {
  react: '19.2.8',
  'react-dom': '19.2.8',
  remotion: '4.0.522',
  '@remotion/player': '4.0.522',
};
export const runtimeAliases = Object.fromEntries(
  Object.keys(runtimeVersions).map((name) => [
    name,
    dirname(require.resolve(`${name}/package.json`)),
  ]),
);
const pending = new Map<string, Promise<string>>();
/** Project dependencies are disposable build inputs; never restore node_modules from history. */
export async function dependencyDirectory(root: string, id: string, doc: VideoDocument) {
  const packageText = doc.files['package.json']?.text;
  if (!packageText) return join(dirname(require.resolve('../../package.json')), 'node_modules');
  const pkg = z
    .object({
      dependencies: z.record(z.string(), z.string()).optional(),
      devDependencies: z.record(z.string(), z.string()).optional(),
    })
    .passthrough()
    .parse(JSON.parse(packageText));
  const dependencies = { ...pkg.devDependencies, ...pkg.dependencies };
  for (const [name, version] of Object.entries(runtimeVersions)) {
    if (dependencies[name] && dependencies[name] !== version)
      throw new HttpError(
        400,
        `This Remotion adapter requires ${name} ${version}; found ${dependencies[name]}.`,
      );
  }
  const extra = Object.keys(dependencies).filter((name) => !(name in runtimeVersions));
  if (!extra.length) return join(dirname(require.resolve('../../package.json')), 'node_modules');
  const lock = doc.files['pnpm-lock.yaml'];
  if (!lock)
    throw new HttpError(
      400,
      'Remotion projects with extra dependencies need package.json and pnpm-lock.yaml.',
    );
  const { blobsDirectory } = await import('../video/paths.ts');
  const lockText = await readFile(join(blobsDirectory(root, id), lock.hash), 'utf8');
  const key = digest(packageText + '\n' + lockText);
  const dir = join(videoDirectory(root, id), 'dependencies', key);
  const existing = pending.get(dir);
  if (existing) return existing;
  const task = (async () => {
    try {
      await access(join(dir, '.ready'));
      return join(dir, 'node_modules');
    } catch {
      /* Fresh dependency environment. */
    }
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), packageText);
    await writeFile(join(dir, 'pnpm-lock.yaml'), lockText);
    // Disable scripts and repository/global pnpm hooks. The app never runs a project's install script.
    await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages: []\n');
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
        { cwd: dir, timeout: 180000, maxBuffer: 2 * 1024 * 1024 },
      );
      await writeFile(join(dir, '.ready'), 'ready');
      return join(dir, 'node_modules');
    } catch (error) {
      throw new HttpError(
        422,
        `Could not prepare Remotion dependencies: ${error instanceof Error ? error.message : 'installation failed'}`,
      );
    }
  })();
  pending.set(dir, task);
  try {
    return await task;
  } finally {
    pending.delete(dir);
  }
}
export async function linkDependencies(directory: string, target: string) {
  await rm(join(directory, 'node_modules'), { recursive: true, force: true });
  await symlink(target, join(directory, 'node_modules'), 'junction');
}
