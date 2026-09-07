import {
  clipSchema,
  nativeTimelineItems,
  nativeTextTargets,
  replaceNativeText,
  type Clip,
  type VideoDocument,
} from '@codex-ux/video-domain';
import type { CanvasText, TextBinding } from './text-model';

export function nativeBindings(frame: Document, doc: VideoDocument) {
  const bindings = new Map<string, TextBinding>();
  const timings = nativeTimelineItems(doc);
  const sources = Object.entries(doc.native!.files).flatMap(([path, file]) =>
    file.text === undefined
      ? []
      : nativeTextTargets(file.text).map((target) => ({ path, original: file.text!, target })),
  );
  const leaves = Array.from(frame.querySelectorAll<HTMLElement>('body *')).filter(
    (element) =>
      !element.children.length &&
      !element.closest('script,style,noscript') &&
      element.namespaceURI === 'http://www.w3.org/1999/xhtml',
  );
  for (const { path, original, target } of sources) {
    const matches = leaves.filter(
      (element) =>
        element.tagName.toLowerCase() === target.tag &&
        element.textContent === target.text &&
        (!target.id || element.id === target.id),
    );
    const sourceMatches = sources.filter(
      (source) =>
        source.target.tag === target.tag &&
        source.target.text === target.text &&
        (!target.id || source.target.id === target.id),
    );
    if (matches.length !== 1 || sourceMatches.length !== 1) continue;
    const element = matches[0]!;
    const timing = timings.find((item) => item.path === path && item.textIndex === target.index);
    const id = timing?.id ?? `native:${path}:${target.id ?? target.index}`;
    element.dataset.uxText = id;
    element.style.pointerEvents = 'auto';
    const clip = clipSchema.parse({
      id: 'native-text',
      name: target.text.trim().slice(0, 40),
      kind: 'text',
      trackId: doc.tracks[0]!.id,
      start: timing?.start ?? 0,
      duration: timing?.duration ?? doc.native!.duration,
    });
    clip.id = id;
    bindings.set(id, {
      element,
      clip,
      source: { id: path, index: target.index, original, clipId: 'native-text', native: true },
    });
  }
  return bindings;
}
export function editNativeText(doc: VideoDocument, selection: CanvasText, next: Clip) {
  const source = selection.source!;
  const file = doc.native!.files[source.id];
  if (file?.text !== source.original)
    throw new Error('This source changed. Select the text again before editing.');
  const target = nativeTextTargets(file.text).find((item) => item.index === source.index);
  if (!target) throw new Error('This text no longer has a reliable source location.');
  const element = document.createElement('span');
  element.style.cssText = target.style;
  element.style.fontSize = `${next.fontSize}px`;
  element.style.fontFamily = next.fontFamily;
  element.style.color = next.color;
  if (source.inline && (next.x !== source.x || next.y !== source.y))
    element.style.display = 'inline-block';
  if (next.x !== source.x || next.y !== source.y)
    element.style.translate = `${source.translateX + ((next.x - source.x) * doc.width) / 100}px ${source.translateY + ((next.y - source.y) * doc.height) / 100}px`;
  const text = replaceNativeText(file.text, source.index, next.text, element.style.cssText);
  return {
    ...doc,
    native: { ...doc.native!, files: { ...doc.native!.files, [source.id]: { ...file, text } } },
  };
}
