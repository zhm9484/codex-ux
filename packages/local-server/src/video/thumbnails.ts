import { createRequire } from 'node:module';
import type { chromium as Chromium, Browser } from 'playwright-core';
import { backgroundBrowser } from '../browser.ts';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clampTime, type Revision } from '@codex-ux/video-domain';
import { videoDirectory } from './files.ts';

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
    const position = clampTime(revision.document, time);
    const frame = Math.round(position * 1000);
    const file = join(
      videoDirectory(this.root, workspaceId),
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
      const { executablePath } = await backgroundBrowser();
      const { chromium } = createRequire(import.meta.url)('playwright-core') as {
        chromium: typeof Chromium;
      };
      this.browser ??= await chromium.launch({ executablePath, headless: true });
      const page = await this.browser.newPage({
        viewport: {
          width: 640,
          height: Math.round((640 * revision.document.height) / revision.document.width),
        },
        deviceScaleFactor: 1,
      });
      try {
        await page.goto(
          `${this.origin}/media/video-editor/capture/${workspaceId}/${revision.id}?time=${position}`,
        );
        await page.waitForFunction(
          "document.documentElement.dataset.ready === 'true'",
          {},
          { timeout: 30000 },
        );
        await page.waitForTimeout(120);
        const bytes = await page.screenshot();
        await mkdir(join(videoDirectory(this.root, workspaceId), 'thumbnails'), {
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
