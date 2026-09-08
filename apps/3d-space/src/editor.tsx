import {
  AgentConnection,
  Composer,
  EditorHeader,
  FloatingPanel,
  IconButton,
  Modal,
  ToolIsland,
  anchorBeside,
  anchorBelow,
  useFullscreen,
  type FloatingAnchor,
} from '@codex-ux/editor-ui';
import { LibraryBrowser } from '@codex-ux/library-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { BrowserAppInstance } from '@codex-ux/sdk';
import type { Workspace } from '@codex-ux/protocol';
import {
  ArrowUp,
  MessageCircle,
  Maximize,
  ArrowLeft,
  Box,
  Circle,
  CircleDot,
  Compass,
  Cylinder,
  Focus,
  FolderOpen,
  HelpCircle,
  LoaderCircle,
  Minus,
  Move,
  MoveVertical,
  Pin,
  Plus,
  RotateCw,
  Scaling,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useScene } from './use-scene';
import { dropFiles, errorMessage } from './api';

type Panel = 'add' | 'search' | 'history' | 'notes' | 'help' | null;
export function Editor({
  id,
  instance,
  workspaces,
  onSelect,
}: {
  id: string;
  instance: BrowserAppInstance;
  workspaces: Workspace[];
  onSelect: (id: string) => void;
}) {
  const [candidate] = useState(() => new URLSearchParams(location.search).get('candidate'));
  const { host, markers, viewport, ...s } = useScene(id, instance, candidate);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'agent' | 'library' | null>(null);
  const [pendingSend, setPendingSend] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [chatAnchor, setChatAnchor] = useState<FloatingAnchor | null>({
    left: 74,
    top: 180,
    bottom: 180,
    placement: 'beside',
  });
  const [panelAnchor, setPanelAnchor] = useState<FloatingAnchor | null>({
    left: 24,
    top: 90,
    bottom: 90,
  });
  const fullscreen = useFullscreen();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));
  const keyboard = useEffectEvent((event: KeyboardEvent) => {
    const typing =
      event.target instanceof HTMLElement &&
      !!event.target.closest('input,textarea,[contenteditable=true]');
    if (
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('dialog'))
    )
      return;
    if (event.key === 'Escape') {
      setPanel(null);
      s.setAnnotating(false);
      s.setChatOpen(false);
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setPanel('search');
    }
    if (
      !typing &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'z' &&
      !candidate
    ) {
      event.preventDefault();
      void s.travel(event.shiftKey ? 'redo' : 'undo');
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyboard(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  async function send() {
    if (attaching || !s.editable || !s.text.trim()) return;
    if (!s.session && !s.checkingDelivery) {
      setModal('agent');
      setPendingSend(true);
      return;
    }
    await s.send().catch((error: unknown) => s.setError(errorMessage(error)));
  }
  const stateLabel =
    s.busy ||
    (s.project?.source.error
      ? 'Update needs attention'
      : s.project?.source.pending
        ? 'Preparing update'
        : s.displayed && s.displayed === s.project?.revisionId
          ? 'Saved locally'
          : s.project && s.displayed
            ? 'Showing previous space'
            : 'Opening space');
  const objects = s.objects.filter((object) =>
    object.label.toLowerCase().includes(query.toLowerCase()),
  );
  const frameLabel =
    s.tool === 'move'
      ? 'Drag to move · use ↕ to lift'
      : s.tool === 'rotate'
        ? 'Drag left or right to turn'
        : 'Drag outward to make it bigger';
  return (
    <main
      className={`scene-app${s.preview ? ' is-exploring' : ''}${s.annotating ? ' is-annotating' : ''}${fullscreen.focused ? ' is-focus-mode' : ''}`}
      onDragEnter={(event) => {
        if ((event.target as Element).closest('.chat-popover,dialog')) {
          dragDepth.current = 0;
          setDragging(false);
          return;
        }
        if (event.dataTransfer.types.includes('Files') && !candidate) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if ((event.target as Element).closest('.chat-popover,dialog')) return;
        if (event.dataTransfer.types.includes('Files') && !candidate) {
          event.preventDefault();
          event.dataTransfer.dropEffect = s.editable ? 'copy' : 'none';
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDropCapture={() => {
        dragDepth.current = 0;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!s.editable || (event.target as Element).closest('.chat-popover,dialog')) return;
        const position = viewport.current?.insertionPoint(event.clientX, event.clientY) ?? [
          0, 0, 0,
        ];
        void dropFiles(event.dataTransfer)
          .then((files) => s.importFiles(files, position))
          .catch((error: unknown) => s.setError(errorMessage(error)));
      }}
    >
      <div ref={host} className="scene-canvas" data-testid="scene-viewport" />
      <div ref={markers} className="scene-markers" />
      <EditorHeader
        homeHref="/apps/3d-space/"
        name="3D Space"
        icon={<Box size={19} />}
        workspaceId={id}
        workspaces={workspaces}
        onSelect={onSelect}
        status={candidate ? 'Candidate preview' : stateLabel}
        canUndo={!!s.project?.canUndo}
        canRedo={!!s.project?.canRedo}
        busy={!!s.busy}
        onTravel={(direction) => void s.travel(direction)}
        historyOpen={panel === 'history'}
        onHistory={(event) => {
          setPanelAnchor(anchorBelow(event.currentTarget));
          toggle('history');
        }}
        onLibrary={() => setModal('library')}
        onAgent={() => setModal('agent')}
        connected={!!s.session}
        overlay
        readOnly={!!candidate}
      >
        <IconButton
          label="Find an object"
          className={panel === 'search' ? 'active' : ''}
          onClick={(event) => {
            setPanelAnchor(anchorBelow(event.currentTarget));
            toggle('search');
          }}
        >
          <Search size={17} />
        </IconButton>
        <button
          className={`export-button${s.preview ? ' active' : ''}`}
          onClick={() => {
            s.setPreview(!s.preview);
            setPanel(null);
          }}
        >
          <Compass size={16} />
          <span>{s.preview ? 'Back to edit' : 'Explore'}</span>
        </button>
      </EditorHeader>
      {candidate && (
        <a className="candidate-banner glass" href={`/apps/3d-space/w/${id}`}>
          <ArrowLeft size={14} /> Read-only agent preview <span>Return to saved space</span>
        </a>
      )}
      {!s.displayed && !s.error && (
        <div className="scene-opening">
          <LoaderCircle className="spin" size={22} />
          <span>Opening your space…</span>
        </div>
      )}
      {s.preview && (
        <div className="explore-caption">
          Look around. Make yourself at home.
          <small>Drag to look · scroll to zoom · WASD to travel</small>
        </div>
      )}
      <nav className="view-tools glass" aria-label="Space navigation">
        <IconButton label="Zoom in" onClick={() => viewport.current?.zoom('in')}>
          <Plus size={17} />
        </IconButton>
        <IconButton label="Zoom out" onClick={() => viewport.current?.zoom('out')}>
          <Minus size={17} />
        </IconButton>
        <span className="tool-divider" />
        <IconButton label="Show whole space" onClick={() => viewport.current?.focus(null)}>
          <Focus size={17} />
        </IconButton>
        {candidate && (
          <IconButton
            label={fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={() => void fullscreen.toggle()}
          >
            <Maximize size={17} />
          </IconButton>
        )}
        {!candidate && !s.preview && (
          <>
            <span className="tool-divider" />
            <IconButton
              label="Add to space"
              active={panel === 'add'}
              disabled={!s.editable}
              onClick={() => {
                setPanelAnchor({ left: 80, top: 300, bottom: 300 });
                toggle('add');
              }}
            >
              <Box size={17} />
            </IconButton>
            <IconButton
              label="Annotate a place"
              active={s.annotating}
              disabled={!s.editable}
              onClick={() => s.setAnnotating(!s.annotating)}
            >
              <Pin size={17} />
            </IconButton>
          </>
        )}
      </nav>
      <div className="corner-tools">
        <IconButton label="How to explore" active={panel === 'help'} onClick={() => toggle('help')}>
          <HelpCircle size={17} />
        </IconButton>
      </div>
      {!s.preview && !candidate && (
        <div className="scene-bottom">
          {s.selected && (
            <div className="selection-wrap">
              <div className="selection-toolbar glass" role="toolbar" aria-label="Object tools">
                <span className="selection-name">
                  <span className="selection-dot" />
                  {s.selected.label}
                </span>
                <div className="transform-tools">
                  <button
                    aria-label="Move object"
                    aria-pressed={s.tool === 'move'}
                    className={s.tool === 'move' ? 'active' : ''}
                    disabled={!s.editable}
                    onClick={() => s.setTool('move')}
                  >
                    <Move size={15} />
                    <span>Move</span>
                  </button>
                  <button
                    aria-label="Rotate object"
                    aria-pressed={s.tool === 'rotate'}
                    className={s.tool === 'rotate' ? 'active' : ''}
                    disabled={!s.editable}
                    onClick={() => s.setTool('rotate')}
                  >
                    <RotateCw size={15} />
                    <span>Rotate</span>
                  </button>
                  <button
                    aria-label="Resize object"
                    aria-pressed={s.tool === 'scale'}
                    className={s.tool === 'scale' ? 'active' : ''}
                    disabled={!s.editable}
                    onClick={() => s.setTool('scale')}
                  >
                    <Scaling size={15} />
                    <span>Size</span>
                  </button>
                </div>
                <button
                  className="icon-button lift-handle"
                  title="Drag up or down to lift"
                  aria-label="Raise or lower object"
                  disabled={!s.editable}
                  onPointerDown={(event) => viewport.current?.startLift(event.nativeEvent)}
                >
                  <MoveVertical size={16} />
                </button>
                <IconButton
                  label="Focus selected object"
                  onClick={() => viewport.current?.focus(s.selected?.id ?? null)}
                >
                  <Focus size={16} />
                </IconButton>
                <IconButton
                  label="Ask agent about selection"
                  disabled={!s.editable}
                  onClick={() => s.openChat()}
                >
                  <MessageCircle size={16} />
                </IconButton>
                <IconButton
                  label="Remove selected object"
                  disabled={!s.editable}
                  onClick={() => {
                    if (s.selected)
                      void s.save({ type: 'remove', objectId: s.selected.id }, 'Removed object');
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
              <span className="gesture-hint">{frameLabel}</span>
            </div>
          )}
          {s.annotating && (
            <div className="annotation-hint glass">
              <Pin size={14} /> Click a place in the space to leave a note.
              <button aria-label="Cancel annotation" onClick={() => s.setAnnotating(false)}>
                <X size={14} />
              </button>
            </div>
          )}
          {s.anchor && !s.annotating && (
            <button className="secondary-button" onClick={() => s.openChat()}>
              Ask agent about this place
            </button>
          )}
        </div>
      )}
      {!candidate && (
        <>
          <ToolIsland
            storageKey="3d-space:tool-position"
            chatOpen={s.chatOpen && !s.preview}
            notesOpen={panel === 'notes'}
            hasNotes={!!s.project?.document.annotations.length}
            fullscreen={fullscreen.active}
            onFullscreen={() => void fullscreen.toggle()}
            onChat={(event) => {
              if (s.chatOpen) s.setChatOpen(false);
              else {
                s.setPreview(false);
                setChatAnchor(anchorBeside(event.currentTarget));
                s.openChat();
              }
            }}
            onNotes={(event) => {
              setPanelAnchor(anchorBeside(event.currentTarget));
              toggle('notes');
            }}
          />
          <FloatingPanel
            open={s.chatOpen && !s.preview}
            anchor={chatAnchor}
            title="Chat"
            className="chat-popover"
            closeLabel="Close chat"
            onClose={() => s.setChatOpen(false)}
          >
            <Composer
              library={s.library}
              value={s.text}
              attachments={s.attachments}
              label="Chat message"
              placeholder="What would you like to change? Use @ to reference a file."
              active={s.chatOpen && !s.preview && !modal}
              disabled={!!s.busy || s.checkingDelivery}
              onBusy={setAttaching}
              onChange={(text, refs) => {
                if (!s.draft) s.openChat();
                s.setText(text);
                s.setAttachments(refs);
              }}
              onFocus={() => {
                if (!s.draft) s.openChat();
              }}
              onManage={() => setModal('library')}
              onSubmit={() => void send()}
              context={
                <div className="composer-context">
                  <span className="context-chip">
                    <Pin size={12} />
                    {s.draft?.label ?? (s.editable ? 'Scene view' : 'Waiting for the scene…')}
                  </span>
                  <button
                    className="text-button"
                    disabled={!s.editable || s.checkingDelivery}
                    onClick={s.useCurrentView}
                  >
                    Use current view
                  </button>
                  {!!s.attachments.length && (
                    <span className="field-help">
                      Attachments are sent with messages. Spatial annotations contain text.
                    </span>
                  )}
                </div>
              }
              secondaryAction={
                <button
                  className="secondary-button"
                  disabled={
                    !s.editable ||
                    attaching ||
                    !s.text.trim() ||
                    !s.draft?.feedback.anchor ||
                    !!s.attachments.length ||
                    s.checkingDelivery
                  }
                  onClick={() => void s.pin()}
                >
                  Pin note
                </button>
              }
              primaryAction={
                <button
                  className="primary-button"
                  disabled={!s.editable || attaching || !s.text.trim()}
                  onClick={() => void send()}
                >
                  <ArrowUp size={15} />
                  {s.checkingDelivery ? 'Check delivery' : 'Send now'}
                </button>
              }
              error={s.chatOpen && !s.preview ? s.error : undefined}
            />
          </FloatingPanel>
        </>
      )}
      {modal && (
        <Modal
          title={modal === 'library' ? 'Library' : 'Agent connection'}
          onClose={() => {
            setModal(null);
            setPendingSend(false);
          }}
        >
          {modal === 'library' ? (
            <LibraryBrowser library={s.library} />
          ) : (
            <AgentConnection
              session={s.session}
              pairing={s.pairing}
              onPair={s.pair}
              error={s.bindingError}
              onBind={(sessionId) => {
                try {
                  instance.bind(id, sessionId ? { provider: 'codex', sessionId } : null);
                  s.setBindingError('');
                } catch (error) {
                  s.setBindingError(errorMessage(error));
                }
              }}
              pendingSend={pendingSend}
              sending={!!s.busy}
              onContinue={() => {
                setModal(null);
                setPendingSend(false);
                void send();
              }}
            />
          )}
        </Modal>
      )}
      {((s.error && (!s.chatOpen || s.preview)) || s.project?.source.error || s.notice) && (
        <div
          className={`scene-toast glass${s.error || s.project?.source.error ? ' has-error' : ''}`}
          role={s.error || s.project?.source.error ? 'alert' : 'status'}
        >
          <div>
            {s.error || s.project?.source.error ? (
              <>
                <strong>
                  {s.project?.source.error
                    ? 'Your last saved space is still here.'
                    : 'Something needs attention.'}
                </strong>
                <p>{s.error || s.project?.source.error}</p>
              </>
            ) : (
              <span>{s.notice}</span>
            )}
          </div>
          <button
            aria-label="Dismiss message"
            onClick={() => {
              s.setError('');
              s.setNotice('');
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <FloatingPanel
        open={!!panel}
        anchor={panelAnchor}
        title={
          panel === 'add'
            ? 'Add to space'
            : panel === 'search'
              ? 'Find an object'
              : panel === 'history'
                ? 'History'
                : panel === 'notes'
                  ? 'Spatial annotations'
                  : 'How to explore'
        }
        onClose={() => setPanel(null)}
        className="scene-panel"
      >
        {panel === 'add' && (
          <>
            <button
              className="menu-row"
              onClick={() => {
                fileInput.current?.click();
                setPanel(null);
              }}
            >
              <Upload size={18} />
              <span>
                Import models<small>GLB, FBX, OBJ and more</small>
              </span>
            </button>
            <button
              className="menu-row"
              onClick={() => {
                folderInput.current?.click();
                setPanel(null);
              }}
            >
              <FolderOpen size={18} />
              <span>
                Import a folder<small>Keep the model and its textures together</small>
              </span>
            </button>
            <div className="panel-rule" />
            <p className="section-caption">OR START WITH A SHAPE</p>
            <div className="shape-grid">
              {(
                [
                  { shape: 'box', label: 'Block', icon: Box },
                  { shape: 'sphere', label: 'Sphere', icon: Circle },
                  { shape: 'cylinder', label: 'Cylinder', icon: Cylinder },
                  { shape: 'torus', label: 'Ring', icon: CircleDot },
                ] as const
              ).map(({ shape, label, icon: Icon }) => (
                <button
                  key={shape}
                  onClick={() => {
                    s.add(shape);
                    setPanel(null);
                  }}
                >
                  <Icon size={25} strokeWidth={1.3} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <p className="panel-caption">You can also drop model files anywhere in the space.</p>
          </>
        )}
        {panel === 'search' && (
          <>
            <label className="search-field">
              <Search size={16} />
              <input
                autoFocus
                placeholder="Search your space…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="panel-list">
              {objects.map((object) => (
                <button
                  className="menu-row"
                  key={object.id}
                  onClick={() => {
                    viewport.current?.select(object.id);
                    viewport.current?.focus(object.id);
                    setPanel(null);
                  }}
                >
                  <Box size={16} />
                  <span>{object.label}</span>
                  <Focus size={14} />
                </button>
              ))}
              {!objects.length && <p className="panel-caption">No objects found.</p>}
            </div>
          </>
        )}
        {panel === 'history' && (
          <div className="panel-list">
            {s.project?.history.map((revision) => (
              <div className="menu-row history-row" key={revision.id}>
                <span className="history-dot" />
                <span>
                  {revision.label}
                  <small>
                    {revision.author === 'agent' ? 'Agent' : 'You'} ·{' '}
                    {new Date(revision.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </span>
                {revision.id === s.project?.revisionId ? (
                  <span className="current-badge">Current</span>
                ) : (
                  <button
                    className="secondary-button"
                    disabled={!!s.busy}
                    onClick={() => {
                      void s.travel('undo', revision.id);
                      setPanel(null);
                    }}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {panel === 'history' && !!s.requests.length && (
          <div className="panel-list">
            <p className="section-caption">AGENT REQUESTS</p>
            {s.requests.map((request) => (
              <div key={request.id} className="request-row">
                <p>{request.text}</p>
                <small>{request.state}</small>
                {request.error && <p className="inline-error">{request.error}</p>}
              </div>
            ))}
          </div>
        )}
        {panel === 'notes' && (
          <div className="panel-list">
            {!s.project?.document.annotations.length && (
              <p className="panel-caption">
                No spatial annotations yet. Mark a place, open Chat, and pin a note.
              </p>
            )}
            {s.project?.document.annotations.map((note, index) => (
              <div className="note-row" key={note.id}>
                <button
                  onClick={() => {
                    viewport.current?.goTo(note.anchor.camera);
                    s.setAnchor({ ...note.anchor, revisionId: s.project!.revisionId });
                    s.setNotice(note.text);
                    setPanel(null);
                  }}
                >
                  <span className="note-number">{index + 1}</span>
                  <span>
                    {note.text}
                    {note.anchor.objectId &&
                      !s.objects.some((object) => object.id === note.anchor.objectId) && (
                        <small>The original object is no longer visible</small>
                      )}
                  </span>
                </button>
                <IconButton
                  label="Remove annotation"
                  disabled={!s.editable}
                  onClick={() => {
                    void s.save({ type: 'remove-annotation', id: note.id }, 'Removed annotation');
                  }}
                >
                  <X size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        {panel === 'help' && (
          <>
            <div className="gesture-list">
              <p>
                <span>Look around</span>
                <span>Drag empty space</span>
              </p>
              <p>
                <span>Get closer</span>
                <span>Scroll or pinch</span>
              </p>
              <p>
                <span>Pan your view</span>
                <span>Right-drag or two fingers</span>
              </p>
              <p>
                <span>Move something</span>
                <span>Select, then drag</span>
              </p>
              <p>
                <span>Take a closer look</span>
                <span>Double-click an object</span>
              </p>
              <p>
                <span>Find something</span>
                <kbd>⌘ / Ctrl K</kbd>
              </p>
              <p>
                <span>Undo a change</span>
                <kbd>⌘ / Ctrl Z</kbd>
              </p>
            </div>
            <p className="panel-caption">
              In Explore, click the space and use WASD to travel, Q / E to move down or up. Press
              Escape to cancel a drag.
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                try {
                  const image = viewport.current?.capture();
                  if (image) {
                    const link = document.createElement('a');
                    link.href = image;
                    link.download = '3d-space.png';
                    link.click();
                  }
                } catch (error) {
                  s.setError(errorMessage(error));
                }
              }}
            >
              Save a picture
            </button>
          </>
        )}
      </FloatingPanel>
      {s.requests.some(
        (request) => request.state === 'delivery-unknown' || request.state === 'failed',
      ) &&
        !s.error && (
          <button
            className="request-warning glass"
            onClick={() =>
              s.setError(
                s.requests.find(
                  (request) => request.state === 'delivery-unknown' || request.state === 'failed',
                )?.error ?? 'Check your agent task before sending again.',
              )
            }
          >
            An agent request needs attention
          </button>
        )}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card glass">
            <Upload size={28} strokeWidth={1.4} />
            <h2>Bring it into your world</h2>
            <p>Drop models with their textures</p>
          </div>
        </div>
      )}
      <input
        ref={fileInput}
        data-testid="model-files"
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files)
            void s.importFiles(
              [...event.target.files].map((file) => ({
                file,
                path: file.webkitRelativePath || file.name,
              })),
              viewport.current?.insertionPoint() ?? [0, 0, 0],
            );
          event.target.value = '';
        }}
      />
      <input
        ref={(input) => {
          folderInput.current = input;
          input?.setAttribute('webkitdirectory', '');
        }}
        data-testid="model-folder"
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files)
            void s.importFiles(
              [...event.target.files].map((file) => ({
                file,
                path: file.webkitRelativePath || file.name,
              })),
              viewport.current?.insertionPoint() ?? [0, 0, 0],
            );
          event.target.value = '';
        }}
      />
    </main>
  );
}
