import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { access, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { prepareApp } from './artifacts.ts';

const execute = promisify(execFile);
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    app: { type: 'string' },
    workspace: { type: 'string' },
    name: { type: 'string' },
    session: { type: 'string' },
    code: { type: 'string' },
    'replace-session': { type: 'string' },
    'data-dir': { type: 'string' },
    port: { type: 'string' },
  },
});
const root = resolve(
  values['data-dir'] ?? process.env.CODEX_UX_DATA_DIR ?? join(homedir(), '.codex-ux'),
);
const skill = resolve(import.meta.dirname, '..');
const bundle = JSON.parse(await readFile(join(skill, 'assets/runtime.json'), 'utf8')) as {
  build: string;
  files: Record<string, string>;
};
if (createHash('sha256').update(JSON.stringify(bundle.files)).digest('hex') !== bundle.build)
  throw new Error('The Workspace skill runtime is incomplete. Reinstall this skill.');
const cache = resolve(process.env.CODEX_UX_CACHE_DIR ?? join(homedir(), '.cache/codex-ux'));
const runtime = join(cache, 'runtimes', bundle.build);
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const session = (id: string) => {
  const sessionId = id.replace(/^codex:\/\/threads\//, '');
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(sessionId))
    throw new Error('Provide a valid Codex session ID or task link.');
  return { provider: 'codex', sessionId };
};
async function api(origin: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(origin + '/api' + path, {
    signal: AbortSignal.timeout(path === '/health' ? 1500 : 15_000),
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(typeof result.error === 'string' ? result.error : response.statusText);
  return result;
}
async function service() {
  const saved = JSON.parse(await readFile(join(root, 'runtime.json'), 'utf8')) as {
    origin: string;
  };
  const url = new URL(saved.origin);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:')
    throw new Error('Invalid local service origin.');
  const health = await api(saved.origin, '/health');
  if (
    health.service !== 'codex-ux' ||
    health.version !== 3 ||
    health.dataRoot !== root ||
    health.runtimeBuild !== bundle.build
  )
    throw new Error(
      'A different runtime is running. Finish active work and restart with this skill version. Workspace data is preserved.',
    );
  return saved.origin;
}
async function prepare() {
  if (await exists(join(runtime, '.ready'))) return;
  const stage = `${runtime}-${randomUUID()}`;
  await mkdir(stage, { recursive: true });
  try {
    for (const [path, content] of Object.entries(bundle.files)) {
      if (isAbsolute(path) || path.split(/[\\/]/).some((part) => part === '..' || !part))
        throw new Error('Invalid runtime resource path.');
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), content);
    }
    console.error('Preparing pinned runtime dependencies…');
    const npmPrefix = join(cache, 'npm-prefix');
    await mkdir(join(npmPrefix, 'lib'), { recursive: true });
    await execute(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        '--yes',
        'pnpm@10.34.5',
        'install',
        '--prod',
        '--frozen-lockfile',
        '--config.manage-package-manager-versions=false',
      ],
      {
        cwd: stage,
        timeout: 600_000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
          CI: 'true',
          npm_config_prefix: npmPrefix,
        },
      },
    );
    await writeFile(join(stage, '.ready'), bundle.build);
    try {
      await rename(stage, runtime);
    } catch (error) {
      if (!(await exists(join(runtime, '.ready')))) throw error;
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
async function browser() {
  const configured = process.env.CODEX_UX_CHROME;
  if (configured) {
    await access(configured);
    return configured;
  }
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'darwin' && (await exists(chrome))) return chrome;
  const require = createRequire(join(runtime, 'packages/local-server/package.json'));
  const playwright = (await import(require.resolve('playwright-core'))) as {
    chromium: { executablePath(): string };
  };
  const path = playwright.chromium.executablePath();
  if (!(await exists(path))) {
    console.error('Preparing Chromium for preview and rendering…');
    await execute(
      process.execPath,
      [require.resolve('playwright-core/cli'), 'install', 'chromium'],
      { timeout: 600_000, maxBuffer: 4 * 1024 * 1024 },
    );
  }
  return path;
}
async function start() {
  if (Number(process.versions.node.split('.')[0]) !== 24)
    throw new Error('Run this launcher with Node.js 24.');
  await mkdir(root, { recursive: true });
  let app: { id: string; name: string; distDirectory: string } | undefined;
  if (values.app) {
    const manifestPath = resolve(values.app);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      id: string;
      name: string;
      dist: string;
      apiVersion: number;
      runtimeBuild: string;
      webBuild: string;
    };
    if (manifest.apiVersion !== 3 || manifest.runtimeBuild !== bundle.build)
      throw new Error('Install matching Workspace and app skill versions together.');
    app = {
      id: manifest.id,
      name: manifest.name,
      distDirectory: await prepareApp(
        resolve(dirname(manifestPath), manifest.dist),
        manifest.webBuild,
        cache,
      ),
    };
    await access(join(app.distDirectory, 'index.html'));
  }
  const registryPath = join(root, 'installed-apps.json');
  const registry = (await exists(registryPath))
    ? (JSON.parse(await readFile(registryPath, 'utf8')) as {
        id: string;
        name: string;
        distDirectory: string;
      }[])
    : [];
  if (app) {
    const index = registry.findIndex((item) => item.id === app.id);
    if (index < 0) registry.push(app);
    else registry[index] = app;
  }
  const saveRegistry = async () => {
    const registryStage = `${registryPath}-${randomUUID()}`;
    await writeFile(registryStage, JSON.stringify(registry));
    await rename(registryStage, registryPath);
  };
  let origin: string;
  try {
    origin = await service();
  } catch (error) {
    // A live service must never be silently replaced or killed during a skill update.
    if (await exists(join(root, 'service.lock'))) {
      const pid = Number(await readFile(join(root, 'service.lock'), 'utf8'));
      try {
        process.kill(pid, 0);
        throw error;
      } catch (probe) {
        if (!(probe instanceof Error && 'code' in probe && probe.code === 'ESRCH')) throw probe;
      }
    }
    await prepare();
    const chrome = await browser();
    const selectedPort = Number(values.port ?? process.env.CODEX_UX_PORT ?? 0);
    if (
      !Number.isInteger(selectedPort) ||
      (selectedPort !== 0 && (selectedPort < 1024 || selectedPort > 65535))
    )
      throw new Error('Port must be 0 (automatic) or between 1024 and 65535.', { cause: error });
    const log = await open(join(root, 'service.log'), 'a');
    await saveRegistry();
    const child = spawn(process.execPath, [join(runtime, 'packages/local-server/src/main.ts')], {
      cwd: runtime,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      env: {
        ...process.env,
        CODEX_UX_DATA_DIR: root,
        CODEX_UX_PORT: String(selectedPort),
        CODEX_UX_APPS_FILE: registryPath,
        CODEX_UX_RUNTIME_BUILD: bundle.build,
        CODEX_UX_CHROME: chrome,
        PRODUCER_HEADLESS_SHELL_PATH: chrome,
      },
    });
    let startupError: Error | undefined;
    child.once('error', (error) => {
      startupError = error;
    });
    child.unref();
    await log.close();
    origin = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      await delay(300);
      if (startupError) throw startupError;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(
          `Service exited before becoming ready. Read ${join(root, 'service.log')}.`,
          { cause: error },
        );
      try {
        origin = await service();
        break;
      } catch {
        /* Wait for ready health. */
      }
    }
    if (!origin)
      throw new Error(`Service did not become ready. Read ${join(root, 'service.log')}.`, {
        cause: error,
      });
  }
  if (app) await api(origin, '/apps', app);
  await saveRegistry();
  output({
    origin,
    dataRoot: root,
    url: app ? `${origin}/apps/${app.id}/` : origin,
    runtimeBuild: bundle.build,
  });
}

