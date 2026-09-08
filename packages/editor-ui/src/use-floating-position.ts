import { useLayoutEffect, useRef } from 'react';

export interface FloatingAnchor {
  left: number;
  top: number;
  bottom: number;
  right?: number;
  placement?: 'beside';
}
export function useFloatingPosition(open: boolean, anchor: FloatingAnchor | null, movable = false) {
  const ref = useRef<HTMLElement>(null);
  const moved = useRef<{ key: string; left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element || !anchor) return;
    const key = JSON.stringify(anchor);
    let placement: 'right' | 'left' | 'above' | 'below' | undefined;
    const place = () => {
      const margin = 12;
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      element.style.maxHeight = `min(calc(100svh - ${margin * 2}px), ${viewportHeight - margin * 2}px)`;
      element.style.maxWidth = `min(calc(100vw - ${margin * 2}px), ${viewportWidth - margin * 2}px)`;
      element.style.setProperty('--floating-height', `${viewportHeight - margin * 2}px`);
      const width = element.offsetWidth,
        height = element.offsetHeight;
      const beside = anchor.placement === 'beside';
      const fitsRight = (anchor.right ?? anchor.left) + width + margin * 2 <= viewportWidth;
      const fitsLeft = anchor.left - width - margin >= margin;
      // Keep the chosen side while typing or expanding context; content growth must not flip it.
      placement ??=
        beside && fitsRight
          ? 'right'
          : beside && fitsLeft
            ? 'left'
            : anchor.bottom + 10 + height <= viewportHeight - margin
              ? 'below'
              : 'above';
      const preferredLeft =
        placement === 'right'
          ? (anchor.right ?? anchor.left) + margin
          : placement === 'left'
            ? anchor.left - width - margin
            : anchor.left;
      const manual = moved.current?.key === key ? moved.current : null;
      const left = Math.max(
        offsetLeft + margin,
        Math.min(manual?.left ?? preferredLeft, offsetLeft + viewportWidth - width - margin),
      );
      const below = anchor.bottom + 10;
      const top =
        placement === 'right' || placement === 'left'
          ? anchor.top
          : placement === 'below'
            ? below
            : Math.max(margin, anchor.top - height - 10);
      element.style.left = `${left}px`;
      element.style.top = `${Math.max(offsetTop + margin, Math.min(manual?.top ?? top, offsetTop + viewportHeight - height - margin))}px`;
    };
    let drag: {
      x: number;
      y: number;
      left: number;
      top: number;
      id: number;
      handle: HTMLElement;
    } | null = null;
    const start = (event: PointerEvent) => {
      const handle = (event.target as Element).closest<HTMLElement>('[data-floating-drag]');
      if (!movable || !handle || event.button !== 0) return;
      event.preventDefault();
      handle.focus();
      drag = {
        x: event.clientX,
        y: event.clientY,
        left: element.offsetLeft,
        top: element.offsetTop,
        id: event.pointerId,
        handle,
      };
      handle.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      moved.current = {
        key,
        left: drag.left + event.clientX - drag.x,
        top: drag.top + event.clientY - drag.y,
      };
      place();
    };
    const stop = () => {
      drag = null;
    };
    const nudge = (event: KeyboardEvent) => {
      if (!movable || !(event.target as Element).closest('[data-floating-drag]')) return;
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 40 : 10;
      moved.current = {
        key,
        left: element.offsetLeft + direction[0]! * step,
        top: element.offsetTop + direction[1]! * step,
      };
      place();
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    element.addEventListener('pointerdown', start);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointercancel', stop);
    element.addEventListener('lostpointercapture', stop);
    element.addEventListener('keydown', nudge);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      if (drag?.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id);
      element.removeEventListener('pointerdown', start);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', stop);
      element.removeEventListener('pointercancel', stop);
      element.removeEventListener('lostpointercapture', stop);
      element.removeEventListener('keydown', nudge);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open, anchor, movable]);
  return ref;
}

export function anchorBeside(element: HTMLElement): FloatingAnchor {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    placement: 'beside',
  };
}

export function anchorBelow(element: HTMLElement): FloatingAnchor {
  const rect = element.getBoundingClientRect();
  return { left: rect.right - 360, top: rect.top, bottom: rect.bottom };
}
