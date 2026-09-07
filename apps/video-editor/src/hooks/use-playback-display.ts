import { useEffect, useEffectEvent } from 'react';
import type { PlaybackClock } from '../lib/playback-clock';

export function usePlaybackDisplay(clock: PlaybackClock, paint: (time: number) => void) {
  const draw = useEffectEvent(paint);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      draw(clock.sample());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [clock]);
}
