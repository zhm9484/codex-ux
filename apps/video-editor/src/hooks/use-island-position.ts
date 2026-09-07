import { useLayoutEffect, useRef } from 'react';
type Point = { x: number; y: number };
const key = 'video-editor:tool-position';
export function useIslandPosition() {
  const ref = useRef<HTMLDivElement>(null);
  const position = useRef<Point>({ x: 16, y: 180 });
  const drag = useRef<{ point: Point; pointer: Point; id: number } | null>(null);
  const place = (point: Point) => {
    const element = ref.current;
    if (!element) return;
    const next = {
      x: Math.max(10, Math.min(window.innerWidth - element.offsetWidth - 10, point.x)),
      y: Math.max(10, Math.min(window.innerHeight - element.offsetHeight - 10, point.y)),
    };
    position.current = next;
    element.style.left = `${next.x}px`;
    element.style.top = `${next.y}px`;
  };
  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify(position.current));
    } catch {
      /* Position remains available for this session. */
    }
  };
  useLayoutEffect(() => {
    let initial = { x: 16, y: Math.max(80, window.innerHeight * 0.35) };
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        saved &&
        typeof saved === 'object' &&
        'x' in saved &&
        'y' in saved &&
        typeof saved.x === 'number' &&
        typeof saved.y === 'number' &&
        Number.isFinite(saved.x) &&
        Number.isFinite(saved.y)
      )
        initial = { x: saved.x, y: saved.y };
    } catch {
      /* Use the default position. */
    }
    place(initial);
    const resize = () => place(position.current);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return {
    ref,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          point: position.current,
          pointer: { x: event.clientX, y: event.clientY },
          id: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        ref.current?.classList.add('dragging');
      },
      onPointerMove: (event: React.PointerEvent) => {
        const start = drag.current;
        if (start)
          place({
            x: start.point.x + event.clientX - start.pointer.x,
            y: start.point.y + event.clientY - start.pointer.y,
          });
      },
      onPointerUp: () => {
        drag.current = null;
        ref.current?.classList.remove('dragging');
        persist();
      },
      onPointerCancel: () => {
        if (drag.current) place(drag.current.point);
        drag.current = null;
        ref.current?.classList.remove('dragging');
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Escape' && drag.current) {
          place(drag.current.point);
          drag.current = null;
          ref.current?.classList.remove('dragging');
        }
        const delta = {
          ArrowLeft: [-16, 0],
          ArrowRight: [16, 0],
          ArrowUp: [0, -16],
          ArrowDown: [0, 16],
        }[event.key];
        if (delta) {
          event.preventDefault();
          place({ x: position.current.x + delta[0]!, y: position.current.y + delta[1]! });
          persist();
        }
      },
    },
  };
}
