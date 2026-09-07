import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Asset, VideoDocument, Workspace } from '@codex-ux/video-domain';
import type { FeedbackAnchor } from '@codex-ux/protocol';
import { api, post, workspacePath } from '../lib/api';

export function useWorkspace(id: string, deferPreview: () => boolean = () => false) {
  const shouldDefer = useEffectEvent(deferPreview);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const current = useRef(workspace);
  const pending = useRef(false);
  const mutation = useRef(0);
  const base = workspacePath(id);
  const refresh = useCallback(async () => {
    const next = await api<Workspace>(base);
    if (!pending.current) {
      current.current = next;
      setWorkspace(next);
    }
  }, [base]);
  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden || pending.current) return;
      const generation = mutation.current;
      void api<Workspace>(base)
        .then((w) => {
          if (active && !pending.current && generation === mutation.current && !shouldDefer()) {
            current.current = w;
            setWorkspace((prev) => (prev && JSON.stringify(prev) === JSON.stringify(w) ? prev : w));
          }
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : 'Could not load the workspace.');
        });
    };
    load();
    const timer = setInterval(load, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [base]);
  const run = useCallback(async (task: () => Promise<Workspace>) => {
    if (pending.current) return false;
    pending.current = true;
    mutation.current += 1;
    setSaving(true);
    setError('');
    try {
      const next = await task();
      current.current = next;
      setWorkspace(next);
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
        post<Workspace>(`${base}/revisions`, {
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
      post<Workspace>(`${base}/${direction}`, { baseRevision: current.current?.revisionId }),
    );
  const addNote = (text: string, anchor: FeedbackAnchor) =>
    run(() => post<Workspace>(`${base}/notes`, { text, anchor }));
  const removeNote = (noteId: string) =>
    run(() => api<Workspace>(`${base}/notes/${noteId}`, { method: 'DELETE' }));
  const bind = (threadId: string | null) =>
    run(() => post<Workspace>(`${base}/binding`, { threadId }));
  const upload = async (file: File) => {
    const fonts: Record<string, string> = {
      woff2: 'font/woff2',
      woff: 'font/woff',
      ttf: 'font/ttf',
      otf: 'font/otf',
    };
    const mime = fonts[file.name.split('.').at(-1) ?? ''] ?? file.type;
    const asset = await api<Asset>(`${base}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': mime, 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    });
    const doc = current.current?.revision.document;
    if (!doc || !(await save({ ...doc, assets: [...doc.assets, asset] }, `Import ${file.name}`))) {
      throw new Error(
        'The asset was uploaded but could not be added. Refresh and import it again.',
      );
    }
    return asset;
  };
  return {
    workspace,
    error,
    saving,
    save,
    travel,
    addNote,
    removeNote,
    bind,
    upload,
    refresh,
    setError,
  };
}
