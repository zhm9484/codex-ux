import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  appendFile,
  mkdir,
  readFile,
  writeFile,
  access,
  symlink,
  realpath,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { installDependencies, runtimeEnvironment } from './install.ts';
import { acquireLock } from './lock.ts';

export const capabilities = [
  'core',
  'scene',
  'video',
  'hyperframes',
  'remotion',
  'remotion-export',
  'hyperframes-export',
  'browser',
  'probe',
  'encoder',
] as const;
export type Capability = (typeof capabilities)[number];
export type EnvironmentState = {
  id: Capability;
  state: 'absent' | 'preparing' | 'ready' | 'failed';
  stage: string;
  startedAt?: number;
  error?: string;
  logPath?: string;
};
type Artifact = {
  build: string;
  manifest: string;
  lock: string;
  workspace: string;
  packages: string[];
};

export class Environments {
  private jobs = new Map<Capability, { controller: AbortController; promise: Promise<void> }>();
  private states = new Map<Capability, EnvironmentState>();
  readonly runtime: string | undefined;
  readonly cache: string;
  private install: typeof installDependencies;
  constructor(runtime: string | undefined, cache: string, install = installDependencies) {
    this.runtime = runtime;
    this.cache = cache;
    this.install = install;
  }
  list() {
    return capabilities.map(
      (id) =>
        this.states.get(id) ?? {
          id,
          state: this.runtime ? ('absent' as const) : ('ready' as const),
          stage: this.runtime ? 'Not prepared' : 'Repository dependencies',
        },
    );
  }
  get busy() {
    return this.jobs.size > 0;
  }
  cancel(id: Capability) {
    this.jobs.get(id)?.controller.abort();
  }
  async ensure(id: Capability) {
    if (!this.runtime || this.states.get(id)?.state === 'ready') return;
    if (this.states.get(id)?.state === 'failed') throw new Error(this.states.get(id)!.error);
    const running = this.jobs.get(id);
    if (running) return running.promise;
    const controller = new AbortController();
    const state: EnvironmentState = {
      id,
      state: 'preparing',
      stage: 'Checking local environment',
      startedAt: Date.now(),
    };
    this.states.set(id, state);
    const promise = this.prepare(id, state, controller.signal)
      .then(() => {
        state.state = 'ready';
        state.stage = 'Ready';
      })
      .catch((error: unknown) => {
        state.state = 'failed';
        state.error = error instanceof Error ? error.message : String(error);
        state.stage = controller.signal.aborted ? 'Cancelled' : 'Preparation failed';
        throw error;
      })
      .finally(() => {
        this.jobs.delete(id);
      });
    this.jobs.set(id, { controller, promise });
    return promise;
  }
  start(id: Capability) {
    if (this.states.get(id)?.state === 'failed') this.states.delete(id);
    void this.ensure(id).catch(() => {
      /* The status endpoint exposes the failure; retry is explicit. */
    });
  }
  private async prepare(id: Capability, state: EnvironmentState, signal: AbortSignal) {
    const runtime = this.runtime!;
    const artifacts = JSON.parse(
      await readFile(join(runtime, 'environments.json'), 'utf8'),
    ) as Record<Capability, Artifact>;
    const artifact = artifacts[id];
    if (
      !artifact ||
      createHash('sha256')
        .update(artifact.manifest + artifact.lock + artifact.workspace)
        .digest('hex') !== artifact.build
    )
      throw new Error(`Invalid ${id} environment artifact.`);
    const key = `${artifact.build}-${process.platform}-${process.arch}-node${process.versions.modules}`;
    const directory = join(this.cache, 'environments', key);
    await mkdir(directory, { recursive: true });
    state.logPath = join(directory, 'prepare.log');
    const release = await acquireLock(`${directory}.lock`, signal, () => {
      state.stage = 'Waiting for another preparation';
    });
    try {
      const require = createRequire(join(directory, 'package.json'));
      const validate = async () => {
        for (const name of artifact.packages) {
          let resolved: string;
          try {
            resolved = require.resolve(name);
          } catch {
            resolved = join(directory, 'node_modules', name, 'package.json');
          }
          await access(resolved);
        }
        if (artifact.packages.includes('esbuild'))
          (
            require('esbuild') as {
              transformSync(text: string, options: { loader: string }): unknown;
            }
          ).transformSync('const x: number = 1', { loader: 'ts' });
        for (const name of ['ffmpeg-static', 'ffprobe-static']) {
          if (!artifact.packages.includes(name)) continue;
          const binary =
            name === 'ffmpeg-static'
              ? (require(name) as string)
              : (require(name) as { path: string }).path;
          await promisify(execFile)(binary, ['-version'], { timeout: 10000, windowsHide: true });
        }
      };
      const marker = await readFile(join(directory, '.ready'), 'utf8').catch(() => '');
      const ready = marker === key;
      if (marker && !ready)
        throw new Error(
          `Invalid environment marker at ${directory}. Do not repair a cache while a service uses it.`,
        );
      if (ready) {
        try {
          await validate();
        } catch (error) {
          throw new Error(
            `Cached ${id} environment is damaged at ${directory}. Stop services using it before removing that cache and retrying. ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }
      if (!ready) {
        state.stage = 'Installing dependencies';
        await writeFile(join(directory, 'package.json'), artifact.manifest);
        await writeFile(join(directory, 'pnpm-lock.yaml'), artifact.lock);
        await writeFile(join(directory, 'pnpm-workspace.yaml'), artifact.workspace);
        const prefix = join(this.cache, 'npm-prefix');
        await mkdir(join(prefix, 'lib'), { recursive: true });
        let logs = Promise.resolve();
        await this.install(
          directory,
          { ...runtimeEnvironment(), CI: 'true', npm_config_prefix: prefix },
          false,
          {
            signal,
            progress: (text) => {
              const line = text.trim().split('\n').at(-1);
              if (line) state.stage = line.slice(0, 200);
              logs = logs.then(() => appendFile(state.logPath!, text));
            },
          },
        ).finally(() => logs);
        signal.throwIfAborted();
        await validate();
        await writeFile(join(directory, '.ready'), key);
      }
      // Source builds have separate node_modules directories. Never relocate the installed pnpm tree.
      for (const name of artifact.packages) {
        const target = join(runtime, 'node_modules', name);
        await mkdir(dirname(target), { recursive: true });
        try {
          await symlink(join(directory, 'node_modules', name), target, 'junction');
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
          await access(await realpath(target));
        }
      }
    } finally {
      await release();
    }
  }
}
