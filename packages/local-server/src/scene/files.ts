import { createHash } from 'node:crypto';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import {
  sceneSchema,
  sourcePath,
  type SceneSnapshot,
  type SourceFile,
} from '@codex-ux/scene-domain';
import { contained } from '../storage/paths.ts';
import { HttpError } from '../errors.ts';

export const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const excluded = new Set(['node_modules', 'dist', 'build', 'coverage']);
export async function scan(directory: string) {
  const root = await realpath(directory);
  const files: { path: string; size: number; mtime: number; ctime: number }[] = [];
  let bytes = 0;
  async function walk(dir: string, depth: number) {
    if (depth > 30) throw new HttpError(400, 'Scene source exceeds 30 directory levels.');
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new HttpError(400, 'Scene source cannot contain symbolic links.');
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile()) {
        const info = await lstat(file);
        if (!info.isFile()) throw new HttpError(409, 'Source changed while reading.');
        bytes += info.size;
        files.push({
          path: sourcePath.parse(relative(root, file).split(sep).join('/')),
          size: info.size,
          mtime: info.mtimeMs,
          ctime: info.ctimeMs,
        });
        if (files.length > 10000 || bytes > 1024 ** 3)
          throw new HttpError(413, 'Scene source exceeds 10,000 files or 1 GB.');
      }
    }
  }
  await walk(root, 0);
  return { files, signature: hash(JSON.stringify(files)) };
}

export async function safeFile(directory: string, path: string) {
  sourcePath.parse(path);
  const root = await realpath(directory);
  const file = await realpath(contained(root, path));
  if (!file.startsWith(root + sep)) throw new HttpError(403, 'Source path escapes its directory.');
  return file;
}

export async function capture(directory: string, blobs: string): Promise<SceneSnapshot> {
  const before = await scan(directory);
  await mkdir(blobs, { recursive: true });
  const files: Record<string, SourceFile> = {};
  let sourceBytes = 0;
  for (const file of before.files) {
    const bytes = await readFile(await safeFile(directory, file.path));
    if (/\.(?:[cm]?[jt]sx?|json|css)$/i.test(file.path)) sourceBytes += bytes.length;
    if (sourceBytes > 8 * 1024 ** 2) throw new HttpError(413, 'Scene code and JSON exceed 8 MB.');
    const digest = hash(bytes);
    await writeFile(join(blobs, digest), bytes, { flag: 'wx' }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      },
    );
    files[file.path] = { hash: digest, size: bytes.length };
  }
  if (before.signature !== (await scan(directory)).signature)
    throw new HttpError(409, 'Source changed while reading.');
  const manifest = files['scene.json'];
  if (!manifest) throw new HttpError(400, 'Add scene.json to describe this scene.');
  const document = sceneSchema.parse(
    JSON.parse(await readFile(join(blobs, manifest.hash), 'utf8')),
  );
  if (document.entry && !files[document.entry])
    throw new HttpError(400, `Missing scene entry: ${document.entry}`);
  for (const object of document.objects) {
    if (object.kind === 'model' && !files[object.path])
      throw new HttpError(400, `Missing model: ${object.path}`);
  }
  const codeHash = hash(
    JSON.stringify(
      Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'scene.json')),
    ) +
      '\n' +
      document.entry,
  );
  return { document, files, codeHash };
}

export async function materialize(
  snapshot: SceneSnapshot,
  blobs: string,
  directory: string,
  immutable = false,
) {
  await mkdir(directory, { recursive: true });
  for (const [path, file] of Object.entries(snapshot.files)) {
    const target = contained(directory, sourcePath.parse(path));
    await mkdir(dirname(target), { recursive: true });
    if (immutable) {
      await link(join(blobs, file.hash), target).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code === 'EEXIST') return;
        if (error.code !== 'EXDEV') throw error;
        await copyFile(join(blobs, file.hash), target);
      });
    } else await copyFile(join(blobs, file.hash), target);
  }
}

/** Only the scene-owned source subtree is checked out. Ignored tooling directories survive. */
export async function checkout(
  snapshot: SceneSnapshot,
  blobs: string,
  directory: string,
  previous?: SceneSnapshot,
) {
  const current = await scan(directory);
  for (const file of current.files) {
    if (!snapshot.files[file.path]) await rm(await safeFile(directory, file.path));
  }
  for (const path of Object.keys(snapshot.files)) {
    // Check every existing ancestor before creating or overwriting working content.
    let parent = directory;
    for (const segment of path.split('/')) {
      parent = join(parent, segment);
      const info = await lstat(parent).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (info?.isSymbolicLink())
        throw new HttpError(403, 'Cannot check out through a symbolic link.');
    }
  }
  const changed = Object.fromEntries(
    Object.entries(snapshot.files).filter(
      ([path, file]) => previous?.files[path]?.hash !== file.hash,
    ),
  );
  await materialize({ ...snapshot, files: changed }, blobs, directory);
}

export const starterScene = {
  version: 1,
  entry: 'scene.ts',
  environment: { background: '#eeede9', ground: true, grid: false },
  objects: [
    { id: 'sphere', label: 'Sphere', kind: 'primitive', shape: 'sphere', color: '#bcc7b8' },
    { id: 'block', label: 'Block', kind: 'primitive', shape: 'box', color: '#d5c9b9' },
  ],
  placements: {
    sphere: { position: [-2.3, 0, 0.8], rotation: [0, 0, 0], scale: [1.25, 1.25, 1.25] },
    block: { position: [2.2, 0, -0.3], rotation: [0, -0.25, 0], scale: [1.1, 1.7, 1.1] },
  },
  hidden: [],
  annotations: [],
};
export const starterCode = `import * as THREE from 'three';

// Keep registered IDs stable: placement edits and annotations attach to them.
// Use ordinary Three.js here. Add modules and assets alongside this file.
export default function createScene(ctx) {
  const sculpture = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#b97451', roughness: 0.36 });
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.32, 24, 80), material);
  ribbon.position.y = 1.4;
  ribbon.rotation.y = -0.25;
  ribbon.castShadow = true;
  sculpture.add(ribbon);
  ctx.register('ribbon', sculpture, 'Ribbon');
}
`;
