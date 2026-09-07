import { hyperframesBindings, editHyperframesText } from './hyperframes-text';
import { textElementSchema, type TextElement, type VideoDocument } from '@codex-ux/video-domain';
import type { Region } from '@codex-ux/protocol';

export interface CanvasText {
  clip: TextElement;
  box: Region;
  source: {
    inline?: boolean;
    id: string;
    index: number;
    original: string;
    x: number;
    y: number;
    translateX: number;
    translateY: number;
  };
}
export interface TextBinding {
  element: HTMLElement;
  clip: TextElement;
  source: { id: string; index: number; original: string };
}

export function textBindings(frame: Document, doc: VideoDocument): Map<string, TextBinding> {
  return doc.source.kind === 'hyperframes'
    ? hyperframesBindings(frame, doc)
    : new Map<string, TextBinding>();
}
export function bounds(element: HTMLElement, doc: VideoDocument): Region {
  const content = element.matches('.text-clip')
    ? (element.querySelector('span') ?? element)
    : element;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(content);
  const measured = range.getBoundingClientRect();
  const box = measured.width && measured.height ? measured : element.getBoundingClientRect();
  return {
    x: box.x / doc.width,
    y: box.y / doc.height,
    width: box.width / doc.width,
    height: box.height / doc.height,
  };
}
function hexColor(value: string) {
  const values = value.match(/\d+/g)?.slice(0, 3).map(Number);
  return values?.length === 3
    ? `#${values.map((v) => v.toString(16).padStart(2, '0')).join('')}`
    : '#242424';
}
export function describeText(binding: TextBinding, doc: VideoDocument): CanvasText {
  const box = bounds(binding.element, doc);
  const style = binding.element.ownerDocument.defaultView!.getComputedStyle(binding.element);
  const translate = binding.element.style.translate.split(' ').map(parseFloat);
  const clip = textElementSchema.parse({
    ...binding.clip,
    id: binding.clip.id,
    text: binding.element.textContent ?? '',
    x: Math.max(0, Math.min(100, box.x * 100)),
    y: Math.max(0, Math.min(100, (box.y + box.height / 2) * 100)),
    width: Math.max(1, Math.min(100, box.width * 100)),
    fontSize: Math.max(8, Math.min(400, parseFloat(style.fontSize))),
    fontFamily: style.fontFamily.split(',')[0]!.replaceAll('"', '').replaceAll("'", ''),
    color: hexColor(style.color),
  });
  clip.id = binding.clip.id;
  return {
    clip,
    box,
    source: {
      ...binding.source,
      inline: style.display === 'inline',
      x: clip.x,
      y: clip.y,
      translateX: translate[0] || 0,
      translateY: translate[1] || 0,
    },
  };
}
export function patchText(
  element: HTMLElement,
  selection: CanvasText,
  next: TextElement,
  doc: VideoDocument,
) {
  if (selection.source) {
    if (next.text !== element.textContent) element.textContent = next.text;
    const source = selection.source;
    if (source.inline && (next.x !== source.x || next.y !== source.y))
      element.style.display = 'inline-block';
    element.style.translate = `${source.translateX + ((next.x - source.x) * doc.width) / 100}px ${source.translateY + ((next.y - source.y) * doc.height) / 100}px`;
  }
  Object.assign(element.style, {
    fontSize: `${next.fontSize}px`,
    fontFamily: next.fontFamily,
    color: next.color,
  });
}
export function editSourceText(
  doc: VideoDocument,
  selection: CanvasText,
  next: TextElement,
): VideoDocument {
  return editHyperframesText(doc, selection, next);
}
