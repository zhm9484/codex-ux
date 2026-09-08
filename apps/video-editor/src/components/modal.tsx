import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui';

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="editor-modal"
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header className="modal-heading">
        <h2>{title}</h2>
        <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
