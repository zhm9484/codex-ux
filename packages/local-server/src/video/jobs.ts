import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ExportJob, Revision } from '@codex-ux/video-domain';
import { HttpError } from '../errors.ts';
import { prepareVideo, videoDirectory } from './files.ts';

import { mediaBinaries } from './probe.ts';
export function configureRenderer() {
  const binaries = mediaBinaries();
  process.env.HYPERFRAMES_FFMPEG_PATH ??= binaries.ffmpeg;
  process.env.HYPERFRAMES_FFPROBE_PATH ??= binaries.ffprobe;
  if (process.platform === 'darwin')
    process.env.PRODUCER_HEADLESS_SHELL_PATH ??=
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}
export class RenderJobs {
  readonly root: string;
  busy = false;
  private active = new Set<string>();
  constructor(root: string) {
    this.root = root;
  }
  async read(workspaceId: string, id: string): Promise<ExportJob> {
    try {
      const job = JSON.parse(
        await readFile(
          join(videoDirectory(this.root, workspaceId), 'exports', `${id}.json`),
          'utf8',
        ),
      ) as ExportJob;
      if (job.state === 'rendering' && !this.active.has(id)) {
        job.state = 'failed';
        job.error = 'The local service restarted during export. Export this version again.';
      }
      return job;
    } catch {
      throw new HttpError(404, 'Export not found.');
    }
  }
  async start(workspaceId: string, revision: Revision) {
    if (this.busy)
      throw new HttpError(409, 'An export is already running. Try again when it finishes.');
    this.busy = true;
    const id = randomUUID();
    const job: ExportJob = { id, revisionId: revision.id, state: 'rendering', progress: 0 };
    const dir = join(videoDirectory(this.root, workspaceId), 'exports');
    try {
      await mkdir(dir, { recursive: true });
      await this.writeJob(dir, job);
      this.active.add(id);
    } catch (error) {
      this.busy = false;
      throw error;
    }
    void this.run(workspaceId, revision, job)
      .catch((error: unknown) => console.error('Could not persist export result:', error))
      .finally(() => {
        this.active.delete(id);
        this.busy = false;
      });
    return job;
  }
  private async run(workspaceId: string, revision: Revision, job: ExportJob) {
    const dir = join(videoDirectory(this.root, workspaceId), 'exports');
    try {
      const prepared = await prepareVideo(this.root, workspaceId, revision.document);
      const source = revision.document.source;
      const extension = source.kind === 'media' ? extname(source.entry).toLowerCase() : '.mp4';
      const output = join(dir, `${job.id}${extension}`);
      if (source.kind === 'media') {
        await copyFile(join(prepared, 'source', source.entry), output);
      } else if (source.kind === 'remotion') {
        const { selectComposition, renderMedia } = await import('@remotion/renderer');
        const browserExecutable =
          process.env.CODEX_UX_CHROME ??
          (process.platform === 'darwin'
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : null);
        const serveUrl = join(prepared, 'render');
        const composition = await selectComposition({ serveUrl, id: 'Video', browserExecutable });
        await renderMedia({
          serveUrl,
          composition,
          codec: 'h264',
          outputLocation: output,
          browserExecutable,
          concurrency: 1,
        });
      } else {
        configureRenderer();
        await access(process.env.HYPERFRAMES_FFMPEG_PATH!);
        await access(process.env.HYPERFRAMES_FFPROBE_PATH!);
        const { createRenderJob, executeRenderJob } = await import('@hyperframes/producer');
        const render = createRenderJob({
          fps: source.fps,
          quality: 'standard',
          format: 'mp4',
          workers: 1,
          strictness: 'strict',
          entryFile: source.entry,
        });
        await executeRenderJob(render, join(prepared, 'source'), output);
      }
      job.state = 'complete';
      job.progress = 1;
      job.url = `/media/video-editor/exports/${workspaceId}/${job.id}${extension}`;
    } catch (e) {
      job.state = 'failed';
      job.error = e instanceof Error ? e.message : 'Export failed.';
    }
    await this.writeJob(dir, job);
  }
  private async writeJob(dir: string, job: ExportJob) {
    const file = join(dir, `${job.id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(job));
    await rename(`${file}.tmp`, file);
  }
}
