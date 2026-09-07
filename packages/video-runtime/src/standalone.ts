import { mountMedia } from './media.ts';
import { mountHyperframes } from './hyperframes.ts';
import type { PreviewWindow } from './types.ts';
const data = JSON.parse(document.getElementById('video-config')!.textContent) as {
  kind: 'media' | 'hyperframes';
  src: string;
  width: number;
  height: number;
  duration: number;
};
const controller =
  data.kind === 'media'
    ? mountMedia(data.src, data.duration)
    : mountHyperframes(data.src, data.width, data.height);
const time = Number(new URLSearchParams(location.search).get('time')) || 0;
void controller.ready
  .then(() => controller.seek(time))
  .then(() => {
    document.documentElement.dataset.ready = 'true';
  })
  .catch((error: unknown) => {
    (window as PreviewWindow).__videoError = error instanceof Error ? error.message : String(error);
  });
