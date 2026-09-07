import type { Clip, VideoDocument } from '@codex-ux/video-domain';
import { bounds, patchText, type CanvasText, type TextBinding } from './text-model';

export function startTextDrag(
  event: PointerEvent,
  binding: TextBinding,
  selection: CanvasText,
  doc: VideoDocument,
  select: (selection: CanvasText) => void,
  save: (selection: CanvasText, clip: Clip) => void,
) {
  if (event.button !== 0 || (event.target as HTMLElement).isContentEditable) return;
  const element = binding.element;
  const start = { x: event.clientX, y: event.clientY };
  let next = selection.clip;
  let moved = false;
  element.setPointerCapture(event.pointerId);
  const move = (event: PointerEvent) => {
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    event.preventDefault();
    next = {
      ...selection.clip,
      x: Math.max(0, Math.min(100, selection.clip.x + (dx / doc.width) * 100)),
      y: Math.max(0, Math.min(100, selection.clip.y + (dy / doc.height) * 100)),
    };
    patchText(element, selection, next, doc);
    select({ ...selection, clip: next, box: bounds(element, doc) });
  };
  const finish = () => {
    cleanup();
    if (moved) save(selection, next);
  };
  const cancel = () => {
    cleanup();
    patchText(element, selection, selection.clip, doc);
    select(selection);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    }
  };
  const cleanup = () => {
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', finish);
    element.removeEventListener('pointercancel', cancel);
    element.ownerDocument.removeEventListener('keydown', key, true);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    if (moved)
      element.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true });
  };
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', cancel);
  element.ownerDocument.addEventListener('keydown', key, true);
}
