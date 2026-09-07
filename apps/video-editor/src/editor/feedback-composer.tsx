import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageSquare } from 'lucide-react';
import type { FeedbackAnchor } from '@codex-ux/protocol';
import { formatTime, type VideoIntent } from '@codex-ux/video-domain';
import type { EditorState } from '../hooks/use-editor';
import { IconButton } from '../components/ui';

export function FeedbackComposer({ state }: { state: EditorState }) {
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<VideoIntent>({ kind: 'change' });
  const [reference, setReference] = useState<{ anchor: FeedbackAnchor; focus: number } | null>(
    null,
  );
  const anchor = reference?.anchor ?? state.anchor;
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
  async function save() {
    if (!text.trim() || !state.displayedRevision) return;
    if (await state.addNote(text, anchor, intent)) {
      setText('');
      setIntent({ kind: 'change' });
      setReference(null);
      setSaved(true);
      state.clearSelection();
    }
  }
  return (
    <div className="feedback-dock">
      <form
        className={`feedback-composer ${anchored ? 'has-anchor' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
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
          rows={1}
          maxLength={4000}
          onFocus={() => {
            state.control.current?.pause();
            if (!reference || (!text && reference.focus !== state.feedbackFocus))
              setReference({ anchor: state.anchor, focus: state.feedbackFocus });
          }}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void save();
            }
          }}
        />
        <div className="composer-actions">
          <button
            type="button"
            className="notes-trigger"
            aria-label="Notes"
            onClick={() => state.setPanel(state.panel === 'notes' ? null : 'notes')}
          >
            <MessageSquare size={15} />
            <span>{saved ? 'Note saved' : count ? `${count} to send` : 'Notes'}</span>
            {count > 0 && <span className="unread-dot" />}
          </button>
          <IconButton
            type="submit"
            label="Save note"
            className="save-note-button"
            disabled={!text.trim() || state.saving || !state.displayedRevision}
          >
            <ArrowUp size={18} />
          </IconButton>
        </div>
      </form>
      <span className="composer-hint">
        {state.marking
          ? 'Draw on the frame to mark a detail.'
          : 'Your notes stay here until you send them to Codex.'}
      </span>
    </div>
  );
}
