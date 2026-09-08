import { spawn } from 'node:child_process';
import { dirname, delimiter } from 'node:path';

/** Prevent an outer npm exec's package selection from changing a nested invocation. */
export function runtimeEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const result = { ...env };
  for (const key of Object.keys(result)) {
    if (['path', 'npm_config_package', 'npm_config_call'].includes(key.toLowerCase()))
      delete result[key];
  }
  result.PATH = `${dirname(process.execPath)}${delimiter}${env.PATH ?? env.Path ?? ''}`;
  return result;
}

/** Fixed arguments only enter cmd.exe; paths are passed through process options. */
export async function installDependencies(
  cwd: string,
  env: NodeJS.ProcessEnv,
  repair = false,
  options: { signal?: AbortSignal; progress?: (text: string) => void } = {},
) {
  const installEnv = { ...env };
  for (const key of Object.keys(installEnv))
    if (['npm_config_package', 'npm_config_call'].includes(key.toLowerCase()))
      delete installEnv[key];
  const args = [
    '--yes',
    '--package',
    'pnpm@10.34.5',
    'pnpm',
    'install',
    '--prod',
    '--frozen-lockfile',
    '--config.manage-package-manager-versions=false',
  ];
  if (repair) args.push('--force');
  const windows = process.platform === 'win32';
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      windows ? (env.ComSpec ?? 'cmd.exe') : 'npx',
      windows ? ['/d', '/s', '/c', `npx.cmd ${args.join(' ')}`] : args,
      {
        cwd,
        env: installEnv,
        windowsHide: true,
        detached: !windows,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '',
      stderr = '';
    const stop = () => {
      if (!child.pid) return;
      if (windows)
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* Already stopped. */
        }
      }
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const timeout = setTimeout(stop, 600_000);
    options.signal?.addEventListener('abort', stop, { once: true });
    if (options.signal?.aborted) stop();
    child.stdout.on('data', (data: Buffer) => {
      stdout = (stdout + data.toString()).slice(-2_000_000);
      options.progress?.(data.toString());
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-2_000_000);
      options.progress?.(data.toString());
    });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timeout);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      options.signal?.removeEventListener('abort', stop);
      if (code === 0 && !options.signal?.aborted) resolve({ stdout, stderr });
      else
        reject(
          Object.assign(
            new Error(
              options.signal?.aborted
                ? 'Preparation cancelled.'
                : `Dependency installation failed (${code}). ${stderr || stdout}`,
            ),
            { code },
          ),
        );
    });
  });
}
