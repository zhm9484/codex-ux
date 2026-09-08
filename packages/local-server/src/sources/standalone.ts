import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { environments } from '../environment.ts';
const require = createRequire(import.meta.url);
const pending = new Map<string, Promise<string>>();
export function standaloneRuntime(kind: 'media' | 'hyperframes') {
  const previous = pending.get(kind);
  if (previous) return previous;
  const task = (async () => {
    if (kind === 'hyperframes') await environments.ensure('hyperframes');
    const runtime = dirname(require.resolve('@codex-ux/video-runtime'));
    const result = await build({
      stdin: {
        contents: `import {${kind === 'media' ? 'mountMedia' : 'mountHyperframes'} as mount} from './${kind}.ts';const data=JSON.parse(document.getElementById('video-config').textContent);const controller=${kind === 'media' ? 'mount(data.src,data.duration)' : 'mount(data.src,data.width,data.height)'};const time=Number(new URLSearchParams(location.search).get('time'))||0;controller.ready.then(()=>controller.seek(time)).then(()=>document.documentElement.dataset.ready='true').catch(error=>window.__videoError=String(error));`,
        resolveDir: runtime,
        sourcefile: 'standalone.ts',
      },
      absWorkingDir: join(runtime, '..'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    });
    return result.outputFiles[0]!.text;
  })().catch((error: unknown) => {
    pending.delete(kind);
    throw error;
  });
  pending.set(kind, task);
  return task;
}
