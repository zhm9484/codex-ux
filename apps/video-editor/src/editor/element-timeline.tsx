import { useEffect, useRef, useState } from 'react';
import { Type, Layers } from 'lucide-react';
import { durationOf, moveClip, formatTime, type Clip } from '@codex-ux/video-domain';
import type { EditorState } from '../hooks/use-editor';
import { timelineItems, type TimelineItem } from './timeline-items';
import { updateElementTiming } from './element-edits';

export function ElementTimeline({ state }: { state: EditorState }) {
  const doc = state.workspace!.revision.document;
  const items = timelineItems(doc).filter(
    (item) => item.clip.id === state.selectedId && item.clip.kind === 'text',
  );
  const scroll = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    item: TimelineItem;
    x: number;
    width: number;
    edge: 'move' | 'start' | 'end';
    next: Clip;
  } | null>(null);
  const [draft, setDraft] = useState<Clip | null>(null);
  const duration = durationOf(doc);
  useEffect(() => {
    const selected = Array.from(
      scroll.current?.querySelectorAll<HTMLElement>('[data-element-id]') ?? [],
    ).find((element) => element.dataset.elementId === state.selectedId);
    if (selected && scroll.current) {
      const top = selected.offsetTop;
      if (
        top < scroll.current.scrollTop ||
        top + selected.offsetHeight > scroll.current.scrollTop + scroll.current.clientHeight
      )
        scroll.current.scrollTop = Math.max(0, top - 20);
    }
  }, [state.selectedId]);
  function cancel() {
    gesture.current = null;
    setDraft(null);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  return (
    <div className="element-timeline" ref={scroll} aria-label="Element timeline">
      {items.map((item) => {
        const clip = draft?.id === item.clip.id ? draft : item.clip;
        return (
          <div className="element-row" key={clip.id} data-element-id={clip.id}>
            <span className="element-name" title={clip.name}>
              {clip.kind === 'text' ? <Type size={12} /> : <Layers size={12} />}
              <span>{clip.name}</span>
            </span>
            <div
              className="element-track"
              onDoubleClick={() => state.selectTimeline(item, true)}
              onPointerDown={(event) => {
                if (event.button !== 0 || state.saving) return;
                const block = (event.target as Element).closest('[data-clip-block]');
                if (!block) return;
                state.selectTimeline(item);
                const edge = (event.target as HTMLElement).dataset.edge as
                  'start' | 'end' | undefined;
                gesture.current = {
                  item,
                  x: event.clientX,
                  width: event.currentTarget.getBoundingClientRect().width,
                  edge: edge ?? 'move',
                  next: clip,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
              onPointerMove={(event) => {
                const start = gesture.current;
                if (!start || start.item.clip.id !== item.clip.id) return;
                const delta = ((event.clientX - start.x) / start.width) * duration;
                if (Math.abs(event.clientX - start.x) < 3 && !draft) return;
                const next = moveClip(start.item.clip, delta, doc.fps, start.edge);
                if (item.native) next.start = Math.max(item.native.offset, next.start);
                next.duration = Math.min(
                  next.duration,
                  (doc.native ? duration : 3600) - next.start,
                );
                if (next.duration < 0.1) return;
                start.next = next;
                setDraft(next);
              }}
              onPointerUp={() => {
                const start = gesture.current;
                cancel();
                if (
                  start &&
                  (start.next.start !== start.item.clip.start ||
                    start.next.duration !== start.item.clip.duration)
                )
                  void state.save(
                    updateElementTiming(doc, start.item, start.next),
                    `Retime ${start.item.clip.name}`,
                  );
              }}
              onPointerCancel={cancel}
            >
              <button
                data-clip-block
                className={`element-block ${state.selectedId === clip.id ? 'selected' : ''}`}
                style={{
                  left: `${(clip.start / duration) * 100}%`,
                  width: `${(clip.duration / duration) * 100}%`,
                }}
                aria-label={`Timeline: ${clip.name}`}
                aria-pressed={state.selectedId === clip.id}
                onClick={() => state.selectTimeline(item)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  state.selectTimeline(item);
                  state.setContextMenu({ x: event.clientX, y: event.clientY });
                }}
              >
                <span
                  className="element-edge start"
                  data-edge="start"
                  title="Adjust appearance time"
                />
                <span className="element-block-label">{clip.name}</span>
                <span className="element-edge end" data-edge="end" title="Adjust duration" />
              </button>
              {draft?.id === clip.id && (
                <span className="element-time-hint">
                  {formatTime(clip.start, true)} · {clip.duration.toFixed(2)}s
                </span>
              )}
            </div>
          </div>
        );
      })}
      {state.canvasText?.source && !items.some((item) => item.clip.id === state.selectedId) && (
        <p className="timing-source-hint">
          This text follows its scene's animation. Add a note to change its timing with your agent.
        </p>
      )}
      {!items.length && !state.canvasText?.source && (
        <p className="timing-source-hint">
          Timing is controlled by the project's scripts. The source is preserved in full.
        </p>
      )}
    </div>
  );
}
