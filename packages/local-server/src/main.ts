import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataRoot, port } from './config.ts';
import { startServer } from './server.ts';

await mkdir(dataRoot, { recursive: true });
const lock = join(dataRoot, 'service.lock');
let savedPort = 0;
try {
  const saved = JSON.parse(await readFile(join(dataRoot, 'runtime.json'), 'utf8')) as {
    origin: string;
  };
  const url = new URL(saved.origin);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.origin !== saved.origin ||
    !url.port
  )
    throw new Error('Invalid saved service origin.');
  savedPort = Number(url.port);
  const info = (await fetch(`${saved.origin}/api/health`, {
    signal: AbortSignal.timeout(1500),
  }).then((r) => r.json())) as {
    service?: string;
    version?: number;
    dataRoot?: string;
    runtimeBuild?: string;
  };
  if (
    info.service === 'codex-ux' &&
    info.version === 3 &&
    info.dataRoot === dataRoot &&
    info.runtimeBuild === (process.env.CODEX_UX_RUNTIME_BUILD ?? 'development')
  ) {
    console.log(`Codex UX is already running at ${saved.origin}`);
    process.exit(0);
  }
} catch {
  /* Missing, stale or unavailable runtime; the PID lock still protects a live service. */
}
try {
  const old = Number(await readFile(lock, 'utf8'));
  try {
    process.kill(old, 0);
    throw new Error(
      `Codex UX is already running (PID ${old}). See ${join(dataRoot, 'runtime.json')}.`,
    );
  } catch (e) {
    if (!(e instanceof Error) || !('code' in e) || e.code !== 'ESRCH') throw e;
  }
  await rm(lock);
} catch (e) {
  if (!(e instanceof Error) || !('code' in e) || e.code !== 'ENOENT') throw e;
}
const handle = await open(lock, 'wx');
await handle.writeFile(String(process.pid));
await handle.close();
try {
  const dev = process.argv.includes('--dev');
  const app = await startServer(dataRoot, port || savedPort, dev).catch((error: unknown) => {
    if (
      port === 0 &&
      savedPort &&
      error instanceof Error &&
      'code' in error &&
      error.code === 'EADDRINUSE'
    )
      return startServer(dataRoot, 0, dev);
    throw error;
  });
  const { origin } = app;
  const stagedRuntime = join(dataRoot, `.runtime-${process.pid}.json`);
  await writeFile(stagedRuntime, JSON.stringify({ origin, pid: process.pid, dataRoot }, null, 2));
  await rename(stagedRuntime, join(dataRoot, 'runtime.json'));
  console.log(
    `Codex UX · ${origin}\n${app.apps.map((hosted) => `${hosted.name} · ${origin}/apps/${hosted.id}/`).join('\n')}\nLocal data · ${dataRoot}`,
  );
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void app.close().finally(async () => {
      await rm(lock, { force: true });
      process.exit(0);
    });
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
} catch (e) {
  await rm(lock, { force: true });
  throw e;
}
