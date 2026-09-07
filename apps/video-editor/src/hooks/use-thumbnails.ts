import { useEffect, useRef, useState } from 'react';
import type { TimelineItem } from '@codex-ux/video-domain';

/** Keep image generation off the browser's connection slots used for playback and saving. */
export function useThumbnails(workspaceId: string, revisionId: string, clips: TimelineItem[]) {
  const retained = useRef<Record<string, string>>({});
  const [frames, setFrames] = useState<{ revision: string; images: Record<string, string> }>({
    revision: '',
    images: {},
  });
  const requests = JSON.stringify(
    clips
      .filter((clip) => clip.kind === 'scene')
      .map((clip) => ({
        id: clip.id,
        time: clip.start + Math.min(1, clip.duration / 2),
      })),
  );

  useEffect(() => {
    const controller = new AbortController();
    const pending = JSON.parse(requests) as { id: string; time: number }[];
    async function load() {
      for (const frame of pending) {
        if (controller.signal.aborted) return;
        try {
          const response = await fetch(
            `/media/video-editor/thumbnails/${workspaceId}/${revisionId}?time=${frame.time}`,
            {
              signal: controller.signal,
              priority: 'low',
            },
          );
          if (!response.ok) continue;
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          const previousUrl = retained.current[frame.id];
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          retained.current[frame.id] = url;
          setFrames((previous) => ({
            revision: revisionId,
            images: {
              ...(previous.revision === revisionId ? previous.images : {}),
              [frame.id]: url,
            },
          }));
        } catch {
          if (controller.signal.aborted) return;
          // A failed thumbnail must never block the timeline or a save.
        }
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [workspaceId, revisionId, requests]);

  useEffect(() => {
    const cache = retained.current;
    return () => {
      for (const url of Object.values(cache)) URL.revokeObjectURL(url);
    };
  }, []);
  return (clipId: string) => (frames.revision === revisionId ? frames.images[clipId] : undefined);
}
