import { sameEditableDocument, type LiveTextEdit } from '../canvas/live-edit';
import { preparePlayer } from '../canvas/prepare-player';
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from 'react';
import { HyperframesPlayer } from '@hyperframes/player';
import { durationOf, type Clip, type VideoDocument } from '@codex-ux/video-domain';
import type { Region } from '@codex-ux/protocol';
import { bindAreaGesture } from '../canvas/area-gesture';
import { createTextEditor } from '../canvas/text-editor';
import type { CanvasText } from '../canvas/text-model';
import { bindPlayerInteractions } from '../editor/player-interactions';
import type { PlayerControl } from '../editor/types';

export interface PlayerOptions {
  workspaceId: string;
  revisionId: string;
  document: VideoDocument;
  time: number;
  selectedId: string | null;
  onTime: (time: number) => void;
  onPlaying: (playing: boolean) => void;
  onSelect: (id: string) => void;
  onDisplayed?: (revisionId: string) => void;
  onTextRestore?: (selection: CanvasText) => void;
  onTextSelect?: (selection: CanvasText) => void;
  onTextEdit?: (selection: CanvasText, next: Clip) => Promise<unknown>;
  onClear?: () => void;
  onArea?: (region: Region | null, active: boolean, point?: { x: number; y: number }) => void;
  onContext?: (position: { x: number; y: number }) => void;
  control: React.RefObject<PlayerControl | null>;
  compare?: boolean;
  muted?: boolean;
}

