import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { installDependencies } from '../skills/codex-ux-workspace/scripts/install.ts';

void test('launcher runs npm shims in paths with spaces and propagates install failures', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ux install & cache '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'tool bin');
  const cwd = join(root, 'runtime stage');
  await mkdir(bin);
  await mkdir(cwd);
  const windows = process.platform === 'win32';
  const shim = join(bin, windows ? 'npx.cmd' : 'npx');
  await writeFile(
    shim,
    windows ? '@echo off\r\necho %*\r\nexit /b 0\r\n' : '#!/bin/sh\nprintf "%s\\n" "$*"\n',
    { mode: 0o755 },
  );
  const env = { ...process.env };
  // Windows environment names are case-insensitive; avoid two competing PATH entries.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = `${bin}${delimiter}${process.env.PATH ?? ''}`;
  const result = await installDependencies(cwd, env);
  assert.equal(
    result.stdout.trim(),
    '--yes --package pnpm@10.34.5 pnpm install --prod --frozen-lockfile --config.manage-package-manager-versions=false',
  );
  await writeFile(shim, windows ? '@echo off\r\nexit /b 23\r\n' : '#!/bin/sh\nexit 23\n');
  await assert.rejects(installDependencies(cwd, env), { code: 23 });
});

void test(
  'cancelling an install stops its process and preserves npm registry settings',
  { timeout: 15000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'ux cancel install '));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(
      join(root, 'fixture.cjs'),
      'console.log("started " + process.pid + " " + process.env.npm_config_registry + " " + (process.env.npm_config_package || "clear"));setInterval(()=>{},1000);',
    );
    await writeFile(
      join(root, process.platform === 'win32' ? 'npx.cmd' : 'npx'),
      process.platform === 'win32'
        ? '@echo off\r\nnode fixture.cjs\r\n'
        : '#!/bin/sh\nexec node fixture.cjs\n',
      { mode: 0o755 },
    );
    const env = {
      ...process.env,
      npm_config_package: 'node@24.20.0',
      npm_config_registry: 'https://registry.npmjs.org/',
    };
    for (const key of Object.keys(env))
      if (key.toLowerCase() === 'path') delete env[key as keyof typeof env];
    const environment: NodeJS.ProcessEnv = {
      ...env,
      PATH: `${root}${delimiter}${process.env.PATH ?? ''}`,
    };
    const controller = new AbortController();
    let output = '';
    const operation = installDependencies(root, environment, false, {
      signal: controller.signal,
      progress: (text) => {
        output += text;
        if (output.includes('started ')) controller.abort();
      },
    });
    await assert.rejects(operation, /cancelled/);
    assert.match(output, /https:\/\/registry.npmjs.org\/ clear/);
  },
);
