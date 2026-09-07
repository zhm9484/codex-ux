import type { Clip, VideoDocument } from '@codex-ux/video-domain';
import type { CanvasText } from './text-model';
export interface LiveTextEdit {
  document: VideoDocument;
  selection: CanvasText;
  next: Clip;
}
/** The server normalizes content hashes after a text edit; all other project data must agree. */
export function sameEditableDocument(a: VideoDocument, b: VideoDocument) {
  const signature = (doc: VideoDocument) => {
    if (!doc.native) return JSON.stringify(doc);
    const files = Object.fromEntries(
      Object.entries(doc.native.files).map(([path, file]) => [
        path,
        file.text === undefined ? file : { text: file.text },
      ]),
    );
    return JSON.stringify({ ...doc, native: { ...doc.native, files } });
  };
  return signature(a) === signature(b);
}
