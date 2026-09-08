import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { WorkspaceLibrary, type BrowserAppInstance } from '@codex-ux/sdk';
import type { LibraryReference } from '@codex-ux/protocol';
import {
  identityPlacement,
  type Annotation,
  type Placement,
  type SceneAnchor,
  type SceneOperation,
  type SceneProject,
  type SceneFeedback,
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
  const [library] = useState(() => new WorkspaceLibrary(id));
  const [chatOpen, setChatOpen] = useState(false);
  const [attachments, setAttachments] = useState<LibraryReference[]>([]);
  const [draft, setDraft] = useState<{
    revision: string;
    feedback: Omit<SceneFeedback, 'text' | 'attachmentIds'>;
    label: string;
    screenshot?: string;
  } | null>(null);
  const pending = useRef<{
    baseRevision: string;
    requestId: string;
    target: ReturnType<BrowserAppInstance['target']>;
    feedback: SceneFeedback;
    screenshot?: string;
  } | null>(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const current = useRef<SceneProject | null>(null);
  const working = useRef(false);
  const interacting = useRef(false);
  const alive = useRef(true);
  const [project, setProject] = useState<SceneProject | null>(null);
  const [displayed, setDisplayed] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [bindingError, setBindingError] = useState('');
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
  });
  const onNote = useEffectEvent((note: Annotation) => {
    setNotice(note.text);
    setAnchor({
      ...note.anchor,
      revisionId: current.current?.revisionId ?? note.anchor.revisionId,
    });
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
        setBindingError(instance.connections?.error ?? '');
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
  function captureDraft(point = anchor ?? viewport.current?.anchorForSelection() ?? null) {
    if (!viewport.current || !current.current || displayed !== current.current.revisionId)
      return null;
    let screenshot: string | undefined;
    try {
      screenshot = viewport.current.capture();
    } catch {
      /* Spatial context remains available. */
    }
    return {
      revision: current.current.revisionId,
      label: point?.objectId
        ? (objects.find((object) => object.id === point.objectId)?.label ?? point.objectId)
        : point
          ? 'Pinned place'
          : 'Scene view',
      feedback: {
        anchor: point,
        camera: viewport.current.view(),
        objects: viewport.current.inventory(),
        annotationIds: current.current.document.annotations.map((note) => note.id),
      },
      ...(screenshot && screenshot.length <= 2 * 1024 ** 2 ? { screenshot } : {}),
    };
  }
  function openChat() {
    if (!draft) setDraft(captureDraft());
    setChatOpen(true);
  }
  function useCurrentView() {
    if (pending.current) return;
    setDraft(captureDraft(viewport.current?.anchorForSelection() ?? null));
    setAnchor(null);
    setError('');
  }
  function clearDraft() {
    setText('');
    setAttachments([]);
    setDraft(null);
    setAnchor(null);
    pending.current = null;
    setCheckingDelivery(false);
  }
  async function pin() {
    const context = draft ?? captureDraft();
    const point = context?.feedback.anchor;
    if (!point || !text.trim() || attachments.length || pending.current) return;
    if (context.revision !== current.current?.revisionId) {
      setError('The scene changed. Use the current view before saving this annotation.');
      return;
    }
    await save(
      { type: 'annotate', annotation: { id: crypto.randomUUID(), text, anchor: point } },
      'Added annotation',
    );
    if (
      current.current?.document.annotations.some(
        (note) => note.text === text && JSON.stringify(note.anchor) === JSON.stringify(point),
      )
    ) {
      clearDraft();
      setNotice('Note pinned to the scene.');
    }
  }
  async function send() {
    if (!text.trim() || working.current || !current.current || !viewport.current || candidate)
      return;
    const context = draft ?? captureDraft();
    if (!context) return;
    pending.current ??= {
      baseRevision: context.revision,
      requestId: crypto.randomUUID(),
      target: instance.target(id),
      feedback: { ...context.feedback, text, attachmentIds: attachments.map((ref) => ref.id) },
      ...(context.screenshot ? { screenshot: context.screenshot } : {}),
    };
    const payload = pending.current;
    working.current = true;
    setBusy('Sending');
    setError('');
    try {
      const result = await api<{ state: string; error: string | null }>(
        `${base}/requests`,
        payload,
      );
      if (result.state === 'delivery-unknown' || result.state === 'failed') {
        setError(result.error ?? 'Check request history before sending another message.');
      } else setNotice('Sent to your agent. You can keep exploring.');
      clearDraft();
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
      // A lost HTTP response must never turn a retry into another agent delivery.
      try {
        const response = await fetch(`/api${base}/requests/${payload.requestId}`);
        if (response.status === 404) {
          pending.current = null;
          setCheckingDelivery(false);
        } else if (response.ok) {
          const result = (await response.json()) as { state: string; error: string | null };
          clearDraft();
          setError(
            result.error ?? `Request status: ${result.state}. Check History before sending again.`,
          );
        } else setCheckingDelivery(true);
      } catch {
        setCheckingDelivery(true);
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy('');
    }
  }
  async function pair() {
    try {
      await instance.connections?.offer();
    } catch (error) {
      setBindingError(errorMessage(error));
    }
  }
  return {
    host,
    markers,
    viewport,
    library,
    chatOpen,
    setChatOpen,
    openChat,
    useCurrentView,
    draft,
    attachments,
    setAttachments,
    checkingDelivery,
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
    bindingError,
    setBindingError,
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
