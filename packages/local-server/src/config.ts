import { homedir } from 'node:os';
import { resolve } from 'node:path';
export const repositoryRoot = resolve(import.meta.dirname, '../../..');
export const dataRoot = resolve(process.env.CODEX_UX_DATA_DIR ?? resolve(homedir(), '.codex-ux'));
export const port = Number(process.env.CODEX_UX_PORT ?? 5173);
export const origin = `http://127.0.0.1:${port}`;
