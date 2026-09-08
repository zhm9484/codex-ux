import { LibraryBrowser } from '@codex-ux/library-react';
import { useEffect, useState } from 'react';
import { formatTime } from '@codex-ux/video-domain';
import type { EditorState } from '../hooks/use-editor';
import { Modal, AgentConnection } from '@codex-ux/editor-ui';
import { NoteCard } from '../panels/notes';
import { api, videoPath } from '../lib/api';

export function EditorModals({ state }: { state: EditorState }) {
  const close = () => {
    state.setModal(null);
    state.setConnectionAction(null);
  };
  if (state.modal === 'agent')
    return (
      <Modal title="Agent connection" onClose={close}>
        <AgentConnection
          session={state.session}
          pairing={state.pairing}
          onPair={state.pair}
          onBind={state.bind}
          error={state.bindingError}
          pendingSend={!!state.connectionAction}
          sending={state.sending}
          onContinue={() => {
            const action = state.connectionAction;
            close();
            void action?.();
          }}
        />
      </Modal>
    );
  if (state.modal === 'library')
    return (
      <Modal title="Library" onClose={close}>
        <LibraryBrowser library={state.library} />
      </Modal>
    );
  if (state.modal === 'notes-history')
    return (
      <Modal title="Notes history" onClose={close}>
        <NotesHistory state={state} />
      </Modal>
    );
  return null;
}
function NotesHistory({ state }: { state: EditorState }) {
  const notes = state.project!.notes.filter((note) => note.requestId).toReversed();
  const [statuses, setStatuses] = useState<Record<string, { state: string; error?: string }>>({});
  const ids = [...new Set(notes.map((note) => note.requestId!))].join(',');
  useEffect(() => {
    let active = true;
    async function load() {
      const entries = await Promise.all(
        ids
          .split(',')
          .filter(Boolean)
          .map(async (id) => {
            try {
              return [
                id,
                await api<{ state: string; error?: string }>(
                  `${videoPath(state.project!.workspaceId)}/requests/${id}`,
                ),
              ] as const;
            } catch {
              return [id, { state: 'Status unavailable' }] as const;
            }
          }),
      );
      if (active)
        setStatuses(
          Object.fromEntries(entries) as Record<string, { state: string; error?: string }>,
        );
    }
    void load();
    const timer = setInterval(() => void load(), 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ids, state.project]);
  return notes.length ? (
    <div className="notes-history-list">
      {notes.map((note, index) => (
        <section key={note.id}>
          <NoteCard note={note} state={state} index={index} history />
          <p className="history-status">
            {statuses[note.requestId!]?.state ?? 'Loading status…'} ·{' '}
            {formatTime(note.anchor.start, true)}
          </p>
          {statuses[note.requestId!]?.error && (
            <p className="inline-error">{statuses[note.requestId!]?.error}</p>
          )}
        </section>
      ))}
    </div>
  ) : (
    <div className="modal-empty">
      <h3>No sent notes yet</h3>
      <p>Notes you send will appear here with their delivery status and original context.</p>
    </div>
  );
}
