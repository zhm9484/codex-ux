import { useEffect, useLayoutEffect, useRef, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, type PlayerRef } from '@remotion/player';
import type { VideoSource } from '@codex-ux/video-domain';
import { createController, settled } from './controller.ts';
import type { PreviewWindow } from './types.ts';

type Source = Extract<VideoSource, { kind: 'remotion' }>;
export function mountRemotion(component: ComponentType<Record<string, unknown>>, source: Source) {
  let player: PlayerRef | null = null;
  let failed = false;
  const runtime = createController({
    seek: async (time) => {
      const target = Math.max(
        0,
        Math.min(source.durationInFrames - 1, Math.round(time * source.fps)),
      );
      player!.seekTo(target);
      await settled(runtime.controller.state);
      runtime.update({ time: player!.getCurrentFrame() / source.fps });
    },
    play: () => player?.play(),
    pause: () => player?.pause(),
    setMuted: (value) => (value ? player?.mute() : player?.unmute()),
  });
  const fail = (error: unknown) => {
    failed = true;
    runtime.fail(error);
  };
  function Failure({ error }: { error: Error }) {
    useEffect(() => {
      fail(error);
    }, [error]);
    return <p role="alert">{error.message}</p>;
  }
  function App() {
    const ref = useRef<PlayerRef>(null);
    useLayoutEffect(() => {
      player = ref.current;
      if (!player) return;
      const update = () =>
        runtime.update({
          time: player!.getCurrentFrame() / source.fps,
          playing: player!.isPlaying(),
        });
      player.addEventListener('frameupdate', update);
      player.addEventListener('play', update);
      player.addEventListener('pause', update);
      player.addEventListener('ended', update);
      player.addEventListener('waiting', () => runtime.update({ buffering: true }));
      player.addEventListener('resume', () => runtime.update({ buffering: false }));
      player.addEventListener('error', (event) => fail(event.detail.error));
      void settled(runtime.controller.state)
        .then(async () => {
          if (failed) return;
          await runtime.ready();
          await runtime.controller.seek(
            Number(new URLSearchParams(location.search).get('time')) || 0,
          );
          document.documentElement.dataset.ready = 'true';
        })
        .catch(fail);
    }, []);
    return (
      <Player
        ref={ref}
        component={component}
        inputProps={source.inputProps}
        durationInFrames={source.durationInFrames}
        fps={source.fps}
        compositionWidth={source.width}
        compositionHeight={source.height}
        style={{ width: '100vw', height: '100vh' }}
        controls={false}
        clickToPlay={false}
        spaceKeyToPlayOrPause={false}
        errorFallback={({ error }) => <Failure error={error} />}
      />
    );
  }
  runtime.update({ buffering: false });
  const root = document.createElement('div');
  document.body.appendChild(root);
  createRoot(root).render(<App />);
  (window as PreviewWindow).__videoPreview = runtime.controller;
}
