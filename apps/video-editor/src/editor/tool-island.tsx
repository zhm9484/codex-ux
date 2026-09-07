import {
  MessageCircle,
  StickyNote,
  Maximize,
  Minimize,
  GripHorizontal,
  FolderOpen,
  Image,
} from 'lucide-react';
import type { EditorState } from '../hooks/use-editor';
import { useIslandPosition } from '../hooks/use-island-position';
import { IconButton } from '../components/ui';
import type { Panel } from './types';
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
  function panel(name: Panel, event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const left = rect.right + 12 < window.innerWidth - 350 ? rect.right + 12 : rect.left - 350;
    state.setPanelAnchor({ left, top: rect.top - 10, bottom: rect.top - 10 });
    state.setChatOpen(false);
    state.setPanel(state.panel === name ? null : name);
  }
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
        className={state.panel === 'notes' ? 'active' : ''}
        label="Notes"
        onClick={(event) => panel('notes', event)}
      >
        <StickyNote size={18} />
        {state.project?.notes.some((note) => !note.requestId) && <span className="island-dot" />}
      </IconButton>
      <span className="island-divider" />
      <IconButton
        data-panel-trigger
        label="Video source"
        onClick={(event) => panel('source', event)}
      >
        <FolderOpen size={17} />
      </IconButton>
      <IconButton data-panel-trigger label="Assets" onClick={(event) => panel('assets', event)}>
        <Image size={17} />
      </IconButton>
      <span className="island-divider" />
      <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onFullscreen}>
        {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
      </IconButton>
    </div>
  );
}
