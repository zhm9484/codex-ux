import { homedir } from 'node:os';
import { resolve } from 'node:path';
export const repositoryRoot = resolve(import.meta.dirname, '../../..');
export const dataRoot = resolve(process.env.CODEX_UX_DATA_DIR ?? resolve(homedir(), '.codex-ux'));
export const port = Number(process.env.CODEX_UX_PORT ?? 0);
if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535)))
  throw new Error('CODEX_UX_PORT must be 0 (automatic) or between 1024 and 65535.');
