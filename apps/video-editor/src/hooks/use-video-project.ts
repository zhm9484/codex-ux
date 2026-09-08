import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { VideoDocument, VideoProject } from '@codex-ux/video-domain';
import { api, post, videoPath } from '../lib/api';

export function useVideoProject(id: string, deferPreview: () => boolean = () => false) {
  const shouldDefer = useEffectEvent(deferPreview);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const current = useRef(project);
  const pending = useRef(false);
  const mutation = useRef(0);
  const base = videoPath(id);
  const refresh = useCallback(async () => {
    const next = await api<VideoProject>(base);
    if (!pending.current) {
      current.current = next;
      setProject(next);
    }
  }, [base]);
  useEffect(() => {
    let active = true;
    let opened = false;
    const load = () => {
      if (!opened || document.hidden || pending.current) return;
      const generation = mutation.current;
      void api<VideoProject>(base)
        .then((w) => {
          if (active && !pending.current && generation === mutation.current && !shouldDefer()) {
            current.current = w;
            setProject((prev) => (prev && JSON.stringify(prev) === JSON.stringify(w) ? prev : w));
          }
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : 'Could not load the project.');
        });
    };
    void post<VideoProject>(base, {})
      .then(() => {
        opened = true;
        if (active) load();
      })
      .catch((error: unknown) => {
        if (active)
          setError(error instanceof Error ? error.message : 'Could not open the video project.');
      });
    const timer = setInterval(load, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [base]);
  const run = useCallback(async (task: () => Promise<VideoProject>) => {
    if (pending.current) return false;
    pending.current = true;
    mutation.current += 1;
    setSaving(true);
    setError('');
    try {
      const next = await task();
      if (!next.source && current.current?.source)
        next.source = { directory: current.current.source.directory };
      current.current = next;
      setProject(next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be saved.');
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, []);
  const save = useCallback(
    (document: VideoDocument, label: string) => {
      const w = current.current;
      if (!w) return Promise.resolve(false);
      return run(() =>
        post<VideoProject>(`${base}/revisions`, {
          baseRevision: w.revisionId,
          requestId: crypto.randomUUID(),
          document,
          label,
        }),
      );
    },
    [base, run],
  );
  const travel = (direction: 'undo' | 'redo') =>
    run(() =>
      post<VideoProject>(`${base}/${direction}`, { baseRevision: current.current?.revisionId }),
    );
  const removeNote = (noteId: string) =>
    run(() => api<VideoProject>(`${base}/notes/${noteId}`, { method: 'DELETE' }));
  const editNote = (
    noteId: string,
    text: string,
    previousText: string,
    attachmentIds?: string[],
    previousAttachmentIds?: string[],
  ) =>
    run(() =>
      api<VideoProject>(`${base}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text, previousText, attachmentIds, previousAttachmentIds }),
      }),
    );
  return {
    project,
    error,
    saving,
    save,
    travel,
    removeNote,
    editNote,
    refresh,
    setError,
  };
}
