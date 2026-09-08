import type { chromium as Chromium } from 'playwright-core';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { environments } from './environment.ts';
import { HttpError } from './errors.ts';
import type { EnvironmentState } from '../../../skills/codex-ux-workspace/scripts/environments.ts';
const require = createRequire(import.meta.url);
let ready: { executablePath: string; version: string } | undefined;
let pending: Promise<NonNullable<typeof ready>> | undefined;
let controller: AbortController | undefined;
export const browserState: EnvironmentState = {
  id: 'browser',
  state: 'absent',
  stage: 'Background browser not prepared',
};
export const cancelBrowser = () => controller?.abort();

async function findBrowser(download: boolean, signal?: AbortSignal) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(
    process.env.CODEX_UX_CACHE_DIR ?? join(homedir(), '.cache/codex-ux'),
    'browsers',
  );
  if (download) {
    environments.start('browser');
    await environments.ensure('browser');
  }
  let chromium: typeof Chromium;
  try {
    chromium = (require('playwright-core') as { chromium: typeof Chromium }).chromium;
  } catch {
    throw new HttpError(
      503,
      'Prepare background previews to generate thumbnails.',
      'environment_required',
    );
  }
  const explicit = process.env.CODEX_UX_CHROME;
  const candidates = explicit
    ? [explicit]
    : [
        ready?.executablePath,
        chromium.executablePath(),
        ...(process.platform === 'darwin'
          ? [
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            ]
          : process.platform === 'win32'
            ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
                .filter((p): p is string => !!p)
                .flatMap((p) => [
                  join(p, 'Google/Chrome/Application/chrome.exe'),
                  join(p, 'Microsoft/Edge/Application/msedge.exe'),
                ])
            : [
                '/usr/bin/google-chrome',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/opt/google/chrome/chrome',
              ]),
      ].filter((p): p is string => !!p);
  let failure = '';
  async function validate(executablePath: string) {
    signal?.throwIfAborted();
    await access(executablePath);
    const browser = await chromium.launch({ executablePath, headless: true, timeout: 15000 });
    try {
      return { executablePath, version: browser.version() };
    } finally {
      await browser.close();
    }
  }
  for (const path of [...new Set(candidates)]) {
    try {
      return await validate(path);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }
  if (explicit)
    throw new Error(`Configured background browser is unavailable: ${explicit}. ${failure}`);
  if (!download)
    throw new HttpError(
      503,
      'Prepare background previews to generate thumbnails.',
      'environment_required',
    );
  browserState.stage = 'Downloading background browser';
  const cli = join(dirname(require.resolve('playwright-core/package.json')), 'cli.js');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      windowsHide: true,
      signal,
      timeout: 600_000,
    });
    let output = '';
    const progress = (data: Buffer) => {
      output = (output + data.toString()).slice(-8000);
      browserState.stage =
        data.toString().trim().split('\n').at(-1)?.slice(0, 200) || browserState.stage;
    };
    child.stdout.on('data', progress);
    child.stderr.on('data', progress);
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Browser preparation failed. ${output}`)),
    );
  });
  browserState.stage = 'Validating background browser';
  return validate(chromium.executablePath());
}

export function prepareBrowser() {
  if (pending) return pending;
  controller = new AbortController();
  Object.assign(browserState, {
    state: 'preparing',
    stage: 'Looking for an installed browser',
    startedAt: Date.now(),
    error: undefined,
  });
  pending = findBrowser(true, controller.signal)
    .then((result) => {
      ready = result;
      Object.assign(browserState, { state: 'ready', stage: `Ready (${result.version})` });
      return result;
    })
    .catch((error: unknown) => {
      Object.assign(browserState, {
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
        stage: 'Browser preparation failed',
      });
      throw error;
    })
    .finally(() => {
      pending = undefined;
      controller = undefined;
    });
  return pending;
}
export async function backgroundBrowser() {
  if (ready) return ready;
  // Passive thumbnail requests may reuse installed tools, but never install or download anything.
  ready = await findBrowser(false);
  Object.assign(browserState, { state: 'ready', stage: `Ready (${ready.version})` });
  return ready;
}
