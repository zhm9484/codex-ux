import assert from 'node:assert/strict';
import test from 'node:test';
import { clipSchema, videoSchema } from '../packages/video-domain/src/schema.ts';
import { moveClip, splitClip } from '../packages/video-domain/src/timeline.ts';
import { sampleDocument } from '../packages/video-domain/src/sample.ts';

const clip = clipSchema.parse({
  id: 'title',
  name: 'Title',
  kind: 'text',
  trackId: 'words',
  start: 2,
  duration: 4,
});

void test('text can extend left, but media cannot reveal negative source time', () => {
  const extended = moveClip(clip, -1, 30, 'start');
  assert.equal(extended.start, 1);
  assert.equal(extended.duration, 5);
  assert.equal(extended.offset, 0);
  const media = { ...clip, kind: 'video' as const, offset: 0.5 };
  const trimmed = moveClip(media, -2, 30, 'start');
  assert.equal(trimmed.start, 1.5);
  assert.equal(trimmed.offset, 0);
  assert.equal(trimmed.start + trimmed.duration, 6);
});

void test('splitting preserves source time and rejects sub-minimum fragments', () => {
  const parts = splitClip({ ...clip, offset: 3 }, 4, 'right');
  assert.ok(parts);
  assert.equal(parts[0].duration, 2);
  assert.equal(parts[1].start, 4);
  assert.equal(parts[1].offset, 5);
  assert.equal(parts[1].duration, 2);
  assert.equal(splitClip(clip, 2.01, 'tiny'), null);
  assert.equal(splitClip(clip, 6, 'outside'), null);
});

void test('documents reject missing references, repeated IDs and unsafe asset paths', () => {
  const document = sampleDocument('Test');
  assert.ok(videoSchema.safeParse(document).success);
  assert.equal(videoSchema.safeParse({ ...document, tracks: [] }).success, false);
  assert.equal(videoSchema.safeParse({ ...document, sources: {} }).success, false);
  assert.equal(
    videoSchema.safeParse({ ...document, clips: [...document.clips, document.clips[0]] }).success,
    false,
  );
  assert.equal(
    videoSchema.safeParse({
      ...document,
      assets: [{ id: 'bad', name: 'bad', file: '../secret', mime: 'image/png', size: 1 }],
    }).success,
    false,
  );
});
