import { TextFields } from './text-fields';
import { useState } from 'react';
import { Type, SlidersHorizontal } from 'lucide-react';
import type { Clip, VideoDocument } from '@codex-ux/video-domain';
import { EmptyState, PanelHeader } from '../components/ui';

interface Props {
  clip: Clip | undefined;
  document: VideoDocument;
  disabled: boolean;
  onClose: () => void;
  onPreview: (clip: Clip) => void;
  onSave: (clip: Clip) => Promise<unknown>;
  onAddText: () => void;
}
export function Inspector(props: Props) {
  return (
    <>
      <PanelHeader title="Details" onClose={props.onClose} />
      {props.clip ? (
        <ClipFields key={JSON.stringify(props.clip)} {...props} clip={props.clip} />
      ) : (
        <>
          <EmptyState icon={<SlidersHorizontal size={24} />} title="Find your focus">
            Select a clip on the timeline, or a title on the canvas.
          </EmptyState>
          <button
            className="secondary-button full-width"
            disabled={props.disabled}
            onClick={props.onAddText}
          >
            <Type size={15} />
            Add a text layer
          </button>
        </>
      )}
    </>
  );
}
function ClipFields({ clip, document, disabled, onPreview, onSave }: Props & { clip: Clip }) {
  const [draft, setDraft] = useState(clip);
  const update = (change: Partial<Clip>) => {
    const next = { ...draft, ...change };
    setDraft(next);
    onPreview(next);
  };
  const save = () => {
    if (JSON.stringify(draft) !== JSON.stringify(clip)) void onSave(draft);
  };
  return (
    <div className="inspector-content">
      <div className="object-identity">
        <span className={`kind-icon kind-${clip.kind}`}>
          {clip.kind === 'text' ? 'T' : clip.kind === 'scene' ? '◈' : '◷'}
        </span>
        <div>
          <strong>{clip.name}</strong>
          <span>{clip.kind === 'scene' ? 'HTML scene' : `${clip.kind} layer`}</span>
        </div>
      </div>
      <fieldset disabled={disabled}>
        <label className="field">
          Layer name
          <input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={save}
            maxLength={100}
          />
        </label>
        {clip.kind === 'text' && (
          <TextFields
            draft={draft}
            document={document}
            update={update}
            save={save}
            setDraft={setDraft}
            onPreview={onPreview}
            onSave={onSave}
          />
        )}
        {['image', 'video', 'audio'].includes(clip.kind) && (
          <label className="field">
            Source
            <select
              value={draft.assetId}
              onChange={(e) => {
                const next = { ...draft, assetId: e.target.value };
                setDraft(next);
                void onSave(next);
              }}
            >
              {document.assets
                .filter((a) => a.mime.startsWith(`${clip.kind}/`))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {['video', 'audio'].includes(clip.kind) && (
          <label className="field">
            Volume
            <input
              aria-label="Clip volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              onPointerUp={save}
              onKeyUp={save}
            />
          </label>
        )}
        <div className="inspector-divider" />
        <div className="field-pair">
          <label className="field">
            Starts at
            <div className="input-unit">
              <input
                type="number"
                min={0}
                step={1 / document.fps}
                value={Number(draft.start.toFixed(3))}
                onChange={(e) => update({ start: Number(e.target.value) })}
                onBlur={save}
              />
              <span>s</span>
            </div>
          </label>
          <label className="field">
            Duration
            <div className="input-unit">
              <input
                type="number"
                min={0.1}
                step={1 / document.fps}
                value={Number(draft.duration.toFixed(3))}
                onChange={(e) => update({ duration: Number(e.target.value) })}
                onBlur={save}
              />
              <span>s</span>
            </div>
          </label>
        </div>
        {clip.kind === 'scene' && (
          <p className="field-help">
            This scene is made with HTML. Leave a note to change its artwork or animation with
            Codex.
          </p>
        )}
        <label className="field">
          Layer
          <select
            value={draft.trackId}
            onChange={(e) => {
              const next = { ...draft, trackId: e.target.value };
              setDraft(next);
              void onSave(next);
            }}
          >
            {document.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    </div>
  );
}
