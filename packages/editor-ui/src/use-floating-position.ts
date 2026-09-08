import { useLayoutEffect, useRef } from 'react';

export interface FloatingAnchor {
  left: number;
  top: number;
  bottom: number;
  right?: number;
  placement?: 'beside';
}
export function useFloatingPosition(open: boolean, anchor: FloatingAnchor | null) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element || !anchor) return;
    const place = () => {
      const margin = 12;
      const width = element.offsetWidth,
        height = element.offsetHeight;
      const beside = anchor.placement === 'beside';
      const fitsRight = (anchor.right ?? anchor.left) + width + margin * 2 <= window.innerWidth;
      const fitsLeft = anchor.left - width - margin >= margin;
      const besideFits = beside && (fitsRight || fitsLeft);
      const preferredLeft = besideFits
        ? fitsRight
          ? (anchor.right ?? anchor.left) + margin
          : anchor.left - width - margin
        : anchor.left;
      const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - width - margin));
      const below = anchor.bottom + 10;
      const top = besideFits
        ? anchor.top
        : below + height <= window.innerHeight - margin
          ? below
          : Math.max(margin, anchor.top - height - 10);
      element.style.left = `${left}px`;
      element.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, anchor]);
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
