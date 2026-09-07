import {
  removeHyperframesElement,
  updateHyperframesTiming,
  type TimelineItem,
  type VideoDocument,
} from '@codex-ux/video-domain';
import type { CanvasText } from '../canvas/text-model';
import { timelineItems } from './timeline-items';
export function updateElementTiming(doc: VideoDocument, item: TimelineItem, next: TimelineItem) {
  if (!item.target) throw new Error('Timing is controlled by the video source.');
  return updateHyperframesTiming(doc, { ...item, ...item.target }, next.start, next.duration);
}
export function deleteElement(doc: VideoDocument, id: string, selection: CanvasText | null) {
  const item = timelineItems(doc).find((item) => item.id === id);
  if (item?.target) return removeHyperframesElement(doc, item.target.path, item.target.index);
  const source = selection?.clip.id === id ? selection.source : undefined;
  if (!source) throw new Error('Select a source element before deleting it.');
  if (doc.files[source.id]?.text !== source.original)
    throw new Error('This source changed. Select the text again.');
  return removeHyperframesElement(doc, source.id, source.index);
}
