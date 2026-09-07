import { useLayoutEffect, useRef } from 'react';

export interface FloatingAnchor {
  left: number;
  top: number;
  bottom: number;
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
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
      const below = anchor.bottom + 10;
      const top =
        below + height <= window.innerHeight - margin
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
