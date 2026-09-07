import { useState } from 'react';
import { ArrowUp, Check, Link2, MessageSquare, Trash2 } from 'lucide-react';
import { formatTime, type Workspace } from '@codex-ux/video-domain';
import type { FeedbackAnchor } from '@codex-ux/protocol';
import { EmptyState, IconButton, PanelHeader } from '../components/ui';
import { post } from '../lib/api';

interface Props {
  workspace: Workspace;
  disabled: boolean;
  onClose: () => void;
  onRemove: (id: string) => Promise<unknown>;
  onBind: (id: string | null) => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
  onLocate: (anchor: FeedbackAnchor) => void;
}
export function NotesPanel(p: Props) {
  const [binding, setBinding] = useState(false);
  const [thread, setThread] = useState(p.workspace.threadId ?? '');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const notes = p.workspace.notes;
  const unsent = notes.filter((n) => !n.requestId && !excluded.includes(n.id));
  const send = async () => {
    setSending(true);
    setError('');
    setMessage('');
    try {
      await post(`/workspaces/${p.workspace.id}/requests`, { noteIds: unsent.map((n) => n.id) });
      await p.onRefresh();
      setMessage('Sent to your Codex task. Keep exploring here.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send notes.');
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <PanelHeader
        title="Notes"
        detail="Review your notes, then send them together."
        onClose={p.onClose}
      />
      <div className="notes-content">
        <div className="connection-row">
          <span className={`connection-dot ${p.workspace.threadId ? 'connected' : ''}`} />
          <span>{p.workspace.threadId ? 'Codex task connected' : 'Connect your Codex task'}</span>
          <IconButton label="Configure Codex connection" onClick={() => setBinding(!binding)}>
            <Link2 size={14} />
          </IconButton>
        </div>
        {binding && (
          <form
            className="connection-form"
            onSubmit={(e) => {
              e.preventDefault();
              const id = thread.trim().replace(/^codex:\/\/threads\//, '');
              void p.onBind(id || null).then((saved) => {
                if (saved) setBinding(false);
              });
            }}
          >
            <label className="field">
              Task ID or task link
              <input
                placeholder="codex://threads/…"
                value={thread}
                onChange={(e) => setThread(e.target.value)}
              />
            </label>
            <p className="field-help">
              Copy the task link from Codex. Notes are sent to that existing task.
            </p>
            <button className="secondary-button" disabled={p.disabled}>
              Save connection
            </button>
          </form>
        )}
        {!notes.length ? (
          <EmptyState icon={<MessageSquare size={23} />} title="Nothing here yet">
            Use the input below the video to leave a note. Select a moment or mark a detail to
            attach context.
          </EmptyState>
        ) : (
          <div className="note-list">
            {notes.map((note, i) => (
              <article key={note.id} className={`note-card ${note.requestId ? 'sent-note' : ''}`}>
                <div className="note-heading">
                  <label className="note-number">
                    {!note.requestId && (
                      <input
                        type="checkbox"
                        aria-label={`Include note ${i + 1}`}
                        checked={!excluded.includes(note.id)}
                        onChange={(e) =>
                          setExcluded(
                            e.target.checked
                              ? excluded.filter((id) => id !== note.id)
                              : [...excluded, note.id],
                          )
                        }
                      />
                    )}
                    <span>{String(i + 1).padStart(2, '0')}</span>
                  </label>
                  <button className="note-time" onClick={() => p.onLocate(note.anchor)}>
                    {formatTime(note.anchor.start, true)}
                  </button>
                  {note.requestId ? (
                    <Check size={13} />
                  ) : (
                    <IconButton
                      label={`Delete note ${i + 1}`}
                      onClick={() => void p.onRemove(note.id)}
                      disabled={p.disabled}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                </div>
                <p>{note.text}</p>
                {note.anchor.revisionId !== p.workspace.revisionId && (
                  <span className="older-version">Attached to an earlier version</span>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="panel-bottom">
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="inline-success" role="status">
            {message}
          </p>
        )}
        <button
          className="primary-button full-width"
          disabled={!unsent.length || !p.workspace.threadId || sending || p.disabled}
          onClick={() => void send()}
        >
          <ArrowUp size={15} />
          {sending
            ? 'Sending…'
            : `Send ${unsent.length || ''} ${unsent.length === 1 ? 'note' : 'notes'} to Codex`}
        </button>
        <p className="panel-footnote">You choose when the conversation moves forward.</p>
      </div>
    </>
  );
}
