import { parse, stringify } from 'yaml';
import { createHash } from 'node:crypto';

/** Each installed environment has its own frozen transitive graph; unrelated updates cannot invalidate it. */
export function buildEnvironments(lockText: string) {
  type Entry = { specifier: string; version: string };
  type Snapshot = {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const lock = parse(lockText) as {
    lockfileVersion: string;
    settings: unknown;
    importers: Record<string, { dependencies?: Record<string, Entry> }>;
    snapshots: Record<string, Snapshot>;
    packages: Record<string, unknown>;
  };
  const available = Object.assign(
    {},
    ...Object.values(lock.importers).map((i) => i.dependencies ?? {}),
  ) as Record<string, Entry>;
  const groups = {
    core: ['zod'],
    scene: ['three', 'esbuild', 'pnpm'],
    video: ['parse5', 'gsap', 'esbuild', 'pnpm'],
    hyperframes: ['@hyperframes/core', '@hyperframes/player'],
    remotion: ['react', 'react-dom', 'remotion', '@remotion/player'],
    'remotion-export': ['@remotion/bundler', '@remotion/renderer'],
    'hyperframes-export': ['@hyperframes/producer'],
    browser: ['playwright-core'],
    probe: ['@ffprobe-installer/ffprobe'],
    encoder: ['ffmpeg-static'],
  };
  return Object.fromEntries(
    Object.entries(groups).map(([id, names]) => {
      const dependencies: Record<string, Entry> = {};
      const snapshots: Record<string, Snapshot> = {};
      const packages: Record<string, unknown> = {};
      function visit(name: string, version: string) {
        const key = `${name}@${version}`;
        if (snapshots[key]) return;
        const snapshot = lock.snapshots[key];
        if (!snapshot) throw new Error(`Missing frozen dependency ${key}`);
        snapshots[key] = snapshot;
        const packageKey = key.split('(')[0]!;
        packages[packageKey] = lock.packages[packageKey];
        for (const [child, ref] of Object.entries({
          ...snapshot.dependencies,
          ...snapshot.optionalDependencies,
        }))
          visit(child, ref);
      }
      for (const name of names) {
        const entry = available[name];
        if (!entry) throw new Error(`Missing environment dependency ${name}`);
        dependencies[name] = { specifier: entry.version.split('(')[0]!, version: entry.version };
        visit(name, entry.version);
      }
      const ordered = (value: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
      const manifest = JSON.stringify({
        private: true,
        dependencies: Object.fromEntries(
          Object.entries(dependencies).map(([name, entry]) => [name, entry.specifier]),
        ),
      });
      const frozen = stringify({
        lockfileVersion: lock.lockfileVersion,
        settings: lock.settings,
        importers: { '.': { dependencies } },
        packages: ordered(packages),
        snapshots: ordered(snapshots),
      });
      const workspace = stringify({
        packages: [],
        onlyBuiltDependencies: [
          'esbuild',
          'ffmpeg-static',
          ...Object.keys(packages)
            .filter((name) => name.startsWith('@ffprobe-installer/'))
            .map((name) => name.slice(0, name.lastIndexOf('@'))),
        ],
      });
      const build = createHash('sha256')
        .update(manifest + frozen + workspace)
        .digest('hex');
      return [id, { build, manifest, lock: frozen, workspace, packages: names }];
    }),
  );
}
