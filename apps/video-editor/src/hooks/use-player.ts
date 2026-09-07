import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from 'react';
import { clampTime, type TextElement, type VideoDocument } from '@codex-ux/video-domain';
import type { PreviewController, PreviewWindow } from '@codex-ux/video-runtime';
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
  onDisplayed?: (revisionId: string) => void;
  onTextRestore?: (selection: CanvasText) => void;
  onTextSelect?: (selection: CanvasText) => void;
  onTextEdit?: (selection: CanvasText, next: TextElement) => Promise<unknown>;
  onClear?: () => void;
  onArea?: (region: Region | null, active: boolean, point?: { x: number; y: number }) => void;
  onContext?: (position: { x: number; y: number }) => void;
  control: React.RefObject<PlayerControl | null>;
  compare?: boolean;
  muted?: boolean;
}
export function usePlayer(p: PlayerOptions) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<{
    frame: HTMLIFrameElement;
    controller: PreviewController;
    release: () => void;
  } | null>(null);
  const textEditor = useRef<ReturnType<typeof createTextEditor> | null>(null);
  const [presentation, setPresentation] = useState<{ id: string; document: VideoDocument } | null>(
    null,
  );
  const readyRevision = presentation?.id ?? '';
  const [failure, setFailure] = useState('');
  const report = (error: unknown) =>
    setFailure(
      `Preview update failed: ${error instanceof Error ? error.message : String(error)}. The previous frame is kept.`,
    );
  useImperativeHandle(
    p.control,
    () => ({
      seek: (time) => {
        void player.current?.controller.seek(time).catch(report);
      },
      play: () => player.current?.controller.play(),
      pause: () => player.current?.controller.pause(),
      setMuted: (value) => player.current?.controller.setMuted(value),
      selectText: (id) => textEditor.current?.select(id),
      editText: (id) => textEditor.current?.edit(id),
      isTextEditing: () =>
        !!player.current?.controller
          .editingDocument?.()
          ?.querySelector('[contenteditable="plaintext-only"]'),
      textBounds: (id) => textEditor.current?.describe(id)?.box,
      patchText: (selection, next) => textEditor.current?.patch(selection, next),
    }),
    [],
  );
  const current = useEffectEvent(() => p);
  const tick = useEffectEvent((controller: PreviewController) => {
    const state = controller.state();
    p.onTime(state.time);
    p.onPlaying(state.playing);
  });
  useEffect(() => {
    const frame = document.createElement('iframe');
    frame.title = p.compare ? 'Earlier video preview' : 'Video preview';
    frame.dataset.revision = p.revisionId;
    Object.assign(frame.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      border: '0',
      opacity: '0',
      pointerEvents: 'none',
    });
    frame.src = `/media/video-editor/preview/${p.workspaceId}/${p.revisionId}/player.html`;
    host.current?.appendChild(frame);
    let stopped = false;
    const cleanups: (() => void)[] = [];
    const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 30));
    const load = async () => {
      const deadline = Date.now() + 45000;
      let controller: PreviewController | undefined;
      while (!stopped) {
        const win: PreviewWindow | null = frame.contentWindow;
        if (win?.__videoError) throw new Error(win.__videoError);
        controller = win?.__videoPreview;
        if (controller) break;
        if (Date.now() > deadline) throw new Error('The preview did not become ready.');
        await wait();
      }
      if (stopped || !controller) return;
      await controller.ready;
      while (!stopped && frame.contentDocument?.documentElement.dataset.ready !== 'true') {
        const error = controller.state().error;
        if (error) throw new Error(error);
        if (Date.now() > deadline) throw new Error('The first frame did not become ready.');
        await wait();
      }
      if (stopped) return;
      const options = current();
      controller.setMuted(options.compare || options.muted || false);
      await controller.seek(clampTime(options.document, options.time));
      if (stopped) return;
      const previous = player.current;
      previous?.release();
      if (previous?.frame.isConnected) previous.controller.pause();
      player.current = {
        frame,
        controller,
        release: () => {
          for (const cleanup of cleanups) cleanup();
        },
      };
      frame.style.opacity = '1';
      frame.style.pointerEvents = options.compare ? 'none' : '';
      previous?.frame.remove();
      setPresentation({ id: options.revisionId, document: options.document });
      setFailure('');
      options.onDisplayed?.(options.revisionId);
      cleanups.push(
        controller.subscribe((state) => {
          if (state.error) report(state.error);
          if (player.current?.controller === controller) tick(controller);
        }),
      );
      if (!options.compare) {
        const editing = controller.editingDocument?.();
        const surface = editing ?? frame.contentDocument!;
        const width = () => (editing ? options.document.width : frame.clientWidth);
        const height = () => (editing ? options.document.height : frame.clientHeight);
        if (editing) {
          textEditor.current = createTextEditor(
            editing,
            options.document,
            (selection) => current().onTextSelect?.(selection),
            (selection, next) => current().onTextEdit?.(selection, next) ?? Promise.resolve(false),
            () => controller.pause(),
            (selection) => current().onTextRestore?.(selection),
          );
          const editor = textEditor.current;
          cleanups.push(() => {
            editor.destroy();
            if (textEditor.current === editor) textEditor.current = null;
          });
          if (options.selectedId) editor.restore(options.selectedId);
        }
        cleanups.push(
          bindAreaGesture(
            surface,
            width,
            height,
            () => {
              controller.pause();
              current().onClear?.();
            },
            (region, active, point) => {
              const rect = frame.getBoundingClientRect();
              current().onArea?.(
                region,
                active,
                point
                  ? {
                      x: rect.left + (point.x * rect.width) / width(),
                      y: rect.top + (point.y * rect.height) / height(),
                    }
                  : undefined,
              );
            },
          ),
        );
        cleanups.push(
          bindPlayerInteractions(
            surface,
            frame,
            width,
            () => controller.pause(),
            (id) => textEditor.current?.edit(id),
            () => current().onClear?.(),
            (point) => current().onContext?.(point),
          ),
        );
      }
    };
    void load().catch((error) => {
      if (!stopped) report(error);
    });
    return () => {
      stopped = true;
      if (player.current?.frame === frame) {
        if (frame.isConnected) player.current.controller.pause();
      } else {
        for (const cleanup of cleanups) cleanup();
        frame.remove();
      }
    };
  }, [p.workspaceId, p.revisionId, p.compare]);
  useEffect(
    () => () => {
      player.current?.release();
      player.current?.frame.remove();
      player.current = null;
    },
    [],
  );
  return {
    host,
    document: presentation?.document ?? p.document,
    ready: !!readyRevision,
    refreshing: readyRevision !== p.revisionId,
    failure,
  };
}
