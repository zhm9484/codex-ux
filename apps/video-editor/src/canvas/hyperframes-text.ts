import {
  textElementSchema,
  hyperframesTimelineItems,
  htmlTextTargets,
  replaceHtmlText,
  type TextElement,
  type VideoDocument,
} from '@codex-ux/video-domain';
import type { CanvasText, TextBinding } from './text-model';

export function hyperframesBindings(frame: Document, doc: VideoDocument) {
  const bindings = new Map<string, TextBinding>();
  const timings = hyperframesTimelineItems(doc);
  const sources = Object.entries(doc.files).flatMap(([path, file]) =>
    file.text === undefined || !/\.html?$/i.test(path)
      ? []
      : htmlTextTargets(file.text).map((target) => ({ path, original: file.text!, target })),
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
    const id = timing?.id ?? `hyperframes:${path}:${target.id ?? target.index}`;
    element.dataset.uxText = id;
    element.style.pointerEvents = 'auto';
    const clip = textElementSchema.parse({
      id,
      name: target.text.trim().slice(0, 40),
    });
    clip.id = id;
    bindings.set(id, {
      element,
      clip,
      source: { id: path, index: target.index, original },
    });
  }
  return bindings;
}
export function editHyperframesText(doc: VideoDocument, selection: CanvasText, next: TextElement) {
  const source = selection.source;
  const file = doc.files[source.id];
  if (file?.text !== source.original)
    throw new Error('This source changed. Select the text again before editing.');
  const target = htmlTextTargets(file.text).find((item) => item.index === source.index);
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
  const text = replaceHtmlText(file.text, source.index, next.text, element.style.cssText);
  return {
    ...doc,
    files: { ...doc.files, [source.id]: { ...file, text } },
  };
}
