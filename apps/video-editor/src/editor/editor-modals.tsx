import { useEffect, useState } from 'react';
import { File, Folder, ArrowLeft } from 'lucide-react';
import { formatTime } from '@codex-ux/video-domain';
import type { EditorState } from '../hooks/use-editor';
import { Modal } from '../components/modal';
import { SourcePanel } from '../panels/source';
import { AssetsPanel } from '../panels/assets';
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
        <Agent state={state} onClose={close} />
      </Modal>
    );
  if (state.modal === 'files')
    return (
      <Modal title="Workspace files" onClose={close}>
        <Files state={state} />
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
function Agent({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const [thread, setThread] = useState(state.session?.sessionId ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="agent-settings">
      <div className="connection-status">
        <span className={`connection-dot ${state.session ? 'connected' : ''}`} />
        <strong>{state.session ? 'Codex session saved' : 'Connect your agent'}</strong>
      </div>
      <p className="muted-copy">
        Connect this page to the Codex task you want to collaborate with.
      </p>
      {state.session && <code className="session-id">{state.session.sessionId}</code>}
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void state.pair().finally(() => setBusy(false));
        }}
      >
        Connect current agent
      </button>
      {state.pairing && (
        <div className="pairing-card">
          {state.pairing.state === 'connected' ? (
            <p role="status">This page confirmed the connection.</p>
          ) : (
            <>
              <label className="field">
                Give this connection code to your agent
                <input
                  readOnly
                  value={state.pairing.code}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <p className="field-help">
                Valid for 10 minutes. Connects only this page and workspace.
              </p>
            </>
          )}
        </div>
      )}
      <details className="manual-connection">
        <summary>Use a task ID or link</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void state.bind(thread.trim().replace(/^codex:\/\/threads\//, '') || null);
          }}
        >
          <label className="field">
            Session ID or task link
            <input
              placeholder="codex://threads/…"
              value={thread}
              onChange={(event) => setThread(event.target.value)}
            />
          </label>
          <button className="secondary-button">Save connection</button>
        </form>
      </details>
      {state.bindingError && (
        <p role="alert" className="inline-error">
          {state.bindingError}
        </p>
      )}
      {state.connectionAction ? (
        <div className="connection-next">
          <p>Your draft is ready. Continue when the right task is connected.</p>
          <button
            className="primary-button"
            disabled={!state.session || state.sending || busy}
            onClick={() => {
              const action = state.connectionAction!;
              onClose();
              void action();
            }}
          >
            Continue sending
          </button>
        </div>
      ) : (
        <p className="field-help">Notes are sent only when you choose Send now or Send all.</p>
      )}
      {state.session && (
        <button className="text-button" onClick={() => void state.bind(null)}>
          Disconnect session
        </button>
      )}
    </div>
  );
}
type Directory = { path: string; entries: { name: string; kind: string }[] };
function Files({ state }: { state: EditorState }) {
  const [tab, setTab] = useState<'browse' | 'import'>('browse');
  const [path, setPath] = useState('');
  const [listing, setListing] = useState<Directory | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<Directory>(
      `/workspaces/${state.project!.workspaceId}/files?path=${encodeURIComponent(path)}`,
    )
      .then((value) => {
        if (active) {
          setListing(value);
          setError('');
        }
      })
      .catch((error: unknown) => {
        if (active) setError(error instanceof Error ? error.message : 'Could not read directory.');
      });
    return () => {
      active = false;
    };
  }, [path, state.project, tab]);
  return (
    <>
      <div className="modal-tabs" role="tablist" aria-label="Workspace files">
        <button role="tab" aria-selected={tab === 'browse'} onClick={() => setTab('browse')}>
          Files
        </button>
        <button role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>
          Import
        </button>
      </div>
      {tab === 'browse' ? (
        <div className="file-browser">
          <div className="file-breadcrumb">
            <button
              className="text-button"
              disabled={!path}
              onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <code>files/{path}</code>
          </div>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {!listing ? (
            <p className="muted-copy">Loading files…</p>
          ) : listing.entries.length ? (
            listing.entries.map((entry) => (
              <button
                key={entry.name}
                className="file-row"
                disabled={entry.kind !== 'directory'}
                onClick={() => setPath([path, entry.name].filter(Boolean).join('/'))}
              >
                {entry.kind === 'directory' ? <Folder size={17} /> : <File size={17} />}
                <span>{entry.name}</span>
                <small>{entry.kind}</small>
              </button>
            ))
          ) : (
            <p className="muted-copy">This directory is empty.</p>
          )}
        </div>
      ) : (
        <div className="workspace-import">
          <SourcePanel state={state} onClose={() => setTab('browse')} />
          <AssetsPanel
            workspaceId={state.project!.workspaceId}
            document={state.project!.revision.document}
            disabled={state.saving}
            onClose={() => setTab('browse')}
            onUpload={state.upload}
          />
        </div>
      )}
    </>
  );
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
