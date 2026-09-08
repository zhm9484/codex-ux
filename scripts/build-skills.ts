import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { appSnapshot } from '../skills/codex-ux-workspace/scripts/artifacts.ts';

const root = resolve(import.meta.dirname, '..');
const files: Record<string, string> = {};
async function collect(relative: string) {
  for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) files[path] = await readFile(join(root, path), 'utf8');
    else throw new Error(`Unexpected runtime symlink: ${path}`);
  }
}
for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'LICENSE'])
  files[file] = await readFile(join(root, file), 'utf8');
for (const name of [
  'protocol',
  'video-domain',
  'video-runtime',
  'scene-domain',
  'adapter-codex',
  'local-server',
]) {
  const path = `packages/${name}`;
  files[`${path}/package.json`] = await readFile(join(root, path, 'package.json'), 'utf8');
  await collect(`${path}/src`);
}
const content = JSON.stringify(files);
const build = createHash('sha256').update(content).digest('hex');
const workspace = join(root, 'skills/codex-ux-workspace');
await mkdir(join(workspace, 'assets'), { recursive: true });
await writeFile(join(workspace, 'assets/runtime.json'), JSON.stringify({ build, files }));
console.log(`Skills runtime ${build.slice(0, 12)}; app web files are in their skill dist/.`);
for (const [appId, appName] of [
  ['video-editor', 'Video Editor'],
  ['3d-space', '3D Space'],
] as const) {
  const video = join(root, `skills/codex-ux-${appId}`);
  const appRequire = createRequire(join(root, `apps/${appId}/package.json`));
  const domainRequire = createRequire(join(root, 'packages/video-domain/package.json'));
  const reactRequire = createRequire(appRequire.resolve('react-dom/package.json'));
  const parserRequire = createRequire(domainRequire.resolve('parse5'));
  let notices = 'Bundled web dependencies retain their upstream licenses.\n';
  for (const [name, require] of [
    ['react', appRequire],
    ['react-dom', appRequire],
    ['lucide-react', appRequire],
    ['scheduler', reactRequire],
    ['zod', domainRequire],
    ...(appId === 'video-editor'
      ? ([
          ['parse5', domainRequire],
          ['entities', parserRequire],
        ] as const)
      : ([['three', appRequire]] as const)),
  ] as const) {
    let directory = resolve(require.resolve(name), '..');
    while (true) {
      try {
        const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as {
          name: string;
        };
        if (pkg.name === name) break;
      } catch {
        /* Walk from the exported module to its package root. */
      }
      const parent = resolve(directory, '..');
      if (parent === directory) throw new Error(`Cannot locate license for ${name}`);
      directory = parent;
    }
    const license = (await readdir(directory)).find((file) =>
      /^licen[cs]e(?:\.(?:md|txt))?$/i.test(file),
    );
    if (!license) throw new Error(`Missing upstream license for ${name}`);
    notices += `\n--- ${name} ---\n\n${await readFile(join(directory, license), 'utf8')}\n`;
  }
  await writeFile(join(video, 'dist/THIRD-PARTY-NOTICES.txt'), notices);
  await writeFile(join(video, 'dist/LICENSE.txt'), files.LICENSE!);
  await writeFile(
    join(video, 'app.json'),
    JSON.stringify(
      {
        id: appId,
        name: appName,
        dist: 'dist',
        apiVersion: 3,
        runtimeBuild: build,
        webBuild: (await appSnapshot(join(video, 'dist'))).hash,
      },
      null,
      2,
    ) + '\n',
  );
}
