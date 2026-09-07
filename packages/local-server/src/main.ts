import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataRoot, port, origin } from './config.ts';
import { startServer } from './server.ts';

await mkdir(dataRoot, { recursive: true });
const lock = join(dataRoot, 'service.lock');
try {
  const info = (await fetch(`${origin}/api/health`).then((r) => r.json())) as {
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
    console.log(`Codex UX is already running at ${origin}`);
    process.exit(0);
  }
} catch {
  /* First launch. */
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
  const app = await startServer(dataRoot, port, process.argv.includes('--dev'));
  await writeFile(
    join(dataRoot, 'runtime.json'),
    JSON.stringify({ origin, pid: process.pid, dataRoot }, null, 2),
  );
  console.log(`Codex UX · ${origin}\nLocal data · ${dataRoot}`);
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
