import assert from 'node:assert/strict';
import test from 'node:test';
import {
  videoSchema,
  sourceSchema,
  intentSchema,
  type TimelineItem,
} from '../packages/video-domain/src/schema.ts';
import {
  moveTiming,
  clampTime,
  formatTime,
  timeStep,
} from '../packages/video-domain/src/timeline.ts';
import { fixtureDocument } from './video-fixtures.ts';
const item: TimelineItem = {
  id: 'title',
  name: 'Title',
  kind: 'text',
  start: 2,
  duration: 4,
  target: { path: 'index.html', index: 0, offset: 1 },
};
void test('source timing edits respect scene offsets, frame rounding and minimum duration', () => {
  assert.deepEqual(moveTiming(item, -4, 25, 'move'), { ...item, start: 1 });
  const extended = moveTiming(item, -2, 25, 'start');
  assert.equal(extended.start, 1);
  assert.equal(extended.duration, 5);
  assert.equal(moveTiming(item, 0.043, 25, 'move').start, 2.04);
  assert.equal(moveTiming(item, -9, 25, 'end').duration, 0.1);
});
void test('media time is in seconds without an invented frame rate', () => {
  const doc = { ...fixtureDocument(), fps: null };
  assert.equal(timeStep(null), 0.1);
  assert.equal(clampTime(doc, 100), 17.999);
  assert.equal(formatTime(1.25, true, null), '00:01.250');
  assert.equal(formatTime(1.2, true, 25), '00:01:05');
});
void test('source documents reject old arrangements, missing entries and unsafe paths', () => {
  const doc = fixtureDocument();
  assert.ok(videoSchema.safeParse(doc).success);
  for (const extra of [{ tracks: [] }, { clips: [] }, { native: {} }, { sources: {} }])
    assert.equal(videoSchema.safeParse({ ...doc, ...extra }).success, false);
  assert.equal(videoSchema.safeParse({ ...doc, files: {} }).success, false);
  assert.equal(sourceSchema.safeParse({ kind: 'media', entry: '../outside.mp4' }).success, false);
  assert.equal(
    sourceSchema.safeParse({
      kind: 'remotion',
      entry: 'Video.tsx',
      fps: 25,
      width: 640,
      height: 360,
      durationInFrames: 0,
    }).success,
    false,
  );
  assert.equal(intentSchema.safeParse({ kind: 'transition', duration: 0 }).success, false);
  assert.deepEqual(intentSchema.parse({ kind: 'transition', duration: 0.4 }), {
    kind: 'transition',
    duration: 0.4,
  });
});
