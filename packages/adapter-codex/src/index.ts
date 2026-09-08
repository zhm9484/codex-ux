import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { codexCandidates } from './discovery.ts';
const exec = promisify(execFile);

export class DeliveryUnavailableError extends Error {}

async function executablePath() {
  if (process.env.CODEX_UX_CODEX_BIN) return process.env.CODEX_UX_CODEX_BIN;
  const capability = await codexCapability();
  if (!capability.deliveryAvailable) throw new DeliveryUnavailableError(capability.detail);
  return capability.executable;
}

/** Inspect local CLI capability without sending a message or starting a task. */
export async function codexCapability() {
  const candidates = await codexCandidates();
  for (const executable of candidates) {
    try {
      const result = await exec(executable, ['queue', '--help'], {
        timeout: 5000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
      });
      const supported = /--thread\b/.test(result.stdout) && /--message\b/.test(result.stdout);
      if (supported)
        return {
          provider: 'codex',
          executable,
          deliveryAvailable: true,
          detail:
            'Queue command available. Session existence and delivery are checked only when submitting feedback.',
        };
    } catch {
      // Probe the next installed candidate; never retry an actual message this way.
    }
  }
  return {
    provider: 'codex',
    executable: candidates[0] ?? 'codex',
    deliveryAvailable: false,
    detail:
      'Message delivery is unavailable. The agent needs to repair the local Codex connection; your saved task is unchanged.',
  };
}

export async function queueRequest(threadId: string, message: string) {
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(threadId)) throw new Error('Enter a valid Codex task ID.');
  const executable = await executablePath();
  try {
    const result = await exec(executable, ['queue', '--thread', threadId, '--message', message], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['ENOENT', 'EACCES'].includes(String(error.code))
    )
      throw new DeliveryUnavailableError(
        'The local Codex program could not be started. No message was sent.',
        { cause: error },
      );
    throw error;
  }
}
