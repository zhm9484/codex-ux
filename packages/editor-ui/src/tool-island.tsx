import { GripHorizontal, Maximize, MessageCircle, Minimize, StickyNote } from 'lucide-react';
import type { MouseEvent } from 'react';
import { IconButton } from './ui';
import { useIslandPosition } from './use-island-position';

export function ToolIsland({
  storageKey,
  chatOpen,
  notesOpen,
  hasNotes,
  onChat,
  onNotes,
  fullscreen,
  onFullscreen,
}: {
  storageKey: string;
  chatOpen: boolean;
  notesOpen: boolean;
  hasNotes: boolean;
  onChat: (event: MouseEvent<HTMLButtonElement>) => void;
  onNotes: (event: MouseEvent<HTMLButtonElement>) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const { ref, handlers } = useIslandPosition(storageKey);
  return (
    <div
      ref={ref}
      className="tool-island"
      role="toolbar"
      aria-label="Collaboration tools"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="island-grip"
        aria-label="Move collaboration tools"
        title="Drag to move · arrow keys to nudge"
        {...handlers}
      >
        <GripHorizontal size={13} />
      </button>
      <IconButton
        label="Chat"
        className={chatOpen ? 'active' : ''}
        aria-expanded={chatOpen}
        onClick={onChat}
      >
        <MessageCircle size={18} />
      </IconButton>
      <IconButton
        label="Notes"
        data-panel-trigger
        className={notesOpen ? 'active' : ''}
        aria-expanded={notesOpen}
        onClick={onNotes}
      >
        <StickyNote size={18} />
        {hasNotes && <span className="island-dot" />}
      </IconButton>
      <span className="island-divider" />
      <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onFullscreen}>
        {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
      </IconButton>
    </div>
  );
}
