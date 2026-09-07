import { HyperframesPlayer } from '@hyperframes/player';
import { createController, paints } from './controller.ts';

export function mountHyperframes(src: string, width: number, height: number) {
  const player = document.createElement('hyperframes-player') as HyperframesPlayer;
  player.setAttribute('width', String(width));
  player.setAttribute('height', String(height));
  player.setAttribute('interactive', '');
  player.setAttribute('runtime-src', '/media/video-editor/engine/runtime.js');
  player.style.cssText = 'display:block;width:100vw;height:100vh';
  let intendedPlaying = false;
  let seekGeneration = 0;
  const runtime = createController({
    seek: async (time) => {
      const generation = ++seekGeneration;
      player.seek(time);
      await paints();
      if (runtime.controller.state().error) throw new Error(runtime.controller.state().error!);
      if (generation !== seekGeneration) return;
      if (intendedPlaying) player.play();
      runtime.update({ time: player.currentTime, playing: intendedPlaying });
    },
    play: () => {
      intendedPlaying = true;
      player.play();
      runtime.update({ playing: true });
    },
    pause: () => {
      intendedPlaying = false;
      player.pause();
      runtime.update({ playing: false });
    },
    setMuted: (value) => {
      player.muted = value;
    },
    editingDocument: () => player.iframeElement.contentDocument,
  });
  player.addEventListener('ready', () => {
    void runtime.ready().catch(runtime.fail);
  });
  player.addEventListener('ended', () => {
    intendedPlaying = false;
    runtime.update({ playing: false, time: player.currentTime });
  });
  for (const event of ['timeupdate', 'play', 'pause'])
    player.addEventListener(event, () =>
      runtime.update({ time: player.currentTime, playing: intendedPlaying }),
    );
  player.addEventListener('error', () => runtime.fail('HyperFrames preview failed.'));
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      event.source !== player.iframeElement.contentWindow ||
      !event.data ||
      typeof event.data !== 'object'
    )
      return;
    const data = event.data as Record<string, unknown>;
    if (data.source === 'video-editor' && data.type === 'preview-error')
      runtime.fail(String(data.message));
  });
  player.setAttribute('src', src);
  document.body.appendChild(player);
  return runtime.controller;
}
void HyperframesPlayer;
