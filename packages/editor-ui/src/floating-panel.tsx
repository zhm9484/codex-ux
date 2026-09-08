import { useLayoutEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFloatingPosition, type FloatingAnchor } from './use-floating-position';
import { IconButton } from './ui';

/** Nonmodal panels retain their children so hiding a composer preserves its draft. */
export function FloatingPanel({
  open,
  anchor,
  title,
  onClose,
  children,
  className = '',
  closeLabel = 'Close panel',
  heading = true,
  movable = false,
}: {
  open: boolean;
  anchor: FloatingAnchor | null;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  heading?: boolean;
  movable?: boolean;
}) {
  const ref = useFloatingPosition(open, anchor, movable);
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const panel = ref.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, ref]);
  return (
    <section
      ref={ref}
      hidden={!open}
      className={`ui-floating-panel ${className}`}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if ((event.target as Element).closest('dialog')) return;
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {heading && (
        <div className="chat-heading">
          <h2>{title}</h2>
          <IconButton label={closeLabel} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
      )}
      {children}
    </section>
  );
}
