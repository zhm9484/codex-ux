import type { LiveTextEdit } from '../canvas/live-edit';
import type { CanvasText } from '../canvas/text-model';
import type { Clip } from '@codex-ux/video-domain';
export type Panel = 'notes' | 'edit' | 'assets' | 'history' | null;
export interface TimeRange {
  start: number;
  end: number;
}
export interface PlayerControl {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  setMuted: (muted: boolean) => void;
  stageTextEdit: (edit: LiveTextEdit | null) => void;
  selectText: (id: string) => void;
  editText: (id: string) => void;
  isTextEditing: () => boolean;
  patch: (clip: Clip) => void;
  textBounds: (id: string) => CanvasText['box'] | undefined;
  patchText: (selection: CanvasText, next: Clip) => void;
}
