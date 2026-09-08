import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, writeFile, access } from 'node:fs/promises';
import type { VideoDocument } from '@codex-ux/video-domain';
import { dependencyDirectory, linkDependencies, runtimeAliases } from './dependencies.ts';
const require = createRequire(import.meta.url);
const runtimeDirectory = dirname(require.resolve('@codex-ux/video-runtime'));
const assetLoaders = {
  '.png': 'file',
  '.jpg': 'file',
  '.jpeg': 'file',
  '.webp': 'file',
  '.gif': 'file',
  '.svg': 'file',
  '.mp4': 'file',
  '.webm': 'file',
  '.mp3': 'file',
  '.wav': 'file',
  '.woff': 'file',
  '.woff2': 'file',
  '.ttf': 'file',
} as const;

export async function buildRemotion(
  root: string,
  id: string,
  doc: VideoDocument,
  directory: string,
) {
  if (doc.source.kind !== 'remotion') throw new Error('Expected Remotion source.');
  const source = doc.source;
  const sourceDir = join(directory, 'source');
  await linkDependencies(sourceDir, await dependencyDirectory(root, id, doc));
  const generated = join(sourceDir, '.video-editor');
  await mkdir(generated, { recursive: true });
  const input = `import {${source.exportName} as Video} from ${JSON.stringify('../' + source.entry)};\n`;
  const preview = join(generated, 'preview.tsx');
  await writeFile(
    preview,
    input +
      `import {mountRemotion} from ${JSON.stringify(join(runtimeDirectory, 'remotion.tsx'))};\nmountRemotion(Video,${JSON.stringify(source)});`,
  );
  await build({
    entryPoints: [preview],
    outdir: join(directory, 'preview'),
    entryNames: 'player',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    alias: runtimeAliases,
    loader: assetLoaders,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
}

export async function buildRemotionExport(
  root: string,
  id: string,
  doc: VideoDocument,
  directory: string,
) {
  if (doc.source.kind !== 'remotion') throw new Error('Expected Remotion source.');
  if (
    await access(join(directory, 'render/.ready')).then(
      () => true,
      () => false,
    )
  )
    return;
  const { bundle } = await import('@remotion/bundler');
  const source = doc.source;
  const sourceDir = join(directory, 'source');
  await linkDependencies(sourceDir, await dependencyDirectory(root, id, doc));
  const generated = join(sourceDir, '.video-editor');
  await mkdir(generated, { recursive: true });
  const input = `import {${source.exportName} as Video} from ${JSON.stringify('../' + source.entry)};\n`;
  const renderEntry = join(generated, 'render.tsx');
  await writeFile(
    renderEntry,
    input +
      `import React from 'react';import {registerRoot,Composition} from 'remotion';registerRoot(()=> <Composition id="Video" component={Video} width={${source.width}} height={${source.height}} fps={${source.fps}} durationInFrames={${source.durationInFrames}} defaultProps={${JSON.stringify(source.inputProps)}}/>);`,
  );
  await bundle({
    entryPoint: renderEntry,
    rootDir: sourceDir,
    outDir: join(directory, 'render'),
    publicDir: join(sourceDir, 'public'),
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, alias: { ...config.resolve?.alias, ...runtimeAliases } },
    }),
  });
  await writeFile(join(directory, 'render/.ready'), 'ready');
}
