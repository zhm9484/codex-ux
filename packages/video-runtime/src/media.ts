import { createController, settled } from './controller.ts';

export function mountMedia(src: string, duration: number) {
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'display:block;width:100vw;height:100vh;object-fit:contain';
  document.body.appendChild(video);
  const runtime = createController({
    seek: async (time) => {
      const target = Math.max(0, Math.min(duration - 0.001, time));
      video.currentTime = target;
      await settled(runtime.controller.state);
      runtime.update({ time: video.currentTime });
    },
    play: () => {
      void video.play().catch(runtime.fail);
    },
    pause: () => video.pause(),
    setMuted: (value) => {
      video.muted = value;
    },
  });
  const update = () =>
    runtime.update({
      time: video.currentTime,
      playing: !video.paused && !video.ended,
      buffering: video.readyState < 2 || video.seeking,
    });
  for (const event of [
    'timeupdate',
    'play',
    'pause',
    'ended',
    'waiting',
    'seeking',
    'seeked',
    'loadeddata',
    'canplay',
  ])
    video.addEventListener(event, update);
  video.addEventListener('error', () =>
    runtime.fail(video.error?.message || 'Could not decode this video.'),
  );
  video.addEventListener(
    'loadeddata',
    () => {
      void runtime.ready().catch(runtime.fail);
    },
    { once: true },
  );
  video.src = src;
  return runtime.controller;
}
