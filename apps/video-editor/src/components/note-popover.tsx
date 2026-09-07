import { createPortal } from 'react-dom';
import { useMemo } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useFloatingPosition } from '../hooks/use-floating-position';
export interface PointerPosition {
  x: number;
  y: number;
}
export function NotePopover({
  point,
  onNote,
  children,
  menu = false,
}: {
  point: PointerPosition;
  onNote: (event: React.MouseEvent<HTMLElement>) => void;
  children?: React.ReactNode;
  menu?: boolean;
}) {
  const anchor = useMemo(
    () => ({ left: point.x + 12, top: point.y - 26, bottom: point.y - 26 }),
    [point.x, point.y],
  );
  const popup = useFloatingPosition(true, anchor);
  return createPortal(
    <section ref={popup} className="note-popover canvas-menu" role={menu ? 'menu' : undefined}>
      <button className="note-action" role={menu ? 'menuitem' : undefined} onClick={onNote}>
        <MessageSquarePlus size={15} />
        <span>Add note</span>
      </button>
      {children}
    </section>,
    document.body,
  );
}
