import { ToolIsland as SharedToolIsland } from '@codex-ux/editor-ui';
import type { EditorState } from '../hooks/use-editor';
export function ToolIsland({
  state,
  fullscreen,
  onFullscreen,
}: {
  state: EditorState;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  return (
    <SharedToolIsland
      storageKey="video-editor:tool-position"
      chatOpen={state.chatOpen}
      notesOpen={state.notesOpen}
      hasNotes={!!state.project?.notes.some((note) => !note.requestId)}
      fullscreen={fullscreen}
      onFullscreen={onFullscreen}
      onChat={(event) =>
        state.chatOpen ? state.setChatOpen(false) : state.openNotes(event, false)
      }
      onNotes={() => state.setNotesOpen(!state.notesOpen)}
    />
  );
}
