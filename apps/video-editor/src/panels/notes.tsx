import { useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  History,
  Pencil,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { formatTime, type Note } from '@codex-ux/video-domain';
import type { EditorState } from '../hooks/use-editor';
import { useIslandPosition } from '../hooks/use-island-position';
import { EmptyState, IconButton } from '../components/ui';

export function NoteCard({
  note,
  state,
  index,
  history = false,
}: {
  note: Note;
  state: EditorState;
  index: number;
  history?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [original, setOriginal] = useState(note.text);
  return (
    <article className="note-card">
      <div className="note-heading">
        <span className="note-number">{String(index + 1).padStart(2, '0')}</span>
        <button
          className="note-time"
          onClick={() => {
            state.locate(note.anchor);
            if (history) state.setModal(null);
          }}
          aria-label={`Locate note ${index + 1}`}
        >
          {formatTime(note.anchor.start, true)}
          {note.anchor.end > note.anchor.start ? ` – ${formatTime(note.anchor.end, true)}` : ''}
        </button>
        {!history && (
          <>
            <IconButton
              label={`Edit note ${index + 1}`}
              disabled={state.sending || state.saving}
              onClick={() => {
                setText(note.text);
                setOriginal(note.text);
                setEditing(true);
              }}
            >
              <Pencil size={13} />
            </IconButton>
            <IconButton
              label={`Delete note ${index + 1}`}
              disabled={state.sending || state.saving}
              onClick={() => void state.removeNote(note.id)}
            >
              <Trash2 size={13} />
            </IconButton>
          </>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void state.editNote(note.id, text, original).then((saved) => {
              if (saved) setEditing(false);
            });
          }}
        >
          <textarea
            aria-label={`Edit note ${index + 1} text`}
            value={text}
            maxLength={4000}
            onChange={(event) => setText(event.target.value)}
            autoFocus
          />
          <div className="note-edit-actions">
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="secondary-button"
              disabled={!text.trim() || state.saving || state.sending}
            >
              Save changes
            </button>
          </div>
        </form>
      ) : (
        <p>{note.text}</p>
      )}
      <div className="note-context">
        {note.intent.kind === 'transition'
          ? `Transition${note.intent.duration ? ` · ${note.intent.duration}s` : ''}`
          : note.anchor.objectId
            ? 'Text selection'
            : note.anchor.region
              ? 'Marked area'
              : 'Change'}
        {note.anchor.revisionId !== state.project!.revisionId && ' · Earlier version'}
      </div>
    </article>
  );
}

export function NotesBoard({ state }: { state: EditorState }) {
  const notes = state.project!.notes.filter((note) => !note.requestId);
  if (!notes.length && !state.notesOpen) return null;
  return <Board state={state} notes={notes} />;
}
function Board({ state, notes }: { state: EditorState; notes: Note[] }) {
  const { ref, handlers } = useIslandPosition('video-editor:notes-position', true);
  const [collapsed, setCollapsed] = useState(false);
  async function send() {
    if (!state.session) {
      state.setConnectionAction(() => async () => {
        if (await state.sendNotes(notes.map((note) => note.id))) state.setNotesOpen(false);
      });
      state.setModal('agent');
      return;
    }
    if (await state.sendNotes(notes.map((note) => note.id))) state.setNotesOpen(false);
  }
  return (
    <div
      ref={ref}
      className={`notes-board ${collapsed ? 'collapsed' : ''}`}
      role="region"
      aria-label="Pending notes"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="board-heading">
        <button
          className="board-grip"
          aria-label="Move notes"
          title="Drag to move · arrow keys to nudge"
          {...handlers}
        >
          <GripHorizontal size={16} />
        </button>
        <h2>
          Notes <span>{notes.length}</span>
        </h2>
        <IconButton
          label={collapsed ? 'Expand notes' : 'Collapse notes'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </IconButton>
      </header>
      {!collapsed && (
        <>
          <div className="board-content">
            {notes.length ? (
              notes.map((note, index) => (
                <NoteCard key={note.id} note={note} state={state} index={index} />
              ))
            ) : (
              <EmptyState icon={<StickyNote size={22} />} title="Room for your next idea">
                Add a note from the canvas or Chat.
              </EmptyState>
            )}
          </div>
          {state.deliveryError && (
            <p className="inline-error board-error" role="alert">
              {state.deliveryError}
            </p>
          )}
          <footer className="board-footer">
            <button className="text-button" onClick={() => state.setModal('notes-history')}>
              <History size={14} />
              History
            </button>
            <button
              className="primary-button"
              disabled={!notes.length || state.sending || state.saving}
              onClick={() => void send()}
            >
              <ArrowUp size={14} />
              {state.sending ? 'Sending…' : 'Send all'}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
