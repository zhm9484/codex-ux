import type { Region } from '@codex-ux/protocol';

/** Empty canvas is always a region-selection surface. Text owns its own move gesture. */
export function bindAreaGesture(
  frame: Document,
  width: number,
  height: number,
  clear: () => void,
  update: (region: Region | null, active: boolean, point?: { x: number; y: number }) => void,
) {
  let origin: { x: number; y: number; pointerId: number; target: Element } | null = null;
  let region: Region | null = null;
  let completed = false;
  const point = (event: PointerEvent) => ({
    x: Math.max(0, Math.min(1, event.clientX / width)),
    y: Math.max(0, Math.min(1, event.clientY / height)),
  });
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest('[data-ux-text],input,button,a'))
      return;
    clear();
    event.preventDefault();
    const target = event.target as Element;
    origin = { ...point(event), pointerId: event.pointerId, target };
    region = null;
    completed = false;
    target.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!origin) return;
    const p = point(event);
    if (Math.hypot(p.x - origin.x, p.y - origin.y) < 0.005) return;
    region = {
      x: Math.min(p.x, origin.x),
      y: Math.min(p.y, origin.y),
      width: Math.abs(p.x - origin.x),
      height: Math.abs(p.y - origin.y),
    };
    update(region, true);
  };
  const end = (event: PointerEvent) => {
    if (!origin) return;
    completed = !!region && region.width > 0.005 && region.height > 0.005;
    update(completed ? region : null, false, { x: event.clientX, y: event.clientY });
    origin = null;
  };
  const cancel = () => {
    origin = null;
    region = null;
    update(null, false);
  };
  const click = (event: MouseEvent) => {
    if (completed) {
      completed = false;
      event.stopImmediatePropagation();
    }
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && origin) cancel();
  };
  frame.addEventListener('pointerdown', down);
  frame.addEventListener('pointermove', move);
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', cancel);
  frame.addEventListener('click', click, true);
  frame.addEventListener('keydown', key);
  return () => {
    frame.removeEventListener('pointerdown', down);
    frame.removeEventListener('pointermove', move);
    frame.removeEventListener('pointerup', end);
    frame.removeEventListener('pointercancel', cancel);
    frame.removeEventListener('click', click, true);
    frame.removeEventListener('keydown', key);
  };
}