async function startExclusive() {
  await mkdir(root, { recursive: true });
  const path = join(root, 'launcher.lock');
  for (let attempt = 0; attempt < 30; attempt++) {
    let lock;
    try {
      lock = await open(path, 'wx');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      const owner = Number(await readFile(path, 'utf8').catch(() => ''));
      if (Number.isInteger(owner) && owner > 0) {
        try {
          process.kill(owner, 0);
        } catch (probe) {
          if (probe instanceof Error && 'code' in probe && probe.code === 'ESRCH') {
            await rm(path, { force: true });
            continue;
          }
          throw probe;
        }
      }
      await delay(1000);
      continue;
    }
    try {
      await lock.writeFile(String(process.pid));
      await start();
      return;
    } finally {
      await lock.close();
      await rm(path, { force: true });
    }
  }
  throw new Error(
    'Another launcher is preparing this data directory. Wait for it to finish and retry.',
  );
}

try {
  switch (positionals[0]) {
    case 'start':
      await startExclusive();
      break;
    case 'workspaces':
      output(await api(await service(), '/workspaces'));
      break;
    case 'create':
      if (!values.name) throw new Error('Provide --name for the new workspace.');
      output(await api(await service(), '/workspaces', { name: values.name }));
      break;
    case 'connect': {
      if (values.code && !/^[\w-]{24}$/.test(values.code))
        throw new Error('Invalid connection code.');
      const id = values.session ?? process.env.CODEX_THREAD_ID;
      if (!id)
        throw new Error(
          'Current session is unavailable. Supply --session from the current task link; do not guess another task.',
        );
      const origin = await service();
      const connection = values.code
        ? await api(origin, `/connections/${values.code}/connect`, {
            session: session(id),
            replaceSession: values['replace-session'] ? session(values['replace-session']) : null,
          })
        : await api(origin, '/connections', {
            appId: values.app ?? 'video-editor',
            workspaceId: values.workspace,
            session: session(id),
          });
      output({
        ...connection,
        ...(connection.instanceId
          ? {}
          : {
              url: `${origin}/apps/${String(connection.appId)}/w/${String(connection.workspaceId)}#connect=${String(connection.code)}`,
            }),
      });
      break;
    }
    case 'status':
      if (!values.code || !/^[\w-]{24}$/.test(values.code))
        throw new Error('Provide --code from the connection receipt.');
      output(await api(await service(), `/connections/${values.code}`));
      break;
    case 'doctor':
      output(await api(await service(), '/agents/codex'));
      break;
    default:
      throw new Error(
        'Commands: start [--app app.json], workspaces, create --name NAME, connect --workspace ID [--session ID] | --code CODE, status --code CODE, doctor.',
      );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
