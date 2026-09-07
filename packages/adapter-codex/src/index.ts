import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export async function queueRequest(threadId: string, message: string) {
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(threadId)) throw new Error('Enter a valid Codex task ID.');
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
  const result = await exec(executable, ['queue', '--thread', threadId, '--message', message], {
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout.trim();
}
