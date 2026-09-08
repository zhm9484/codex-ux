import { useEffect, useState } from 'react';
export function useFullscreen() {
  const [active, setActive] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const changed = () => setActive(!!document.fullscreenElement);
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !(event.target instanceof Element && event.target.closest('dialog'))
      )
        setFocused(false);
    };
    document.addEventListener('fullscreenchange', changed);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  async function toggle() {
    if (focused) {
      setFocused(false);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setFocused(true);
    }
  }
  return { active: active || focused, focused, toggle };
}
