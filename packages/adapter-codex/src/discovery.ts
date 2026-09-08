import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Search only the desktop app's known installation directory, never user projects. */
export async function codexCandidates(
  platform = process.platform,
  env = process.env,
  home = homedir(),
): Promise<string[]> {
  if (env.CODEX_UX_CODEX_BIN) return [env.CODEX_UX_CODEX_BIN];
  if (platform === 'darwin') return ['/Applications/ChatGPT.app/Contents/Resources/codex', 'codex'];
  if (platform !== 'win32') return ['codex'];
  const bin = join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
  const entries = await readdir(bin, { withFileTypes: true }).catch(() => []);
  const versions = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(bin, entry.name, 'codex.exe');
        const info = await stat(path).catch(() => null);
        return info?.isFile() ? { path, modified: info.mtimeMs } : null;
      }),
  );
  return [
    'codex.exe',
    join(bin, 'codex.exe'),
    ...versions
      .filter((entry) => entry !== null)
      .sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path))
      .map((entry) => entry.path),
  ];
}
