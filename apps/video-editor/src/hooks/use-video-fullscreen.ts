import { useEffect, useRef, useState } from 'react';

export function useVideoFullscreen() {
  const ref = useRef<HTMLElement>(null);
  const [native, setNative] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const changed = () => setNative(document.fullscreenElement === ref.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFallback(false);
    };
    document.addEventListener('fullscreenchange', changed);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  async function toggle() {
    if (fallback) {
      setFallback(false);
      return;
    }
    if (document.fullscreenElement === ref.current) {
      await document.exitFullscreen();
      return;
    }
    try {
      await ref.current?.requestFullscreen();
    } catch {
      setFallback(true);
    }
  }
  return { ref, active: native || fallback, toggle };
}
