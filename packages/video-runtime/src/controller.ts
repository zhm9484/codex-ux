import type { PlaybackState, PreviewController, PreviewWindow } from './types.ts';

export const paints = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
export function createController(
  methods: Pick<PreviewController, 'seek' | 'play' | 'pause' | 'setMuted' | 'editingDocument'>,
) {
  let state: PlaybackState = { time: 0, playing: false, buffering: true, error: null };
  const listeners = new Set<(state: PlaybackState) => void>();
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // A failed iframe can finish loading before its host has subscribed.
  void ready.catch(() => {});
  const controller: PreviewController = {
    ...methods,
    ready,
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const update = (change: Partial<PlaybackState>) => {
    state = { ...state, ...change };
    for (const listener of listeners) listener(state);
  };
  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    (window as PreviewWindow).__videoError = message;
    update({ error: message, playing: false, buffering: false });
    rejectReady(new Error(message));
  };
  (window as PreviewWindow).__videoPreview = controller;
  window.addEventListener(
    'error',
    (event) => fail(event.message || 'A preview resource failed.'),
    true,
  );
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) =>
    fail(event.reason),
  );
  return {
    controller,
    update,
    fail,
    ready: async () => {
      await document.fonts.ready;
      await paints();
      if (state.error) throw new Error(state.error);
      update({ buffering: false });
      resolveReady();
    },
  };
}
/** Presentation acknowledgement includes loaded media and fonts, not just a mounted component. */
export async function settled(state: () => PlaybackState, timeout = 30000) {
  const start = performance.now();
  await paints();
  while (true) {
    const current = state();
    if (current.error) throw new Error(current.error);
    const images = Array.from(document.images);
    if (images.some((image) => image.complete && image.naturalWidth === 0))
      throw new Error('A preview image could not load.');
    const media = Array.from(document.querySelectorAll<HTMLMediaElement>('video,audio'));
    if (media.some((element) => element.error)) throw new Error('Preview media could not load.');
    if (
      !current.buffering &&
      images.every((image) => image.complete) &&
      media.every((element) => element.readyState >= 2 && !element.seeking)
    )
      break;
    if (performance.now() - start > timeout)
      throw new Error('Preview timed out while loading media.');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  await document.fonts.ready;
  await paints();
  const error = state().error;
  if (error) throw new Error(error);
}
