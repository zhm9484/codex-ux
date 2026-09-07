import { createHash } from 'node:crypto';
import { starterFiles, videoSchema } from '../packages/video-domain/src/index.ts';
export function fixtureDocument(name = 'Test') {
  return videoSchema.parse({
    version: 1,
    name,
    source: { kind: 'hyperframes', entry: 'index.html', fps: 30 },
    width: 1280,
    height: 720,
    duration: 18,
    fps: 30,
    assets: [],
    files: Object.fromEntries(
      Object.entries(starterFiles()).map(([path, text]) => [
        path,
        {
          text,
          size: Buffer.byteLength(text),
          hash: createHash('sha256').update(text).digest('hex'),
        },
      ]),
    ),
  });
}
