import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

async function executablePath() {
  let executable = process.env.CODEX_UX_CODEX_BIN;
  if (!executable) {
    const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex';
    try {
      await access(bundled);
      executable = bundled;
    } catch {
      executable = 'codex';
    }
  }
  return executable;
}

/** Inspect local CLI capability without sending a message or starting a task. */
export async function codexCapability() {
  const executable = await executablePath();
  try {
    const result = await exec(executable, ['queue', '--help'], {
      timeout: 5000,
      maxBuffer: 128 * 1024,
    });
    const supported = /--thread\b/.test(result.stdout) && /--message\b/.test(result.stdout);
    return {
      provider: 'codex',
      executable,
      deliveryAvailable: supported,
      detail: supported
        ? 'Queue command available. Session existence and delivery are checked only when submitting feedback.'
        : 'This Codex executable does not advertise queue --thread --message.',
    };
  } catch {
    return {
      provider: 'codex',
      executable,
      deliveryAvailable: false,
      detail:
        'Codex queue is unavailable. Set CODEX_UX_CODEX_BIN to an executable supporting queue --thread --message.',
    };
  }
}

export async function queueRequest(threadId: string, message: string) {
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(threadId)) throw new Error('Enter a valid Codex task ID.');
  const executable = await executablePath();
  const result = await exec(executable, ['queue', '--thread', threadId, '--message', message], {
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout.trim();
}
