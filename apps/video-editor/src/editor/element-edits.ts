import {
  nativeTextTargets,
  removeNativeElement,
  updateNativeTiming,
  type Clip,
  type VideoDocument,
} from '@codex-ux/video-domain';
import type { CanvasText } from '../canvas/text-model';
import { timelineItems, type TimelineItem } from './timeline-items';

export function updateElementTiming(doc: VideoDocument, item: TimelineItem, next: Clip) {
  return item.native
    ? updateNativeTiming(doc, item.native, next.start, next.duration)
    : { ...doc, clips: doc.clips.map((clip) => (clip.id === next.id ? next : clip)) };
}
export function deleteElement(doc: VideoDocument, id: string, selection: CanvasText | null) {
  const item = timelineItems(doc).find((item) => item.clip.id === id);
  if (item?.native) return removeNativeElement(doc, item.native.path, item.native.index);
  if (item) return { ...doc, clips: doc.clips.filter((clip) => clip.id !== id) };
  const source = selection?.clip.id === id ? selection.source : undefined;
  if (!source) throw new Error('Select a source element before deleting it.');
  if (source.native) return removeNativeElement(doc, source.id, source.index);
  if (doc.sources[source.id] !== source.original)
    throw new Error('This source changed. Select the text again.');
  const target = nativeTextTargets(source.original)[source.index];
  if (!target) throw new Error('This text no longer has a reliable source location.');
  const { startOffset, endOffset } = target.location;
  return {
    ...doc,
    sources: {
      ...doc.sources,
      [source.id]: source.original.slice(0, startOffset) + source.original.slice(endOffset),
    },
  };
}
