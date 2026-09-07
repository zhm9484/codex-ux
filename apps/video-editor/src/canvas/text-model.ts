import { nativeBindings, editNativeText } from './native-text';
import { clipSchema, type Clip, type VideoDocument } from '@codex-ux/video-domain';
import type { Region } from '@codex-ux/protocol';

export interface CanvasText {
  clip: Clip;
  box: Region;
  source?: {
    native?: boolean;
    inline?: boolean;
    id: string;
    index: number;
    original: string;
    clipId: string;
    x: number;
    y: number;
    translateX: number;
    translateY: number;
  };
}
export interface TextBinding {
  element: HTMLElement;
  clip: Clip;
  source?: { native?: boolean; id: string; index: number; original: string; clipId: string };
}

function sourceTree(source: string) {
  const template = document.createElement('template');
  template.innerHTML = source;
  return template.content.querySelector('template') ?? template;
}
function leaves(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
    (element) =>
      element.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
      !element.children.length &&
      !element.closest('script,style,noscript') &&
      !!element.textContent?.trim(),
  );
}
export function textBindings(frame: Document, doc: VideoDocument): Map<string, TextBinding> {
  if (doc.native) return nativeBindings(frame, doc);
  const bindings = new Map<string, TextBinding>();
  for (const clip of doc.clips) {
    const root = frame.getElementById(clip.id);
    if (!root) continue;
    if (clip.kind === 'text') {
      bindings.set(clip.id, { element: root, clip });
      root.dataset.uxText = clip.id;
    } else if (clip.kind === 'scene' && clip.sourceId) {
      const original = doc.sources[clip.sourceId]!;
      const source = sourceTree(original);
      const rendered = leaves(root);
      leaves(source.content).forEach((element, index) => {
        const matches = rendered.filter(
          (candidate) =>
            candidate.tagName === element.tagName && candidate.textContent === element.textContent,
        );
        // Ambiguous or generated text stays agent-editable; never guess a source target.
        if (matches.length !== 1) return;
        const target = matches[0]!;
        const id = `${clip.id}:text:${index}`;
        target.dataset.uxText = id;
        target.style.pointerEvents = 'auto';
        bindings.set(id, {
          element: target,
          clip: { ...clip, id, kind: 'text', name: element.textContent.trim().slice(0, 40) },
          source: { id: clip.sourceId!, index, original, clipId: clip.id },
        });
      });
    }
  }
  return bindings;
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
  if (!binding.source) return { clip: binding.clip, box };
  const style = binding.element.ownerDocument.defaultView!.getComputedStyle(binding.element);
  const translate = binding.element.style.translate.split(' ').map(parseFloat);
  const clip = clipSchema.parse({
    ...binding.clip,
    id: binding.source.clipId,
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
  next: Clip,
  doc: VideoDocument,
) {
  if (selection.source) {
    if (next.text !== element.textContent) element.textContent = next.text;
    const source = selection.source;
    if (source.inline && (next.x !== source.x || next.y !== source.y))
      element.style.display = 'inline-block';
    element.style.translate = `${source.translateX + ((next.x - source.x) * doc.width) / 100}px ${source.translateY + ((next.y - source.y) * doc.height) / 100}px`;
  } else {
    const span = element.querySelector('span');
    if (span && next.text !== span.textContent) span.textContent = next.text;
    Object.assign(element.style, {
      left: `${next.x}%`,
      top: `${next.y}%`,
      width: `${next.width}%`,
    });
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
  next: Clip,
): VideoDocument {
  if (selection.source?.native) return editNativeText(doc, selection, next);
  const target = selection.source!;
  if (doc.sources[target.id] !== target.original)
    throw new Error('This scene changed. Select the text again before editing.');
  const tree = sourceTree(target.original);
  const element = leaves(tree.content)[target.index];
  if (!element) throw new Error('This text is no longer in the scene.');
  patchText(element, selection, next, doc);
  return {
    ...doc,
    sources: { ...doc.sources, [target.id]: `<template>${tree.innerHTML}</template>` },
  };
}
