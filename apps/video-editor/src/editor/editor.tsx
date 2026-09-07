import { NotePopover } from '../components/note-popover';
import { ToolIsland } from './tool-island';
import { useFullscreen } from '../hooks/use-fullscreen';
import { useVideoFullscreen } from '../hooks/use-video-fullscreen';
import { PlaybackScrubber } from './playback-scrubber';
import { useRef, useState } from 'react';
import { AlertCircle, Columns2, Upload, X } from 'lucide-react';
import { durationOf } from '@codex-ux/video-domain';
import type { Workspace } from '@codex-ux/protocol';
import { useEditor } from '../hooks/use-editor';
import { Header } from './header';
import { PlayerStage } from './player-stage';
import { Transport } from './transport';
import { TimelineDock } from './timeline-dock';
import { ContextTools } from './context-tools';
import { ChatDock } from './chat-dock';
import { SelectionBox } from '../canvas/selection-box';
import { CanvasMenu } from '../canvas/context-menu';
import { SidePanel } from './side-panel';
import { ExportDialog } from './export-dialog';
import { IconButton } from '../components/ui';

interface EditorProps {
  id: string;
  workspaces: Workspace[];
  onSelect: (id: string) => void;
}
export function Editor({ id, workspaces, onSelect }: EditorProps) {
  const state = useEditor(id);
  const fullscreen = useFullscreen();
  const {
    ref: videoRef,
    active: videoFullscreen,
    toggle: toggleVideoFullscreen,
  } = useVideoFullscreen();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const project = state.project;
  if (!project)
    return (
      <div className="app-loading">
        <span className="loading-dot" />
        <p>{state.error || 'Opening video…'}</p>
      </div>
    );
  const document = project.revision.document;
  const comparison = state.comparison;
  async function drop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    state.control.current?.pause();
    state.setPanel('assets');
    try {
      for (const file of Array.from(event.dataTransfer.files)) await state.upload(file);
    } catch (error) {
      state.setError(error instanceof Error ? error.message : 'Import failed.');
    }
  }
  return (
    <main
      style={{ '--frame-ratio': document.width / document.height } as React.CSSProperties}
      className={`editor-shell ${fullscreen.focused ? 'is-focus-mode' : ''} ${state.playing ? 'is-playing' : ''} ${comparison ? 'is-comparing' : ''}`}
      onPointerDown={(event) => {
        if (
          !(event.target as Element).closest(
            'button,input,textarea,select,.chat-dock,.side-panel,.timeline-navigation,.element-timeline,.stage-section,.context-tools,.text-selection,.canvas-menu',
          )
        )
          state.clearSelection();
      }}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDropCapture={() => {
        dragDepth.current = 0;
        setDragging(false);
      }}
      onDrop={(event) => void drop(event)}
    >
      <Header
        project={project}
        workspaces={workspaces}
        saving={state.saving}
        onTravel={(direction) => void state.travel(direction)}
        onExport={() => state.setExporting(true)}
        historyOpen={state.panel === 'history'}
        onHistory={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          state.setPanelAnchor({
            left: rect.right - 335,
            top: rect.bottom + 10,
            bottom: rect.bottom + 10,
          });
          state.setChatOpen(false);
          state.setPanel(state.panel === 'history' ? null : 'history');
        }}
        onSelect={onSelect}
      />
      {state.error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={15} />
          <span>{state.error}</span>
          <IconButton label="Dismiss error" onClick={() => state.setError('')}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <section
        ref={videoRef}
        className={`viewing-space ${videoFullscreen ? 'video-fullscreen' : ''}`}
        aria-label="Video canvas"
      >
        {comparison && (
          <div className="comparison-bar">
            <Columns2 size={15} />
            <span>{comparison.label}</span>
            <IconButton label="Close comparison" onClick={() => state.setComparison(null)}>
              <X size={15} />
            </IconButton>
          </div>
        )}
        <div className={`preview-grid ${comparison ? 'comparing' : ''}`} inert={videoFullscreen}>
          {comparison && (
            <div className="comparison-column">
              <span className="compare-label">Earlier</span>
              <PlayerStage
                workspaceId={id}
                revisionId={comparison.id}
                document={comparison.document}
                time={state.time}
                selectedId={null}
                marking={false}
                region={null}
                onTime={() => undefined}
                onPlaying={() => undefined}
                onSelect={() => undefined}
                onNote={() => undefined}
                control={state.compareControl}
                compare
              />
            </div>
          )}
          <div className="current-column">
            {comparison && <span className="compare-label">Current</span>}
            <PlayerStage
              workspaceId={id}
              revisionId={project.revisionId}
              document={document}
              time={state.time}
              selectedId={state.selectedId}
              marking={state.marking}
              region={state.region}
              onTime={state.onTime}
              onPlaying={state.setPlaying}
              muted={state.muted}
              onSelect={state.select}
              onNote={state.openNotes}
              onDisplayed={state.setDisplayedRevision}
              onTextRestore={state.setCanvasText}
              onTextSelect={state.selectText}
              onTextEdit={state.updateText}
              onClear={state.clearSelection}
              onArea={(region, active, point) => {
                state.setNotePoint(point ?? null);
                state.setRegion(region);
                state.setMarking(active);
              }}
              onContext={state.setContextMenu}
              control={state.control}
            />
            <SelectionBox state={state} />
            <ContextTools state={state} />
          </div>
        </div>
        {videoFullscreen && (
          <PlaybackScrubber
            clock={state.clock}
            duration={durationOf(document)}
            fps={document.fps}
            onSeek={(time) => state.seek(time, true)}
            onPlay={state.togglePlay}
          />
        )}
        <Transport
          time={state.time}
          duration={durationOf(document)}
          fps={document.fps}
          playing={state.playing}
          onPlay={state.togglePlay}
          clock={state.clock}
          muted={state.muted}
          onMute={state.toggleMute}
          fullscreen={videoFullscreen}
          onFullscreen={() => void toggleVideoFullscreen()}
        />
        <section className="collaboration-space" aria-label="Video timeline">
          <TimelineDock state={state} />
        </section>
      </section>
      <ToolIsland
        state={state}
        fullscreen={fullscreen.active}
        onFullscreen={() => void fullscreen.toggle()}
      />
      <ChatDock state={state} />
      <CanvasMenu state={state} />
      {!state.contextMenu &&
        !state.chatOpen &&
        !state.marking &&
        state.notePoint &&
        (state.region || state.range) && (
          <NotePopover point={state.notePoint} onNote={state.openNotes} />
        )}
      <SidePanel state={state} />
      {dragging && (
        <div className="drop-overlay">
          <Upload size={28} />
          <span>Drop to add to this video</span>
        </div>
      )}
      {state.exporting && (
        <ExportDialog project={project} onClose={() => state.setExporting(false)} />
      )}
    </main>
  );
}
