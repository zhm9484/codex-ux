import { Composer, ComposerContext } from '@codex-ux/editor-ui';
import { useRef, useState } from 'react';
import { ArrowUp, Check } from 'lucide-react';
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
  const [busyAction, setBusyAction] = useState<'send' | 'save' | null>(null);
  const busy = busyAction !== null;
  const [attempted, setAttempted] = useState(false);
  const [draftError, setDraftError] = useState('');

  const noteMode = state.feedbackMode === 'note';
  const disabled =
    !text.trim() || state.saving || busy || attaching || state.sending || !state.displayedRevision;
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
    setBusyAction(send ? 'send' : 'save');
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
        if (await state.sendNotes([note.id], destination)) {
          reset();
          state.setModal('notes-history');
        }
      } else {
        await state.refresh();
        state.setNotesOpen(true);
        reset();
      }
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'Could not save your draft.');
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  }
  function sendNow() {
    if (disabled) return;
    if (!state.session) {
      state.setConnectionAction(() => async () => {
        await persist(true);
      });
      state.setModal('agent');
    } else void persist(true);
  }
  return (
    <Composer
      onClose={() => state.setChatOpen(false)}
      closeLabel={noteMode ? 'Close note' : 'Close chat'}
      submitLabel={noteMode ? 'save note' : 'send'}
      context={
        <ComposerContext
          title={`${formatTime(anchor.start, true)}${anchor.end > anchor.start ? ` — ${formatTime(anchor.end, true)}` : ''}`}
          subtitle={`${noteMode ? 'Note' : 'Chat'} · ${anchor.objectId ? 'Text selection' : anchor.region ? 'Marked area' : anchor.end > anchor.start ? 'Selected range' : 'This moment'}`}
          image={
            anchor.revisionId
              ? `/media/video-editor/thumbnails/${state.project!.workspaceId}/${anchor.revisionId}?time=${anchor.start}`
              : undefined
          }
        >
          <button
            type="button"
            className="text-button"
            onClick={() => state.locate(anchor)}
            aria-label="Locate referenced frame"
          >
            Show this moment
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || attempted || !state.displayedRevision}
            onClick={() => {
              state.control.current?.pause();
              setReference({ anchor: state.anchor, focus: state.feedbackFocus });
            }}
          >
            Use current view
          </button>
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
              Duration
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
        </ComposerContext>
      }
      library={state.library}
      value={text}
      attachments={attachments}
      label={noteMode ? 'Note text' : 'Chat message'}
      placeholder={noteMode ? 'Leave a thought on this moment…' : 'What would you like to change?'}
      secondaryAction={
        noteMode ? (
          <button type="button" className="secondary-button" onClick={sendNow} disabled={disabled}>
            {busyAction === 'send' ? 'Sending…' : 'Send now'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void persist(false)}
            className="secondary-button"
            aria-label="Add note to list"
            disabled={disabled}
          >
            {busyAction === 'save' ? 'Saving…' : 'Add to notes'}
          </button>
        )
      }
      primaryAction={
        noteMode ? (
          <button
            type="button"
            className="primary-button"
            aria-label="Save note"
            onClick={() => void persist(false)}
            disabled={disabled}
          >
            <Check size={14} />
            {busyAction === 'save' ? 'Saving…' : 'Save note'}
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={sendNow} disabled={disabled}>
            {busyAction === 'send' ? 'Sending…' : 'Send now'}
            <ArrowUp size={14} />
          </button>
        )
      }
      active={state.chatOpen && !state.modal}
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
      onSubmit={() => {
        if (!disabled) {
          if (noteMode) void persist(false);
          else sendNow();
        }
      }}
      error={draftError || state.deliveryError}
    />
  );
}
