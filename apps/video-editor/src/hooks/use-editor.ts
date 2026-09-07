import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  clipSchema,
  durationOf,
  type Asset,
  type Clip,
  type Revision,
} from '@codex-ux/video-domain';
import type { FeedbackAnchor, Region } from '@codex-ux/protocol';
import type { FloatingAnchor } from './use-floating-position';
import { createPlaybackClock } from '../lib/playback-clock';
import { editSourceText, type CanvasText } from '../canvas/text-model';
import { deleteElement } from '../editor/element-edits';
import type { TimelineItem } from '../editor/timeline-items';
import { useVideoProject } from './use-video-project';
import { useSessionBinding } from './use-session-binding';
import { api } from '../lib/api';
import type { Panel, PlayerControl, TimeRange } from '../editor/types';

export function useEditor(id: string) {
  const control = useRef<PlayerControl | null>(null);
  const binding = useSessionBinding(id);
  const storage = useVideoProject(id, () => control.current?.isTextEditing() ?? false);
  const [displayedRevision, setDisplayedRevision] = useState('');
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
  const document = project?.revision.document;

  function seek(value: number, keepPlaying = false) {
    value = Math.max(
      0,
      Math.min(value, document ? durationOf(document) - 1 / document.fps : value),
    );
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
  function select(clipId: string) {
    setCanvasText(null);
    setSelectedId(clipId);
    setRegion(null);
    setMarking(false);
    setPanel(null);
    control.current?.pause();
  }
  function addText() {
    if (!document) return;
    const clip = clipSchema.parse({
      id: crypto.randomUUID(),
      kind: 'text',
      name: 'A new thought',
      text: 'Something worth saying.',
      trackId:
        document.tracks.find((track) => track.id === 'titles')?.id ?? document.tracks.at(-1)!.id,
      start: time,
      duration: 3,
      fontSize: 84,
      fontFamily: 'Georgia',
    });
    void storage
      .save({ ...document, clips: [...document.clips, clip] }, 'Add text')
      .then((saved) => {
        if (saved) select(clip.id);
      });
  }
  function addAsset(asset: Asset) {
    if (!document) return;
    const kind = asset.mime.startsWith('image/')
      ? 'image'
      : asset.mime.startsWith('audio/')
        ? 'audio'
        : 'video';
    const track = kind === 'audio' ? document.tracks.find((track) => track.id === 'sound') : null;
    const clip = clipSchema.parse({
      id: crypto.randomUUID(),
      kind,
      name: asset.name,
      assetId: asset.id,
      trackId: track?.id ?? document.tracks.at(-1)!.id,
      start: time,
      duration: Math.min(asset.duration ?? 5, 3600 - time),
      width: 80,
    });
    void storage
      .save({ ...document, clips: [...document.clips, clip] }, `Add ${asset.name}`)
      .then((saved) => {
        if (saved) select(clip.id);
      });
  }
  async function updateClip(clip: Clip) {
    if (!document) return;
    return storage.save(
      { ...document, clips: document.clips.map((item) => (item.id === clip.id ? clip : item)) },
      `Edit ${clip.name}`,
    );
  }
  function locate(anchor: FeedbackAnchor) {
    if (anchor.revisionId !== project?.revisionId) {
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
  async function updateText(selection: CanvasText, next: Clip) {
    if (!document) return false;
    try {
      const edited = selection.source
        ? editSourceText(document, selection, next)
        : {
            ...document,
            clips: document.clips.map((clip) => (clip.id === next.id ? next : clip)),
          };
      control.current?.stageTextEdit({ document: edited, selection, next });
      const saved = await storage.save(
        edited,
        selection.source ? 'Edit scene text' : `Edit ${next.name}`,
      );
      if (!saved) {
        control.current?.stageTextEdit(null);
        control.current?.patchText(selection, selection.clip);
      }
      return saved;
    } catch (error) {
      control.current?.stageTextEdit(null);
      storage.setError(error instanceof Error ? error.message : 'Could not edit this text.');
      return false;
    }
  }
  function selectTimeline(item: TimelineItem, locate = false) {
    setSelectedId(item.clip.id);
    setCanvasText(null);
    setRegion(null);
    setRange(null);
    control.current?.pause();
    if (locate) seek(item.clip.start);
    control.current?.selectText(item.clip.id);
  }
  async function removeSelected() {
    if (!document || !selectedId || storage.saving) return;
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
    const rect = event?.currentTarget.getBoundingClientRect();
    const fromIsland = !!event?.currentTarget.closest('.tool-island');
    setChatAnchor(
      rect && fromIsland
        ? {
            left:
              rect.right + 372 < window.innerWidth
                ? rect.right + 12
                : Math.max(12, rect.left - 372),
            top: rect.top - 10,
            bottom: rect.top - 10,
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
    if (!(event.target as Element).closest('.chat-popover,.tool-island')) setChatOpen(false);
    if (!(event.target as Element).closest('.canvas-menu')) setContextMenu(null);
    if (!(event.target as Element).closest('.side-panel,[data-panel-trigger]')) setPanel(null);
  });
  useEffect(() => {
    const pointer = (event: PointerEvent) => dismiss(event);
    window.addEventListener('pointerdown', pointer, true);
    return () => window.removeEventListener('pointerdown', pointer, true);
  }, []);

  const anchor: FeedbackAnchor = {
    revisionId: displayedRevision || project?.revisionId || '',
    start: range?.start ?? clock.time(),
    end: range?.end ?? clock.time(),
    ...(selectedId
      ? {
          objectId: canvasText?.source?.native
            ? selectedId
            : (canvasText?.source?.clipId ?? selectedId),
        }
      : {}),
    ...(region ? { region } : canvasText?.source ? { region: canvasText.box } : {}),
  };
  return {
    ...storage,
    ...binding,
    error: storage.error || binding.bindingError || project?.source?.error || '',
    displayedRevision,
    setDisplayedRevision,
    timelineExpanded: !!canvasText,
    selectTimeline,
    removeSelected,
    clock,
    canvasText,
    setCanvasText,
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
    select,
    addText,
    addAsset,
    updateClip,
    locate,
    onTime,
    openNotes,
    toggleMute,
  };
}
export type EditorState = ReturnType<typeof useEditor>;
