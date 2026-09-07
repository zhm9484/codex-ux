import {
  clipSchema,
  nativeTimelineItems,
  type Clip,
  type NativeTimelineItem,
  type VideoDocument,
} from '@codex-ux/video-domain';
export interface TimelineItem {
  clip: Clip;
  native?: NativeTimelineItem;
  textId?: string;
}
export function timelineItems(doc: VideoDocument): TimelineItem[] {
  if (!doc.native)
    return doc.clips.map((clip) => ({
      clip,
      ...(clip.kind === 'text' ? { textId: clip.id } : {}),
    }));
  return nativeTimelineItems(doc).map((item) => {
    const clip = clipSchema.parse({
      id: 'native-element',
      trackId: doc.tracks[0]!.id,
      kind: item.textIndex === undefined ? 'scene' : 'text',
      name: item.name,
      start: item.start,
      duration: item.duration,
    });
    clip.id = item.id;
    return { clip, native: item };
  });
}
export function previewScenes(doc: VideoDocument): Clip[] {
  if (!doc.native) return doc.clips.filter((clip) => clip.kind === 'scene');
  const scenes = timelineItems(doc)
    .filter((item) => item.clip.kind === 'scene')
    .map((item) => item.clip);
  return scenes.length
    ? scenes
    : [
        clipSchema.parse({
          id: 'native-preview',
          name: doc.name,
          kind: 'scene',
          trackId: doc.tracks[0]!.id,
          start: 0,
          duration: doc.native.duration,
        }),
      ];
}
