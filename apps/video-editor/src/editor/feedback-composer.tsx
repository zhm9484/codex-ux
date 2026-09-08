import { MentionInput } from '@codex-ux/library-react';
import { useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import type { FeedbackAnchor, LibraryReference } from '@codex-ux/protocol';
import { formatTime, type VideoIntent } from '@codex-ux/video-domain';
import type { EditorState } from '../hooks/use-editor';
import { api, post, videoPath } from '../lib/api';
import type { VideoProject } from '@codex-ux/video-domain';

export function FeedbackComposer({ state }: { state: EditorState }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<LibraryReference[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [intent, setIntent] = useState<VideoIntent>({ kind: 'change' });
  const [reference, setReference] = useState<{ anchor: FeedbackAnchor; focus: number } | null>(
    null,
  );
  const anchor = reference?.anchor ?? state.anchor;
  const draftId = useRef<string | null>(null);
  const draftPayload = useRef<{
    text: string;
    anchor: FeedbackAnchor;
    intent: VideoIntent;
    attachmentIds: string[];
  } | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [draftError, setDraftError] = useState('');

  const anchored = !!(reference || state.selectedId || state.region || state.range || text);
  function reset() {
    setText('');
    setAttachments([]);
    setIntent({ kind: 'change' });
    setReference(null);
    draftId.current = null;
    draftPayload.current = null;
    setAttempted(false);
    state.clearSelection();
  }
  async function persist(send: boolean) {
    if (!text.trim() || !state.displayedRevision || busyRef.current || attaching) return;
    busyRef.current = true;
    setBusy(true);
    setAttempted(true);
    setDraftError('');
    draftId.current ??= crypto.randomUUID();
    draftPayload.current ??= {
      text,
      anchor,
      intent,
      attachmentIds: attachments.map((ref) => ref.id),
    };
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
      if (
        text.trim() !== note.text ||
        JSON.stringify(attachments.map((ref) => ref.id)) !==
          JSON.stringify(draftPayload.current.attachmentIds)
      ) {
        await api(`${videoPath(state.project!.workspaceId)}/notes/${note.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            text,
            previousText: draftPayload.current.text.trim(),
            attachmentIds: attachments.map((ref) => ref.id),
            previousAttachmentIds: draftPayload.current.attachmentIds,
          }),
        });
        draftPayload.current.text = text;
        draftPayload.current.attachmentIds = attachments.map((ref) => ref.id);
      }
      if (send) {
        if (await state.sendNotes([note.id], destination)) reset();
      } else {
        await state.refresh();
        state.setNotesOpen(true);
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
    <form
      className="feedback-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void persist(false);
      }}
    >
      <div className="composer-context">
        {anchored && (
          <button
            type="button"
            className="composer-reference"
            onClick={() => state.locate(anchor)}
            aria-label="Locate referenced frame"
          >
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
          </button>
        )}
        <label className="composer-intent">
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
      </div>
      {intent.kind === 'transition' && (
        <label className="composer-intent">
          Transition duration
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
          <span>seconds · optional</span>
        </label>
      )}
      <MentionInput
        library={state.library}
        value={text}
        attachments={attachments}
        label="Chat message"
        placeholder="What would you like to change? Use @ to reference a file."
        actions={
          <div className="composer-actions">
            <button
              type="submit"
              className="secondary-button"
              aria-label="Add note to list"
              disabled={
                !text.trim() ||
                state.saving ||
                busy ||
                attaching ||
                state.sending ||
                !state.displayedRevision
              }
            >
              Add to notes
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={sendNow}
              disabled={
                !text.trim() ||
                state.saving ||
                busy ||
                attaching ||
                state.sending ||
                !state.displayedRevision
              }
            >
              <ArrowUp size={15} />
              {busy ? 'Working…' : 'Send now'}
            </button>
          </div>
        }
        active={state.chatOpen}
        focusKey={state.feedbackFocus}
        disabled={busy}
        onBusy={setAttaching}
        incomingFiles={state.droppedFiles}
        onConsumed={() => state.setDroppedFiles(null)}
        onChange={(value, refs) => {
          setText(value);
          setAttachments(refs);
        }}
        onFocus={() => {
          state.control.current?.pause();
          if (!reference || (!text && reference.focus !== state.feedbackFocus))
            setReference({ anchor: state.anchor, focus: state.feedbackFocus });
        }}
        onManage={() => state.setModal('library')}
        onSubmit={() => void persist(false)}
      />
      {(draftError || state.deliveryError) && (
        <p role="alert" className="inline-error">
          {draftError || state.deliveryError}
        </p>
      )}
    </form>
  );
}
