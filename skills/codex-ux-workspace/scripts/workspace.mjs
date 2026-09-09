#!/usr/bin/env node
// This small bootstrap deliberately uses JavaScript so older Node versions can explain or repair startup.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
if (args.includes('--help') || args[0] === 'help' || !args.length) {
  console.log(
    'Codex UX Workspace\nCommands: start --app APP_JSON, locate, inspect, stop, restart --app APP_JSON, preflight, prepare --capability NAME, workspaces, create --name NAME, connect --workspace ID --app APP_ID, status --code CODE, doctor.\nOptions: --data-dir PATH, --port PORT, --session ID.\nApp opening does not require video export tools or a background browser.',
  );
  process.exit(0);
}
const cache = process.env.CODEX_UX_CACHE_DIR || join(homedir(), '.cache/codex-ux');
const saved = join(cache, 'node-executable');
let executable = process.execPath;
const supported = (path) =>
  path &&
  spawnSync(path, ['-p', 'process.versions.node.split(".")[0]'], {
    encoding: 'utf8',
    timeout: 5000,
  }).stdout?.trim() === '24';
if (!supported(executable)) {
  let cached;
  try {
    cached = readFileSync(saved, 'utf8').trim();
  } catch {
    /* First start. */
  }
  executable = [cached, '/opt/homebrew/opt/node@24/bin/node'].find(supported);
  if (!executable && args[0] !== 'preflight') {
    console.error('Preparing Node.js 24 for the local service…');
    const windows = process.platform === 'win32';
    const result = spawnSync(
      windows ? process.env.ComSpec || 'cmd.exe' : 'npx',
      windows
        ? ['/d', '/s', '/c', 'npx.cmd --yes --package node@24.20.0 node -p process.execPath']
        : ['--yes', '--package', 'node@24.20.0', 'node', '-p', 'process.execPath'],
      { encoding: 'utf8', timeout: 300000, windowsHide: true },
    );
    const candidate = result.stdout?.trim().split('\n').at(-1);
    if (supported(candidate)) {
      executable = candidate;
      mkdirSync(cache, { recursive: true });
      writeFileSync(saved, executable);
    } else {
      console.error(
        JSON.stringify({
          state: 'unavailable',
          error: {
            code: 'node_unavailable',
            stage: 'bootstrap',
            message:
              result.error?.message ||
              result.stderr ||
              'Install Node.js 24 and npm, then run this command again.',
          },
        }),
      );
      process.exit(1);
    }
  }
}
if (args[0] === 'preflight') {
  console.log(
    JSON.stringify(
      {
        state: executable ? 'ready' : 'unavailable',
        node: executable || null,
        currentNode: process.version,
        cache,
        requiredNode: '24',
        next: 'start --app APP_JSON',
      },
      null,
      2,
    ),
  );
  process.exit(executable ? 0 : 1);
}
const result = spawnSync(
  executable,
  [join(dirname(fileURLToPath(import.meta.url)), 'workspace.ts'), ...args],
  { stdio: 'inherit', env: process.env, windowsHide: true },
);
if (result.error)
  console.error(
    JSON.stringify({
      state: 'unavailable',
      error: { code: 'launcher_failed', message: result.error.message },
    }),
  );
process.exit(result.status ?? 1);
