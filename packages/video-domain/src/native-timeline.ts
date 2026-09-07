import { attribute, htmlElements, nativeTextTargets } from './native-html.ts';
import type { VideoDocument } from './schema.ts';

export interface NativeTimelineItem {
  id: string;
  path: string;
  index: number;
  name: string;
  start: number;
  duration: number;
  offset: number;
  textIndex?: number;
}
const timelineCache = new WeakMap<VideoDocument, NativeTimelineItem[]>();
export function nativeTimelineItems(doc: VideoDocument): NativeTimelineItem[] {
  const cached = timelineCache.get(doc);
  if (cached) return cached;
  const items = readNativeTimeline(doc);
  timelineCache.set(doc, items);
  return items;
}
function readNativeTimeline(doc: VideoDocument): NativeTimelineItem[] {
  if (!doc.native) return [];
  const offsets = new Map<string, number>([['index.html', 0]]);
  const duplicated = new Set<string>();
  for (let depth = 0; depth < 12; depth++) {
    let added = false;
    for (const [path, offset] of [...offsets]) {
      for (const element of htmlElements(doc.native.files[path]?.text ?? '')) {
        const src = attribute(element, 'data-composition-src');
        if (!src || /^(?:[a-z]+:|\/)/i.test(src)) continue;
        const target = new URL(src, `https://project.local/${path}`).pathname.slice(1);
        const start = Number(attribute(element, 'data-start') ?? 0);
        if (!offsets.has(target)) {
          offsets.set(target, offset + start);
          added = true;
        }
      }
    }
    if (!added) break;
  }
  // Reused sub-compositions do not have a single editable global time.
  const mounts = new Map<string, number>();
  for (const path of offsets.keys())
    for (const element of htmlElements(doc.native.files[path]?.text ?? '')) {
      const src = attribute(element, 'data-composition-src');
      if (!src || /^(?:[a-z]+:|\/)/i.test(src)) continue;
      const target = new URL(src, `https://project.local/${path}`).pathname.slice(1);
      mounts.set(target, (mounts.get(target) ?? 0) + 1);
      if (mounts.get(target)! > 1) duplicated.add(target);
    }
  return [...offsets].flatMap(([path, offset]) => {
    if (duplicated.has(path)) return [];
    const html = doc.native!.files[path]?.text ?? '';
    const targets = nativeTextTargets(html);
    return htmlElements(html).flatMap((element, index) => {
      if (
        attribute(element, 'data-composition-id') &&
        attribute(element, 'data-width') &&
        !attribute(element, 'data-composition-src')
      )
        return [];
      const startValue = attribute(element, 'data-start'),
        durationValue = attribute(element, 'data-duration');
      if (
        startValue === undefined ||
        durationValue === undefined ||
        !element.sourceCodeLocation?.endTag
      )
        return [];
      const start = Number(startValue),
        duration = Number(durationValue);
      if (!Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration < 0.1)
        return [];
      const location = element.sourceCodeLocation;
      const text = targets.filter(
        (target) =>
          target.location.startOffset >= location.startOffset &&
          target.location.endOffset <= location.endOffset,
      );
      const target = text.length === 1 ? text[0] : undefined;
      return [
        {
          id: `native:${path}:${attribute(element, 'id') ?? index}`,
          path,
          index,
          name:
            attribute(element, 'data-name') ??
            target?.text.trim().slice(0, 50) ??
            attribute(element, 'id') ??
            element.tagName,
          start: offset + start,
          duration,
          offset,
          ...(target ? { textIndex: target.index } : {}),
        },
      ];
    });
  });
}
export function updateNativeTiming(
  doc: VideoDocument,
  item: NativeTimelineItem,
  start: number,
  duration: number,
) {
  const file = doc.native!.files[item.path]!;
  const element = htmlElements(file.text!)[item.index];
  const location = element?.sourceCodeLocation;
  if (!location?.attrs) throw new Error('This timing no longer has an explicit source target.');
  let text = file.text!;
  const edits = [
    ['data-start', Math.max(0, start - item.offset)],
    ['data-duration', duration],
  ] as const;
  const ranges = edits
    .map(([name, value]) => {
      const attr = location.attrs![name];
      if (!attr) throw new Error('Timing is controlled by source code.');
      return {
        start: attr.startOffset,
        end: attr.endOffset,
        text: `${name}="${Number(value.toFixed(4))}"`,
      };
    })
    .sort((a, b) => b.start - a.start);
  for (const edit of ranges) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return {
    ...doc,
    native: { ...doc.native!, files: { ...doc.native!.files, [item.path]: { ...file, text } } },
  };
}
export function removeNativeElement(doc: VideoDocument, path: string, index: number) {
  const file = doc.native!.files[path]!;
  const location = htmlElements(file.text!)[index]?.sourceCodeLocation;
  if (!location) throw new Error('This element no longer has a reliable source location.');
  const text = file.text!.slice(0, location.startOffset) + file.text!.slice(location.endOffset);
  return {
    ...doc,
    native: { ...doc.native!, files: { ...doc.native!.files, [path]: { ...file, text } } },
  };
}
