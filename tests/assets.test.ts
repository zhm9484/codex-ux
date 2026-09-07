import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveAsset } from '../packages/local-server/src/video/assets.ts';

void test('media imports read actual duration and remove rejected files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-ux-assets-'));
  try {
    const wav = Buffer.alloc(16044);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(16036, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(16000, 40);
    const asset = await saveAsset(root, 'video', 'Silence.wav', 'audio/wav', wav);
    assert.equal(asset.duration, 1);
    assert.match(asset.file, /^[\w-]+\.wav$/);
    await assert.rejects(
      saveAsset(root, 'video', 'Broken.mp4', 'video/mp4', Buffer.from('not a movie')),
      /Could not read/,
    );
    await assert.rejects(
      saveAsset(root, 'video', 'Script.html', 'text/html', Buffer.from('<script>')),
      /Use PNG/,
    );
    const files = await readdir(join(root, 'workspaces/video/apps/video-editor/assets'));
    assert.deepEqual(files, [asset.file]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
