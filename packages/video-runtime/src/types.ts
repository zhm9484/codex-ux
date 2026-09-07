/** Same-origin preview contract. Video Editor does not inspect an engine's private player API. */
export interface PlaybackState {
  time: number;
  playing: boolean;
  buffering: boolean;
  error: string | null;
}
export interface PreviewController {
  ready: Promise<void>;
  seek(time: number): Promise<void>;
  play(): void;
  pause(): void;
  setMuted(muted: boolean): void;
  state: () => PlaybackState;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  editingDocument?(): Document | null;
}
export interface PreviewWindow extends Window {
  __videoPreview?: PreviewController;
  __videoError?: string;
}
