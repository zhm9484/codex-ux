import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { BrowserAppInstance } from '@codex-ux/sdk';
import {
  identityPlacement,
  type Annotation,
  type Placement,
  type SceneAnchor,
  type SceneOperation,
  type SceneProject,
  type Vec3,
  type VisibleObject,
} from '@codex-ux/scene-domain';
import { api, errorMessage } from './api';
import { SceneViewport, type Tool } from './viewport';

declare global {
  interface Window {
    __sceneEditor?: { state: () => ReturnType<SceneViewport['diagnostics']> };
  }
}
export interface SceneRequest {
  id: string;
  state: string;
  error: string | null;
  text: string;
  annotationIds: string[];
}
export function useScene(id: string, instance: BrowserAppInstance, candidate: string | null) {
  const host = useRef<HTMLDivElement>(null);
  const markers = useRef<HTMLDivElement>(null);
  const viewport = useRef<SceneViewport | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const current = useRef<SceneProject | null>(null);
  const working = useRef(false);
  const interacting = useRef(false);
  const alive = useRef(true);
  const [project, setProject] = useState<SceneProject | null>(null);
  const [displayed, setDisplayed] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const [preview, setPreview] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [anchor, setAnchor] = useState<SceneAnchor | null>(null);
  const [text, setText] = useState('');
  const [requests, setRequests] = useState<SceneRequest[]>([]);
  const [objects, setObjects] = useState<VisibleObject[]>([]);
  const [session, setSession] = useState(() => instance.session(id));
  const [pairing, setPairing] = useState(instance.connections?.connection ?? null);
  const base = `/workspaces/${id}/apps/3d-space`;
  const contextPath = candidate ? `${base}/requests/${candidate}/preview` : `${base}/context`;
  const editable =
    !candidate &&
    !busy &&
    displayed === project?.revisionId &&
    !project?.source.pending &&
    !project?.source.error;
  function accept(next: SceneProject) {
    if (alive.current) {
      current.current = next;
      setProject(next);
    }
  }
  async function refresh() {
    accept(await api<SceneProject>(contextPath));
  }
  async function save(operation: SceneOperation, label: string) {
    if (working.current || !current.current || candidate) return;
    working.current = true;
    if (viewport.current) viewport.current.editable = false;
    setBusy('Saving');
    setError('');
    try {
      accept(
        await api<SceneProject>(`${base}/operations`, {
          baseRevision: current.current.revisionId,
          requestId: crypto.randomUUID(),
          label,
          operation,
        }),
      );
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
      await refresh().catch(() => {});
      // Even an unchanged head must restore the optimistic transform after a failed save.
      if (current.current) await viewport.current?.load(current.current).catch(() => {});
    } finally {
      working.current = false;
      if (alive.current) setBusy('');
    }
  }
  const commit = useEffectEvent((objectId: string, placement: Placement, label: string) => {
    void save({ type: 'transform', objectId, placement }, label);
  });
  const onAnchor = useEffectEvent((next: SceneAnchor) => {
    setAnchor(next);
    setAnnotating(false);
    composer.current?.focus();
  });
  const onNote = useEffectEvent((note: Annotation) => {
    setNotice(note.text);
    setAnchor({
      ...note.anchor,
      revisionId: current.current?.revisionId ?? note.anchor.revisionId,
    });
    composer.current?.focus();
  });
  useEffect(() => {
    alive.current = true;
    let runtime: SceneViewport | null = null;
    try {
      runtime = new SceneViewport(host.current!, markers.current!, {
        select: (id, label) => setSelected(id ? { id, label } : null),
        commit: (id, placement, label) => commit(id, placement, label),
        interaction: (active) => {
          interacting.current = active;
        },
        anchor: (anchor) => onAnchor(anchor),
        note: (note) => onNote(note),
        error: (message) => setError(message),
      });
      viewport.current = runtime;
      window.__sceneEditor = { state: () => runtime!.diagnostics() };
    } catch (error) {
      queueMicrotask(() => {
        if (alive.current) setError(`3D could not start. ${errorMessage(error)}`);
      });
    }
    return () => {
      alive.current = false;
      runtime?.dispose();
      viewport.current = null;
      delete window.__sceneEditor;
    };
  }, []);
  useEffect(() => {
    let active = true,
      fetching = false;
    const fetchProject = async () => {
      if (fetching || working.current || interacting.current || document.hidden) return;
      fetching = true;
      try {
        const result = await api<SceneProject>(contextPath);
        if (active && !working.current && !interacting.current) {
          current.current = result;
          setProject(result);
        }
        if (!candidate) {
          const list = await api<SceneRequest[]>(`${base}/requests`);
          if (active) setRequests(list);
        }
      } catch (error) {
        if (active) setError(errorMessage(error));
      } finally {
        fetching = false;
      }
    };
    void fetchProject();
    const timer = window.setInterval(() => {
      void fetchProject();
    }, 1800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [contextPath, candidate, base]);
  const latestProject = useEffectEvent(() => project);
  useEffect(() => {
    const next = latestProject();
    if (!next || !viewport.current) return;
    let active = true;
    viewport.current.editable = false;
    void viewport.current
      .load(next)
      .then(() => {
        if (active) {
          setDisplayed(next.revisionId);
          setObjects(viewport.current?.inventory() ?? []);
        }
      })
      .catch((error: unknown) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [project?.revisionId, project?.source.baseUrl, project?.source.codeHash]);
  useEffect(() => {
    if (viewport.current) {
      viewport.current.tool = tool;
      viewport.current.annotating = annotating;
      viewport.current.editable = editable;
    }
  }, [tool, annotating, editable]);
  useEffect(() => {
    viewport.current?.setPreview(preview);
  }, [preview]);
  useEffect(
    () =>
      instance.subscribe(() => {
        setSession(instance.session(id));
        setPairing(instance.connections?.connection ?? null);
        if (instance.connections?.error) setError(instance.connections.error);
      }),
    [id, instance],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  async function travel(direction: 'undo' | 'redo', revisionId?: string) {
    if (working.current || !current.current || candidate) return;
    working.current = true;
    setBusy('Restoring');
    setError('');
    try {
      accept(
        await api<SceneProject>(`${base}/${revisionId ? 'restore' : direction}`, {
          baseRevision: current.current.revisionId,
          requestId: crypto.randomUUID(),
          ...(revisionId ? { revisionId } : {}),
        }),
      );
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
      await refresh().catch(() => {});
    } finally {
      working.current = false;
      if (alive.current) setBusy('');
    }
  }
  async function importFiles(files: { file: File; path: string }[], position: Vec3) {
    if (!files.length || working.current || !current.current || candidate) return;
    if (files.some(({ file }) => file.size > 100 * 1024 ** 2)) {
      setError('Each file can be up to 100 MB.');
      return;
    }
    if (
      files.length > 1000 ||
      files.reduce((sum, { file }) => sum + file.size, 0) > 512 * 1024 ** 2
    ) {
      setError('Import up to 1,000 files and 512 MB at a time.');
      return;
    }
    const importId = crypto.randomUUID(),
      revision = current.current.revisionId;
    working.current = true;
    setBusy('Importing');
    setError('');
    try {
      for (const [index, { file, path }] of files.entries()) {
        if (alive.current) setBusy(`Importing ${index + 1} of ${files.length}`);
        const response = await fetch(
          `/api${base}/imports/${importId}/files?path=${encodeURIComponent(path)}`,
          { method: 'POST', body: file },
        );
        if (!response.ok) throw new Error(((await response.json()) as { error: string }).error);
      }
      const next = await api<SceneProject>(`${base}/imports/${importId}/finish`, {
        baseRevision: revision,
        requestId: crypto.randomUUID(),
        position,
      });
      accept(next);
      if (alive.current) setNotice('Model imported. Original files are preserved.');
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
      await refresh().catch(() => {});
    } finally {
      working.current = false;
      if (alive.current) setBusy('');
    }
  }
  function add(shape: 'box' | 'sphere' | 'cylinder' | 'torus') {
    const placement = identityPlacement();
    placement.position = viewport.current?.insertionPoint() ?? [0, 0, 0];
    const id = crypto.randomUUID();
    void save(
      {
        type: 'add',
        object: {
          id,
          label: shape[0]!.toUpperCase() + shape.slice(1),
          kind: 'primitive',
          shape,
          color: '#c9b7a0',
        },
        placement,
      },
      'Added object',
    );
  }
  async function pin() {
    const point = anchor ?? viewport.current?.anchorForSelection();
    if (!point || !text.trim()) return;
    await save(
      { type: 'annotate', annotation: { id: crypto.randomUUID(), text, anchor: point } },
      'Added annotation',
    );
    // Preserve the draft on a failed/stale save.
    if (
      current.current?.document.annotations.some(
        (note) => note.text === text && JSON.stringify(note.anchor) === JSON.stringify(point),
      )
    ) {
      setText('');
      setAnchor(null);
      setNotice('Note pinned to the scene.');
    }
  }
  async function send() {
    if (!text.trim() || working.current || !current.current || !viewport.current || candidate)
      return;
    const target = instance.target(id);
    const revision = current.current.revisionId;
    const capturedText = text;
    const feedback = {
      text,
      anchor: anchor ?? viewport.current.anchorForSelection(),
      camera: viewport.current.view(),
      objects: viewport.current.inventory(),
      annotationIds: current.current.document.annotations.map((note) => note.id),
    };
    let screenshot: string | undefined;
    try {
      screenshot = viewport.current.capture();
    } catch {
      /* The spatial context is still available if a third-party texture prevents capture. */
    }
    working.current = true;
    setBusy('Sending');
    setError('');
    try {
      await api(`${base}/requests`, {
        baseRevision: revision,
        requestId: crypto.randomUUID(),
        target,
        feedback,
        ...(screenshot && screenshot.length <= 2 * 1024 ** 2 ? { screenshot } : {}),
      });
      if (alive.current) {
        setText((draft) => (draft === capturedText ? '' : draft));
        setAnchor(null);
        setNotice('Sent to your agent. You can keep exploring.');
      }
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
    } finally {
      working.current = false;
      if (alive.current) setBusy('');
    }
  }
  async function pair() {
    try {
      await instance.connections?.offer();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return {
    host,
    markers,
    viewport,
    composer,
    project,
    displayed,
    busy,
    error,
    setError,
    notice,
    setNotice,
    selected,
    tool,
    setTool,
    preview,
    setPreview,
    annotating,
    setAnnotating,
    anchor,
    setAnchor,
    text,
    setText,
    session,
    pairing,
    requests,
    objects,
    editable,
    save,
    travel,
    importFiles,
    add,
    pin,
    send,
    pair,
  };
}
