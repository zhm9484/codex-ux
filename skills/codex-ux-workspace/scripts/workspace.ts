import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { prepareApp } from './artifacts.ts';
import { DiscoveryError, locateService } from './discovery.ts';
import { prepareRuntime } from './runtime.ts';
import { acquireLock } from './lock.ts';
import { runtimeEnvironment } from './install.ts';

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
    capability: { type: 'string' },
    help: { type: 'boolean' },
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
  return (await locateService(root, bundle.build)).origin;
}
async function prepare() {
  const npmPrefix = join(cache, 'npm-prefix');
  await mkdir(join(npmPrefix, 'lib'), { recursive: true });
  await prepareRuntime(runtime, bundle, {
    ...runtimeEnvironment(),
    PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    CI: 'true',
    CODEX_UX_CACHE_DIR: cache,
    npm_config_prefix: npmPrefix,
  });
}
async function start() {
  const requestedPort = Number(values.port ?? process.env.CODEX_UX_PORT ?? 0);
  if (
    !Number.isInteger(requestedPort) ||
    (requestedPort !== 0 && (requestedPort < 1024 || requestedPort > 65535))
  )
    throw new Error('Port must be 0 (automatic) or between 1024 and 65535.');
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
        throw new DiscoveryError(
          'service_restart_required',
          `A live service (PID ${pid}) cannot be used by this launcher. Finish active work and stop that specific service normally before restarting.`,
          { cause: error, pid },
        );
      } catch (probe) {
        if (!(probe instanceof Error && 'code' in probe && probe.code === 'ESRCH')) throw probe;
      }
    }
    await prepare();
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
      windowsHide: true,
      stdio: ['ignore', log.fd, log.fd],
      env: {
        ...runtimeEnvironment(),
        CODEX_UX_DATA_DIR: root,
        CODEX_UX_PORT: String(selectedPort),
        CODEX_UX_APPS_FILE: registryPath,
        CODEX_UX_RUNTIME_BUILD: bundle.build,
        CODEX_UX_RUNTIME_DIR: runtime,
        CODEX_UX_CACHE_DIR: cache,
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
    state: 'ready',
    origin,
    apiBase: `${origin}/api`,
    dataRoot: root,
    url: app ? `${origin}/apps/${app.id}/` : origin,
    runtimeBuild: bundle.build,
  });
}

async function startExclusive(work = start) {
  await mkdir(root, { recursive: true });
  const release = await acquireLock(join(root, 'launcher.lock'));
  try {
    await work();
  } finally {
    await release();
  }
}

