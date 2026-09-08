import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageSquare, Plus } from 'lucide-react';
import type { FeedbackAnchor } from '@codex-ux/protocol';
import { formatTime, type VideoIntent } from '@codex-ux/video-domain';
import type { EditorState } from '../hooks/use-editor';
import { api, post, videoPath } from '../lib/api';
import type { VideoProject } from '@codex-ux/video-domain';

export function FeedbackComposer({ state }: { state: EditorState }) {
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<VideoIntent>({ kind: 'change' });
  const [reference, setReference] = useState<{ anchor: FeedbackAnchor; focus: number } | null>(
    null,
  );
  const anchor = reference?.anchor ?? state.anchor;
  const draftId = useRef<string | null>(null);
  const draftPayload = useRef<{ text: string; anchor: FeedbackAnchor; intent: VideoIntent } | null>(
    null,
  );
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const count = state.project?.notes.filter((note) => !note.requestId).length ?? 0;
  const anchored = !!(state.selectedId || state.region || state.range || text);
  useEffect(() => {
    if (state.chatOpen) input.current?.focus();
  }, [state.chatOpen, state.feedbackFocus]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);
  function reset() {
    setText('');
    setIntent({ kind: 'change' });
    setReference(null);
    draftId.current = null;
    draftPayload.current = null;
    setAttempted(false);
    state.clearSelection();
  }
  async function persist(send: boolean) {
    if (!text.trim() || !state.displayedRevision || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setAttempted(true);
    setDraftError('');
    draftId.current ??= crypto.randomUUID();
    draftPayload.current ??= { text, anchor, intent };
    try {
      const destination = send ? state.target() : undefined;
      const project = await post<VideoProject>(`${videoPath(state.project!.workspaceId)}/notes`, {
        id: draftId.current,
        ...draftPayload.current,
      });
      const note = project.notes.find((note) => note.id === draftId.current)!;
      if (note.requestId) {
        setDraftError(
          'This draft already has a submission. Check Notes history for its delivery status.',
        );
        await state.refresh();
        return;
      }
      if (text.trim() !== note.text) {
        await api(`${videoPath(state.project!.workspaceId)}/notes/${note.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ text, previousText: draftPayload.current.text.trim() }),
        });
        draftPayload.current.text = text;
      }
      if (send) {
        if (await state.sendNotes([note.id], destination)) reset();
      } else {
        await state.refresh();
        state.setNotesOpen(true);
        setSaved(true);
        reset();
      }
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'Could not save your draft.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function sendNow() {
    if (!state.session) {
      state.setConnectionAction(() => async () => {
        await persist(true);
      });
      state.setModal('agent');
    } else void persist(true);
  }
  return (
    <div className="feedback-dock">
      <form
        className={`feedback-composer ${anchored ? 'has-anchor' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          void persist(false);
        }}
      >
        {anchored && (
          <div className="composer-reference" onClick={() => state.locate(anchor)}>
            <span className="reference-icon">
              <img
                alt="Referenced frame"
                src={`/media/video-editor/thumbnails/${state.project!.workspaceId}/${anchor.revisionId}?time=${anchor.start}`}
              />
            </span>
            <span>
              {formatTime(anchor.start, true)}
              {anchor.end > anchor.start ? ` — ${formatTime(anchor.end, true)}` : ''}
            </span>
            <span className="reference-detail">
              {anchor.objectId
                ? 'Text selection'
                : anchor.region
                  ? 'Marked area'
                  : anchor.end > anchor.start
                    ? 'Selected range'
                    : 'This moment'}
            </span>
          </div>
        )}
        <label className="composer-intent">
          Request
          <select
            aria-label="Request kind"
            disabled={busy || attempted}
            value={intent.kind}
            onChange={(event) =>
              setIntent(
                event.target.value === 'transition' ? { kind: 'transition' } : { kind: 'change' },
              )
            }
          >
            <option value="change">Change</option>
            <option value="transition">Transition</option>
          </select>
        </label>
        {intent.kind === 'transition' && (
          <label className="composer-intent">
            Duration (seconds, optional)
            <input
              aria-label="Transition duration"
              disabled={busy || attempted}
              type="number"
              min="0.01"
              max="60"
              step="0.01"
              value={intent.duration ?? ''}
              onChange={(event) =>
                setIntent(
                  event.target.value
                    ? { kind: 'transition', duration: Number(event.target.value) }
                    : { kind: 'transition' },
                )
              }
            />
          </label>
        )}
        <textarea
          ref={input}
          aria-label="Feedback note"
          placeholder="Describe a change, or point to something…"
          value={text}
          disabled={busy}
          rows={1}
          maxLength={4000}
          onFocus={() => {
            state.control.current?.pause();
            if (!reference || (!text && reference.focus !== state.feedbackFocus))
              setReference({ anchor: state.anchor, focus: state.feedbackFocus });
          }}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void persist(false);
            }
          }}
        />
        <div className="composer-actions">
          <button
            type="button"
            className="notes-trigger"
            aria-label="Notes"
            onClick={() => state.setNotesOpen(!state.notesOpen)}
          >
            <MessageSquare size={15} />
            <span>{saved ? 'Note saved' : count ? `${count} to send` : 'Notes'}</span>
            {count > 0 && <span className="unread-dot" />}
          </button>
          <button
            type="submit"
            className="secondary-button"
            aria-label="Add note to list"
            disabled={
              !text.trim() || state.saving || busy || state.sending || !state.displayedRevision
            }
          >
            <Plus size={15} />
            Add
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={sendNow}
            disabled={
              !text.trim() || state.saving || busy || state.sending || !state.displayedRevision
            }
          >
            <ArrowUp size={15} />
            {busy ? 'Sending…' : 'Send now'}
          </button>
        </div>
        {(draftError || state.deliveryError) && (
          <p role="alert" className="inline-error">
            {draftError || state.deliveryError}
          </p>
        )}
      </form>
      <span className="composer-hint">
        {state.marking
          ? 'Draw on the frame to mark a detail.'
          : 'Send this draft now, or add it to your notes for later.'}
      </span>
    </div>
  );
}
