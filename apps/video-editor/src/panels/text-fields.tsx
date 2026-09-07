import { FontPicker } from '../components/font-picker';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { Clip, VideoDocument } from '@codex-ux/video-domain';
import { IconButton } from '../components/ui';

interface Props {
  draft: Clip;
  document: VideoDocument;
  update: (change: Partial<Clip>) => void;
  save: () => void;
  setDraft: (clip: Clip) => void;
  onPreview: (clip: Clip) => void;
  onSave: (clip: Clip) => Promise<unknown>;
}
export function TextFields({ draft, document, update, save, setDraft, onPreview, onSave }: Props) {
  return (
    <>
      <label className="field">
        Words
        <textarea
          className="text-editor"
          value={draft.text}
          onChange={(e) => update({ text: e.target.value })}
          onBlur={save}
          rows={3}
          maxLength={4000}
        />
      </label>
      <label className="field">
        Typeface
        <FontPicker
          value={draft.fontFamily}
          document={document}
          disabled={false}
          onChange={(fontFamily) => {
            const next = { ...draft, fontFamily };
            setDraft(next);
            onPreview(next);
            void onSave(next);
          }}
        />
      </label>
      <div className="field-pair">
        <label className="field">
          Size
          <div className="input-unit">
            <input
              type="number"
              min={8}
              max={400}
              value={draft.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              onBlur={save}
            />
            <span>px</span>
          </div>
        </label>
        <label className="field">
          Color
          <div className="color-input">
            <input
              aria-label="Text color"
              type="color"
              value={draft.color}
              onChange={(e) => update({ color: e.target.value })}
              onBlur={save}
            />
            <span>{draft.color.toUpperCase()}</span>
          </div>
        </label>
      </div>
      <div className="field">
        <span>Alignment</span>
        <div className="alignment-buttons">
          {(['left', 'center', 'right'] as const).map((align, i) => (
            <IconButton
              key={align}
              label={`Align ${align}`}
              className={draft.align === align ? 'active' : ''}
              onClick={() => {
                const next = { ...draft, align };
                setDraft(next);
                onPreview(next);
                void onSave(next);
              }}
            >
              {i === 0 ? (
                <AlignLeft size={16} />
              ) : i === 1 ? (
                <AlignCenter size={16} />
              ) : (
                <AlignRight size={16} />
              )}
            </IconButton>
          ))}
        </div>
      </div>
      <div className="field-pair">
        <label className="field">
          Across (%)
          <input
            type="number"
            min={0}
            max={100}
            value={draft.x}
            onChange={(e) => update({ x: Number(e.target.value) })}
            onBlur={save}
          />
        </label>
        <label className="field">
          Down (%)
          <input
            type="number"
            min={0}
            max={100}
            value={draft.y}
            onChange={(e) => update({ y: Number(e.target.value) })}
            onBlur={save}
          />
        </label>
      </div>
    </>
  );
}
