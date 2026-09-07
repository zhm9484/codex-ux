/** Presentation clock: interpolate runtime samples without re-rendering the editor per frame. */
export function createPlaybackClock() {
  let known = 1.5;
  let origin = known;
  let at = performance.now();
  let running = false;
  return {
    time: () => known,
    sample: () =>
      running ? Math.min(origin + (performance.now() - at) / 1000, known + 0.25) : known,
    update(time: number, playing: boolean) {
      const now = performance.now();
      const predicted = origin + (now - at) / 1000;
      if (playing !== running || !playing || Math.abs(time - predicted) > 0.12) {
        origin = time;
        at = now;
      }
      known = time;
      running = playing;
    },
  };
}
export type PlaybackClock = ReturnType<typeof createPlaybackClock>;
