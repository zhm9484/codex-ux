import { useRef } from 'react';
import type { EditorState } from '../hooks/use-editor';
import type { CanvasText } from './text-model';

export function SelectionBox({ state }: { state: EditorState }) {
  const start = useRef<{
    selection: CanvasText;
    x: number;
    y: number;
    width: number;
    height: number;
    corner: string;
  } | null>(null);
  const selection = state.canvasText;
  if (!selection || state.playing || state.marking) return null;
  const { box } = selection;
  const cancel = () => {
    if (start.current) {
      state.control.current?.patchText(start.current.selection, start.current.selection.clip);
      state.setCanvasText(start.current.selection);
      start.current = null;
    }
  };
  return (
    <div
      className="text-selection"
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
    >
      {['nw', 'ne', 'sw', 'se'].map((corner) => (
        <button
          key={corner}
          className={`text-resize ${corner}`}
          aria-label={`Resize text ${corner}`}
          disabled={state.saving}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            start.current = {
              selection,
              x: event.clientX,
              y: event.clientY,
              height: event.currentTarget.parentElement!.getBoundingClientRect().height,
              width: event.currentTarget.parentElement!.getBoundingClientRect().width,
              corner,
            };
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            const initial = start.current;
            const ratio = Math.max(
              8 / initial.selection.clip.fontSize,
              Math.min(
                400 / initial.selection.clip.fontSize,
                1 +
                  ((event.clientX - initial.x) *
                    (initial.corner.endsWith('w') ? -1 : 1) *
                    initial.width +
                    (event.clientY - initial.y) *
                      (initial.corner.startsWith('n') ? -1 : 1) *
                      initial.height) /
                    Math.max(400, initial.width ** 2 + initial.height ** 2),
              ),
            );
            const clip = {
              ...initial.selection.clip,
              fontSize: Math.round(initial.selection.clip.fontSize * ratio),
              width: initial.selection.source
                ? initial.selection.clip.width
                : Math.min(100, initial.selection.clip.width * ratio),
            };
            state.control.current?.patchText(initial.selection, clip);
            state.setCanvasText({
              ...initial.selection,
              clip,
              box: state.control.current?.textBounds(clip.id) ?? initial.selection.box,
            });
          }}
          onPointerUp={() => {
            if (start.current) {
              void state.updateText(start.current.selection, selection.clip);
              start.current = null;
            }
          }}
          onPointerCancel={cancel}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              cancel();
            }
          }}
        />
      ))}
    </div>
  );
}
