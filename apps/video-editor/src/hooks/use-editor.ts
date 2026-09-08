import { WorkspaceLibrary } from '@codex-ux/sdk';
import { useEffect, useEffectEvent, useRef, useState, useMemo } from 'react';
import { durationOf, clampTime, type TextElement, type Revision } from '@codex-ux/video-domain';
import type { FeedbackAnchor, Region } from '@codex-ux/protocol';
import type { FloatingAnchor } from './use-floating-position';
import { createPlaybackClock } from '../lib/playback-clock';
import { editSourceText, type CanvasText } from '../canvas/text-model';
import { deleteElement } from '../editor/element-edits';
import type { TimelineItem } from '../editor/timeline-items';
import { useFeedbackDelivery } from './use-feedback-delivery';
import { useVideoProject } from './use-video-project';
import { useSessionBinding } from './use-session-binding';
import { api } from '../lib/api';
import type { Panel, PlayerControl, TimeRange } from '../editor/types';

export function useEditor(id: string) {
  const library = useMemo(() => new WorkspaceLibrary(id), [id]);
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null);
  const control = useRef<PlayerControl | null>(null);
  const binding = useSessionBinding(id);
  const storage = useVideoProject(id, () => control.current?.isTextEditing() ?? false);
  const delivery = useFeedbackDelivery(id, binding.target, storage.refresh);
  const [connectionAction, setConnectionAction] = useState<(() => Promise<void>) | null>(null);
  const [displayed, setDisplayed] = useState<Revision | null>(null);
  const [modal, setModal] = useState<'agent' | 'library' | 'notes-history' | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [panelAnchor, setPanelAnchor] = useState<FloatingAnchor | null>(null);
  const [clock] = useState(createPlaybackClock);
  const playingNow = useRef(false);
  const lastPaint = useRef(0);
  const [canvasText, setCanvasText] = useState<CanvasText | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAnchor, setChatAnchor] = useState<FloatingAnchor | null>(null);
  const [notePoint, setNotePoint] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [feedbackFocus, setFeedbackFocus] = useState(0);
  const [time, setTime] = useState(1.5);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [marking, setMarking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [comparison, setComparison] = useState<Revision | null>(null);
  const [exporting, setExporting] = useState(false);
  const compareControl = useRef<PlayerControl | null>(null);
  const project = storage.project;
  const document = displayed?.document ?? project?.revision.document;
  const editable = !!displayed && displayed.id === project?.revisionId;
  const setDisplayedRevision = (revisionId: string) => {
    if (project?.revisionId === revisionId) {
      setDisplayed(project.revision);
      setCanvasText(null);
      setSelectedId(null);
      setRange(null);
      setRegion(null);
    }
  };

  function seek(value: number, keepPlaying = false) {
    value = document ? clampTime(document, value) : value;
    if (!keepPlaying) control.current?.pause();
    clock.update(value, keepPlaying && playingNow.current);
    control.current?.seek(value);
    compareControl.current?.seek(value);
    setTime(value);
  }
  function togglePlay() {
    if (playing) control.current?.pause();
    else control.current?.play();
  }
  function locate(anchor: FeedbackAnchor) {
    if (anchor.revisionId !== displayed?.id) {
      void api<Revision>(`/workspaces/${id}/apps/video-editor/revisions/${anchor.revisionId}`)
        .then((revision) => {
          setComparison(revision);
          setTime(anchor.start);
        })
        .catch((error: unknown) =>
          storage.setError(error instanceof Error ? error.message : 'Version unavailable.'),
        );
      return;
    }
    setRange(anchor.end > anchor.start ? { start: anchor.start, end: anchor.end } : null);
    setRegion(anchor.region ?? null);
    setSelectedId(anchor.objectId ?? null);
    seek(anchor.start);
  }
  function selectText(selection: CanvasText) {
    setChatOpen(false);
    setSelectedId(selection.clip.id);
    setCanvasText(selection);
    setRegion(null);
    setRange(null);
    setMarking(false);
    setContextMenu(null);
  }
  async function updateText(selection: CanvasText, next: TextElement) {
    if (!document || !editable) return false;
    try {
      const edited = editSourceText(document, selection, next);
      const saved = await storage.save(edited, 'Edit source text');
      if (!saved) {
        control.current?.patchText(selection, selection.clip);
      }
      return saved;
    } catch (error) {
      storage.setError(error instanceof Error ? error.message : 'Could not edit this text.');
      return false;
    }
  }
  function selectTimeline(item: TimelineItem, locate = false) {
    setSelectedId(item.id);
    setCanvasText(null);
    setRegion(null);
    setRange(null);
    control.current?.pause();
    if (locate) seek(item.start);
    control.current?.selectText(item.id);
  }
  async function removeSelected() {
    if (!document || !editable || !selectedId || storage.saving) return;
    try {
      if (await storage.save(deleteElement(document, selectedId, canvasText), 'Delete element'))
        clearSelection();
    } catch (error) {
      storage.setError(error instanceof Error ? error.message : 'Could not delete this element.');
    }
  }
  function onTime(value: number) {
    if (!document) return;
    clock.update(value, playingNow.current);
    if (!playingNow.current || performance.now() - lastPaint.current > 150) {
      setTime(value);
      lastPaint.current = performance.now();
    }
    compareControl.current?.seek(
      Math.min(value, comparison ? durationOf(comparison.document) : value),
    );
  }
  function openNotes(event?: React.MouseEvent<HTMLElement>, retarget = true) {
    setNotePoint(null);
    const island = event?.currentTarget.closest('.tool-island');
    const rect = (island ?? event?.currentTarget)?.getBoundingClientRect();
    const fromIsland = !!island;
    setChatAnchor(
      rect && fromIsland
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            placement: 'beside',
          }
        : rect
          ? { left: rect.left, top: rect.top, bottom: rect.bottom }
          : { left: 24, top: window.innerHeight - 64, bottom: window.innerHeight - 24 },
    );
    control.current?.pause();
    setMarking(false);
    setPanel(null);
    setChatOpen(true);
    setContextMenu(null);
    if (retarget) setFeedbackFocus((value) => value + 1);
  }
  function clearSelection() {
    setChatOpen(false);
    setNotePoint(null);
    setCanvasText(null);
    setContextMenu(null);
    setSelectedId(null);
    setRegion(null);
    setRange(null);
    setMarking(false);
  }
  function toggleMute() {
    setMuted(!muted);
    control.current?.setMuted(!muted);
  }
  const keyHandler = useEffectEvent((event: KeyboardEvent) => {
    if (event.target instanceof Element && event.target.closest('dialog')) return;
    if (event.key === 'Escape') {
      setPanel(null);
      clearSelection();
      setChatOpen(false);
      return;
    }

    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input,textarea,select,[contenteditable],dialog')
    )
      return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedId) {
        event.preventDefault();
        void removeSelected();
      }
      return;
    }
    if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      togglePlay();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void storage.travel(event.shiftKey ? 'redo' : 'undo');
    }
    if (event.key.toLowerCase() === 'i')
      setRange({ start: time, end: Math.max(time, range?.end ?? time) });
    if (event.key.toLowerCase() === 'o')
      setRange({ start: Math.min(range?.start ?? time, time), end: time });
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const dismiss = useEffectEvent((event: PointerEvent) => {
    if (
      !(event.target as Element).closest(
        '.chat-popover,.tool-island,dialog,.notes-board,.ux-mention-menu',
      )
    )
      setChatOpen(false);
    if (!(event.target as Element).closest('.canvas-menu')) setContextMenu(null);
    if (!(event.target as Element).closest('.side-panel,[data-panel-trigger]')) setPanel(null);
  });
  useEffect(() => {
    const pointer = (event: PointerEvent) => dismiss(event);
    window.addEventListener('pointerdown', pointer, true);
    return () => window.removeEventListener('pointerdown', pointer, true);
  }, []);

  const anchor: FeedbackAnchor = {
    revisionId: displayed?.id || project?.revisionId || '',
    start: range?.start ?? clock.time(),
    end: range?.end ?? clock.time(),
    ...(selectedId
      ? {
          objectId: selectedId,
        }
      : {}),
    ...(region ? { region } : canvasText?.source ? { region: canvasText.box } : {}),
  };
  return {
    ...storage,
    library,
    droppedFiles,
    setDroppedFiles,
    modal,
    setModal,
    notesOpen,
    setNotesOpen,
    ...binding,
    ...delivery,
    connectionAction,
    setConnectionAction,
    error: storage.error || binding.bindingError || project?.source?.error || '',
    document,
    presentedProject:
      project && displayed
        ? {
            ...project,
            revisionId: displayed.id,
            revision: displayed,
            name: displayed.document.name,
          }
        : null,
    editable,
    displayedRevision: displayed?.id ?? '',
    setDisplayedRevision,
    timelineExpanded: !!canvasText,
    selectTimeline,
    removeSelected,
    clock,
    canvasText,
    setCanvasText,
    restoreText: (selection: CanvasText) => {
      setCanvasText(selection);
      setSelectedId(selection.clip.id);
    },
    selectText,
    updateText,
    chatOpen,
    setChatOpen,
    chatAnchor,
    contextMenu,
    setContextMenu,
    notePoint,
    setNotePoint,
    feedbackFocus,
    clearSelection,
    panel,
    setPanel,
    panelAnchor,
    setPanelAnchor,
    time,
    playing,
    setPlaying: (value: boolean) => {
      playingNow.current = value;
      clock.update(clock.time(), value);
      setPlaying(value);
    },
    selectedId,
    range,
    setRange,
    region,
    setRegion,
    marking,
    setMarking,
    muted,
    comparison,
    setComparison,
    exporting,
    setExporting,
    control,
    compareControl,
    anchor,
    seek,
    togglePlay,
    locate,
    onTime,
    openNotes,
    toggleMute,
  };
}
export type EditorState = ReturnType<typeof useEditor>;
