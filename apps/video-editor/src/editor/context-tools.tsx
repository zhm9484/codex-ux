import { Type, MessageSquarePlus } from 'lucide-react';
import type { EditorState } from '../hooks/use-editor';
import { IconButton } from '../components/ui';
import { FontPicker } from '../components/font-picker';

export function ContextTools({ state }: { state: EditorState }) {
  const selection = state.canvasText;
  if (!selection || state.playing || state.marking) return null;
  const clip = selection.clip;
  return (
    <div
      className="context-tools"
      style={{
        top:
          selection.box.y > 0.65
            ? `max(8px, calc(${selection.box.y * 100}% - 54px))`
            : `min(calc(100% - 48px), calc(${(selection.box.y + selection.box.height) * 100}% + 12px))`,
      }}
      role="toolbar"
      aria-label="Selected text"
    >
      <IconButton
        label="Edit text on canvas"
        disabled={state.saving}
        onClick={() => state.control.current?.editText(clip.id)}
      >
        <Type size={16} />
      </IconButton>
      <FontPicker
        value={clip.fontFamily}
        document={state.workspace!.revision.document}
        disabled={state.saving}
        onChange={(fontFamily) => void state.updateText(selection, { ...clip, fontFamily })}
      />
      <label className="quick-color" title="Text color">
        <input
          type="color"
          aria-label="Text color"
          defaultValue={clip.color}
          key={clip.color}
          disabled={state.saving}
          onInput={(event) =>
            state.control.current?.patchText(selection, {
              ...clip,
              color: event.currentTarget.value,
            })
          }
          onBlur={(event) => {
            if (event.target.value !== clip.color)
              void state.updateText(selection, { ...clip, color: event.target.value });
          }}
        />
      </label>
      <span className="tool-separator" />
      <IconButton label="Add note" onClick={state.openNotes}>
        <MessageSquarePlus size={16} />
      </IconButton>
    </div>
  );
}
