import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Windows command shims require cmd.exe; only fixed arguments enter its command string. */
export async function installDependencies(cwd: string, env: NodeJS.ProcessEnv, repair = false) {
  const args = [
    '--yes',
    'pnpm@10.34.5',
    'install',
    '--prod',
    '--frozen-lockfile',
    '--config.manage-package-manager-versions=false',
  ];
  if (repair) args.push('--force');
  const windows = process.platform === 'win32';
  return execute(
    windows ? (process.env.ComSpec ?? 'cmd.exe') : 'npx',
    windows ? ['/d', '/s', '/c', `npx.cmd ${args.join(' ')}`] : args,
    { cwd, env, windowsHide: true, timeout: 600_000, maxBuffer: 8 * 1024 * 1024 },
  );
}
