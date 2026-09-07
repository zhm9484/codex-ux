import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportJob, Revision } from '@codex-ux/video-domain';
import { HttpError } from '../errors.ts';
import { materialize, videoDirectory } from './files.ts';

const require = createRequire(import.meta.url);
export function configureRenderer() {
  process.env.HYPERFRAMES_FFMPEG_PATH ??= require('ffmpeg-static') as string;
  process.env.HYPERFRAMES_FFPROBE_PATH ??= (require('ffprobe-static') as { path: string }).path;
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
      configureRenderer();
      await access(process.env.HYPERFRAMES_FFMPEG_PATH!);
      await access(process.env.HYPERFRAMES_FFPROBE_PATH!);
      const { createRenderJob, executeRenderJob } = await import('@hyperframes/producer');
      const source = await materialize(this.root, workspaceId, revision);
      const render = createRenderJob({
        fps: revision.document.fps,
        quality: 'standard',
        format: 'mp4',
        workers: 1,
        strictness: 'strict',
      });
      await executeRenderJob(render, source, join(dir, `${job.id}.mp4`));
      job.state = 'complete';
      job.progress = 1;
      job.url = `/media/video-editor/exports/${workspaceId}/${job.id}.mp4`;
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
