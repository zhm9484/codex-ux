import { chromium, type Browser } from 'playwright-core';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Revision } from '@codex-ux/video-domain';
import { workspaceDirectory } from './files.ts';

export class Thumbnails {
  readonly root: string;
  readonly origin: string;
  private browser: Browser | null = null;
  private pending = new Map<string, Promise<string>>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(root: string, origin: string) {
    this.root = root;
    this.origin = origin;
  }
  async get(workspaceId: string, revision: Revision, time: number) {
    const frame = Math.max(0, Math.round(time * revision.document.fps));
    const file = join(
      workspaceDirectory(this.root, workspaceId),
      'thumbnails',
      `${revision.id}-${frame}.png`,
    );
    try {
      await access(file);
      return file;
    } catch {
      /* Cache miss. */
    }
    const existing = this.pending.get(file);
    if (existing) return existing;
    const operation = this.tail.then(async () => {
      const executablePath =
        process.env.CODEX_UX_CHROME ??
        (process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : null);
      this.browser ??= await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });
      const page = await this.browser.newPage({
        viewport: {
          width: 640,
          height: Math.round((640 * revision.document.height) / revision.document.width),
        },
        deviceScaleFactor: 1,
      });
      try {
        await page.goto(
          `${this.origin}/capture/${workspaceId}/${revision.id}?time=${frame / revision.document.fps}`,
        );
        await page.waitForFunction(
          "document.documentElement.dataset.ready === 'true'",
          {},
          { timeout: 30000 },
        );
        await page.waitForTimeout(120);
        const bytes = await page.screenshot();
        await mkdir(join(workspaceDirectory(this.root, workspaceId), 'thumbnails'), {
          recursive: true,
        });
        await writeFile(file, bytes);
        return file;
      } finally {
        await page.close();
      }
    });
    this.tail = operation.catch(() => undefined);
    this.pending.set(file, operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(file);
    }
  }
  async close() {
    await this.browser?.close();
  }
}
