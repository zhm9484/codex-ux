import type { CanvasText } from '../canvas/text-model';
import type { TextElement } from '@codex-ux/video-domain';
export type Panel = 'notes' | 'source' | 'assets' | 'history' | null;
export interface TimeRange {
  start: number;
  end: number;
}
export interface PlayerControl {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  setMuted: (muted: boolean) => void;
  selectText: (id: string) => void;
  editText: (id: string) => void;
  isTextEditing: () => boolean;
  textBounds: (id: string) => CanvasText['box'] | undefined;
  patchText: (selection: CanvasText, next: TextElement) => void;
}
