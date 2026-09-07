import { NotePopover } from '../components/note-popover';
import { Type, Trash2 } from 'lucide-react';
import type { EditorState } from '../hooks/use-editor';

export function CanvasMenu({ state }: { state: EditorState }) {
  const position = state.contextMenu;
  if (!position) return null;
  return (
    <NotePopover point={position} onNote={state.openNotes} menu>
      {state.canvasText && (
        <button
          className="note-action"
          role="menuitem"
          onClick={() => {
            state.control.current?.editText(state.canvasText!.clip.id);
            state.setContextMenu(null);
          }}
        >
          <Type size={15} />
          Edit text
        </button>
      )}
      {state.selectedId && (
        <button className="note-action" role="menuitem" onClick={() => void state.removeSelected()}>
          <Trash2 size={15} />
          Delete
        </button>
      )}
    </NotePopover>
  );
}
