import { MessageCircle, StickyNote, Maximize, Minimize, GripHorizontal } from 'lucide-react';
import type { EditorState } from '../hooks/use-editor';
import { useIslandPosition } from '../hooks/use-island-position';
import { IconButton } from '../components/ui';
export function ToolIsland({
  state,
  fullscreen,
  onFullscreen,
}: {
  state: EditorState;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const { ref: islandRef, handlers } = useIslandPosition();
  return (
    <div
      ref={islandRef}
      className="tool-island"
      role="toolbar"
      aria-label="Video tools"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="island-grip"
        aria-label="Move video tools"
        title="Drag to move · arrow keys to nudge"
        {...handlers}
      >
        <GripHorizontal size={13} />
      </button>
      <IconButton
        className={state.chatOpen ? 'active' : ''}
        label="Chat"
        aria-expanded={state.chatOpen}
        onClick={(event) =>
          state.chatOpen ? state.setChatOpen(false) : state.openNotes(event, false)
        }
      >
        <MessageCircle size={18} />
      </IconButton>
      <IconButton
        data-panel-trigger
        className={state.notesOpen ? 'active' : ''}
        label="Notes"
        onClick={() => state.setNotesOpen(!state.notesOpen)}
      >
        <StickyNote size={18} />
        {state.project?.notes.some((note) => !note.requestId) && <span className="island-dot" />}
      </IconButton>
      <span className="island-divider" />
      <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onFullscreen}>
        {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
      </IconButton>
    </div>
  );
}