export function usePlayer(p: PlayerOptions) {
  const liveEdit = useRef<LiveTextEdit | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<HyperframesPlayer | null>(null);
  const textEditor = useRef<ReturnType<typeof createTextEditor> | null>(null);
  const [readyRevision, setReadyRevision] = useState('');
  const [failure, setFailure] = useState('');
  useImperativeHandle(
    p.control,
    () => ({
      seek: (time) => player.current?.seek(time),
      play: () => player.current?.play(),
      pause: () => player.current?.pause(),
      stageTextEdit: (edit) => {
        liveEdit.current = edit;
      },
      selectText: (id) => textEditor.current?.select(id),
      editText: (id) => textEditor.current?.edit(id),
      isTextEditing: () =>
        !!player.current?.iframeElement.contentDocument?.querySelector(
          '[contenteditable="plaintext-only"]',
        ),
      textBounds: (id) => textEditor.current?.describe(id)?.box,
      patchText: (selection, next) => textEditor.current?.patch(selection, next),
      setMuted: (muted) => {
        if (player.current) player.current.muted = muted;
      },
      patch: (clip) => {
        const element = player.current?.iframeElement.contentDocument?.getElementById(clip.id);
        if (!element || clip.kind !== 'text') return;
        const span = element.querySelector('span');
        if (span) span.textContent = clip.text;
        Object.assign(element.style, {
          fontSize: `${clip.fontSize}px`,
          fontFamily: clip.fontFamily,
          color: clip.color,
          textAlign: clip.align,
          left: `${clip.x}%`,
          top: `${clip.y}%`,
          width: `${clip.width}%`,
        });
      },
    }),
    [],
  );
  const displayed = useEffectEvent((revisionId: string) => p.onDisplayed?.(revisionId));
  const restoreText = useEffectEvent((selection: CanvasText) => p.onTextRestore?.(selection));
  const selectText = useEffectEvent((selection: CanvasText) => p.onTextSelect?.(selection));
  const editText = useEffectEvent(
    (selection: CanvasText, next: Clip) =>
      p.onTextEdit?.(selection, next) ?? Promise.resolve(false),
  );
  const setupText = useEffectEvent((instance: HyperframesPlayer) => {
    const editor = createTextEditor(
      instance.iframeElement.contentDocument!,
      p.document,
      selectText,
      editText,
      () => instance.pause(),
      restoreText,
    );
    if (p.selectedId) editor.restore(p.selectedId);
    return editor;
  });
  const area = useEffectEvent(
    (region: Region | null, active: boolean, point?: { x: number; y: number }) => {
      const rect = player.current?.getBoundingClientRect();
      p.onArea?.(
        region,
        active,
        point && rect
          ? {
              x: rect.left + (point.x * rect.width) / p.document.width,
              y: rect.top + (point.y * rect.width) / p.document.width,
            }
          : undefined,
      );
    },
  );
  const clear = useEffectEvent(() => p.onClear?.());
  const context = useEffectEvent((position: { x: number; y: number }) => p.onContext?.(position));
  const clipIds = useEffectEvent(() => p.document.clips.map((clip) => clip.id));
  const select = useEffectEvent((id: string) => {
    if (p.document.clips.some((clip) => clip.id === id)) p.onSelect(id);
  });
  const restore = useEffectEvent((instance: HyperframesPlayer) => {
    instance.muted = p.compare || (p.muted ?? false);
    instance.seek(Math.max(0, Math.min(p.time, durationOf(p.document) - 1 / p.document.fps)));
    p.onPlaying(false);
  });
  const tick = useEffectEvent((instance: HyperframesPlayer) => p.onTime(instance.currentTime));
  const playing = useEffectEvent((instance: HyperframesPlayer) => p.onPlaying(!instance.paused));
  const source = useEffectEvent(() => p.document);
  useEffect(() => {
    const doc = source();
    const edit = liveEdit.current;
    const reuse = !!(player.current && edit && sameEditableDocument(edit.document, doc));
    liveEdit.current = null;
    const instance = preparePlayer(
      reuse ? player.current : null,
      doc,
      p.workspaceId,
      p.revisionId,
      p.compare,
      edit,
    );
    let stopped = false;
    let swapping = false;
    let failed = false;
    let swapFrame = 0;
    let unbind = () => {};
    let unbindArea = () => {};
    const ready = () => {
      if (stopped || swapping || failed) return;
      swapping = true;
      restore(instance);
      // The runtime may apply seek through postMessage. Keep the old frame for two paints.
      swapFrame = requestAnimationFrame(() => {
        swapFrame = requestAnimationFrame(reveal);
      });
    };
    const reveal = () => {
      if (stopped || failed) return;
      const previous = player.current;
      player.current = instance;

      instance.style.opacity = '1';
      instance.style.pointerEvents = '';
      if (previous !== instance) previous?.remove();
      displayed(p.revisionId);
      setReadyRevision(p.revisionId);
      setFailure('');
      if (!p.compare) {
        textEditor.current = setupText(instance);
        unbindArea = bindAreaGesture(
          instance.iframeElement.contentDocument!,
          doc.width,
          doc.height,
          () => {
            instance.pause();
            clear();
          },
          area,
        );
        unbind = bindPlayerInteractions(
          instance,
          clipIds(),
          select,
          (id) => textEditor.current?.edit(id),
          clear,
          context,
        );
      }
    };
    const time = () => {
      if (player.current === instance) tick(instance);
    };
    const playback = () => {
      if (player.current === instance) playing(instance);
    };
    const error = () => {
      failed = true;
      setFailure('Preview unavailable. The previous frame is kept while you check this version.');
    };
    const report = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        !data ||
        typeof data !== 'object' ||
        !('source' in data) ||
        !('type' in data) ||
        !('message' in data)
      )
        return;
      if (
        event.source !== instance.iframeElement.contentWindow ||
        data.source !== 'video-editor' ||
        data.type !== 'preview-error'
      )
        return;
      failed = true;
      setFailure(
        `Preview update failed: ${String(data.message).slice(0, 300)}. The previous frame is kept.`,
      );
    };
    window.addEventListener('message', report);
    instance.addEventListener('ready', ready);
    instance.addEventListener('timeupdate', time);
    instance.addEventListener('play', playback);
    instance.addEventListener('pause', playback);
    instance.addEventListener('error', error);
    if (reuse) ready();
    else host.current?.appendChild(instance);
    return () => {
      stopped = true;
      cancelAnimationFrame(swapFrame);
      window.removeEventListener('message', report);
      instance.pause();
      instance.removeEventListener('ready', ready);
      instance.removeEventListener('timeupdate', time);
      instance.removeEventListener('play', playback);
      instance.removeEventListener('pause', playback);
      instance.removeEventListener('error', error);
      unbind();
      unbindArea();
      textEditor.current?.destroy();
      textEditor.current = null;
      instance.style.pointerEvents = 'none';
      if (player.current !== instance) instance.remove();
    };
  }, [p.workspaceId, p.revisionId, p.document.width, p.document.height, p.compare]);
  useEffect(
    () => () => {
      player.current?.remove();
      player.current = null;
    },
    [],
  );
  return { host, ready: !!readyRevision, refreshing: readyRevision !== p.revisionId, failure };
}

void HyperframesPlayer;