async function inspect() {
  const saved = JSON.parse(await readFile(join(root, 'runtime.json'), 'utf8')) as {
    origin: string;
    pid: number;
    control?: string;
  };
  const url = new URL(saved.origin);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.origin !== saved.origin ||
    !url.port
  )
    throw new Error('Invalid service address.');
  const health = await api(saved.origin, '/health');
  if (health.service !== 'codex-ux' || health.dataRoot !== root || health.pid !== saved.pid)
    throw new Error('Service ownership could not be verified.');
  return { saved, health };
}
async function stop() {
  let current: Awaited<ReturnType<typeof inspect>>;
  try {
    current = await inspect();
  } catch (error) {
    const pid = Number(await readFile(join(root, 'service.lock'), 'utf8').catch(() => ''));
    if (!pid) return;
    try {
      process.kill(pid, 0);
    } catch (probe) {
      if (probe instanceof Error && 'code' in probe && probe.code === 'ESRCH') return;
    }
    throw error;
  }
  if (!current.saved.control)
    throw new Error(
      'This older service has no verified stop endpoint. Stop it from its owning terminal once before updating.',
    );
  const response = await fetch(current.saved.origin + '/api/service/stop', {
    method: 'POST',
    headers: { 'x-codex-ux-control': current.saved.control },
    signal: AbortSignal.timeout(5000),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'The service could not stop.');
  for (let i = 0; i < 100; i++) {
    if (!(await exists(join(root, 'service.lock')))) return;
    await delay(100);
  }
  throw new Error('The service is still stopping. Inspect its status before retrying.');
}
try {
  switch (positionals[0]) {
    case 'inspect': {
      const current = await inspect();
      output({
        ...current.health,
        origin: current.saved.origin,
        expectedRuntimeBuild: bundle.build,
      });
      break;
    }
    case 'stop':
      await startExclusive(stop);
      output({ state: 'stopped', dataRoot: root });
      break;
    case 'restart':
      await startExclusive(async () => {
        if (values.app) {
          const path = resolve(values.app);
          const manifest = JSON.parse(await readFile(path, 'utf8')) as {
            runtimeBuild: string;
            apiVersion: number;
            dist: string;
            webBuild: string;
          };
          if (manifest.runtimeBuild !== bundle.build || manifest.apiVersion !== 3)
            throw new Error('Install matching Workspace and app skill versions together.');
          await prepareApp(resolve(dirname(path), manifest.dist), manifest.webBuild, cache);
        }
        if (
          values.port &&
          (!Number.isInteger(Number(values.port)) ||
            (Number(values.port) !== 0 &&
              (Number(values.port) < 1024 || Number(values.port) > 65535)))
        )
          throw new Error('Invalid port.');
        await prepare();
        await stop();
        await start();
      });
      break;
    case 'prepare': {
      const { capabilities } = await import('./environments.ts');
      if (!capabilities.includes(values.capability as (typeof capabilities)[number]))
        throw new Error('Provide a known --capability.');
      const origin = await service();
      await api(origin, `/environment/${values.capability}`, {});
      const deadline = Date.now() + 650_000;
      for (;;) {
        if (Date.now() > deadline)
          throw new Error('Preparation timed out. Inspect /api/environment before retrying.');
        const response = await fetch(origin + '/api/environment');
        const states = (await response.json()) as {
          id: string;
          state: string;
          stage: string;
          error?: string;
        }[];
        const state = states.find((item) => item.id === values.capability)!;
        if (state.state === 'ready') {
          output(state);
          break;
        }
        if (state.state === 'failed') throw new Error(state.error);
        console.error(state.stage);
        await delay(1000);
      }
      break;
    }
    case 'start':
      await startExclusive();
      break;
    case 'locate':
      output(await locateService(root, bundle.build));
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
        'Commands: start [--app app.json], locate, workspaces, create --name NAME, connect --workspace ID [--session ID] | --code CODE, status --code CODE, doctor.',
      );
  }
} catch (error) {
  if (error instanceof DiscoveryError) {
    const restart = error.code === 'runtime_mismatch' || error.code === 'service_restart_required';
    console.error(
      JSON.stringify(
        {
          state: 'unavailable',
          dataRoot: root,
          error: {
            code: error.code,
            message: error.message,
            ...(error.pid ? { pid: error.pid } : {}),
          },
          recovery: {
            action: restart ? 'review_running_service' : 'start',
            instructions: restart
              ? 'Check service.log and align installed skill versions. Finish active work before stopping the identified service, then run start again. Do not kill unrelated processes or delete Workspace data.'
              : 'Run start once for this same data directory; add --app with the intended app.json when registering an app. If the same failure persists, report it instead of guessing ports or changing data directories.',
            command: process.execPath,
            args: [join(skill, 'scripts/workspace.ts'), 'start', '--data-dir', root],
            logPath: join(root, 'service.log'),
          },
        },
        null,
        2,
      ),
    );
  } else
    console.error(
      JSON.stringify({
        state: 'unavailable',
        dataRoot: root,
        error: {
          code: 'launcher_failed',
          stage: positionals[0],
          message: error instanceof Error ? error.message : String(error),
        },
        logPath: join(root, 'service.log'),
      }),
    );
  process.exitCode = 1;
}
