import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import type { BrowserAppInstance } from '@codex-ux/sdk';
import type { Workspace } from '@codex-ux/protocol';
import {
  ArrowUp,
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  Circle,
  CircleDot,
  Compass,
  Copy,
  Cylinder,
  Focus,
  FolderOpen,
  HelpCircle,
  History,
  Link2,
  LoaderCircle,
  Maximize,
  Minus,
  Move,
  MoveVertical,
  Pin,
  Plus,
  Redo2,
  RotateCw,
  Scaling,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { useScene } from './use-scene';
import { dropFiles, errorMessage } from './api';

type Panel = 'add' | 'search' | 'connect' | 'history' | 'notes' | 'help' | 'workspaces' | null;
function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`icon-button${active ? ' active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Editor({
  id,
  instance,
  workspaces,
  onSelect,
  onLeave,
}: {
  id: string;
  instance: BrowserAppInstance;
  workspaces: Workspace[];
  onSelect: (id: string) => void;
  onLeave: () => void;
}) {
  const [candidate] = useState(() => new URLSearchParams(location.search).get('candidate'));
  const { host, markers, viewport, composer, ...s } = useScene(id, instance, candidate);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [task, setTask] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const currentWorkspace = workspaces.find((workspace) => workspace.id === id);
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));
  const keyboard = useEffectEvent((event: KeyboardEvent) => {
    const typing =
      event.target instanceof HTMLElement &&
      !!event.target.closest('input,textarea,[contenteditable=true]');
    if (event.key === 'Escape') {
      setPanel(null);
      s.setAnnotating(false);
      s.setAnchor(null);
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
    if (!s.session) {
      setPanel('connect');
      await s.pair();
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
      className={`scene-app${s.preview ? ' is-exploring' : ''}${s.annotating ? ' is-annotating' : ''}`}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files') && !candidate) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files') && !candidate) {
          event.preventDefault();
          event.dataTransfer.dropEffect = s.editable ? 'copy' : 'none';
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!s.editable) return;
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
      <header className="scene-header">
        <div className="scene-brand">
          <Box size={19} strokeWidth={1.65} />
          <span>3D Space</span>
          <span className="brand-divider" />
          <button
            className="workspace-trigger"
            onClick={() => toggle('workspaces')}
            aria-expanded={panel === 'workspaces'}
          >
            {currentWorkspace?.name ?? 'Workspace'}
            <ChevronDown size={13} />
          </button>
        </div>
        <div className="scene-status" role="status">
          {s.busy || !s.displayed || s.project?.source.pending ? (
            <LoaderCircle size={12} className="spin" />
          ) : (
            <span className={`status-dot${s.project?.source.error ? ' attention' : ''}`} />
          )}
          {candidate ? 'Candidate preview' : stateLabel}
        </div>
        <div className="header-actions">
          {!candidate && (
            <div className="undo-actions">
              <ToolButton
                label="Undo"
                disabled={!s.project?.canUndo || !!s.busy}
                onClick={() => {
                  void s.travel('undo');
                }}
              >
                <Undo2 size={17} />
              </ToolButton>
              <ToolButton
                label="Redo"
                disabled={!s.project?.canRedo || !!s.busy}
                onClick={() => {
                  void s.travel('redo');
                }}
              >
                <Redo2 size={17} />
              </ToolButton>
            </div>
          )}
          <ToolButton
            label="Find an object"
            active={panel === 'search'}
            onClick={() => toggle('search')}
          >
            <Search size={17} />
          </ToolButton>
          <button
            className={`explore-button${s.preview ? ' active' : ''}`}
            onClick={() => {
              s.setPreview(!s.preview);
              setPanel(null);
            }}
          >
            <Compass size={16} />
            <span>{s.preview ? 'Back to edit' : 'Explore'}</span>
          </button>
        </div>
      </header>
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
        <ToolButton label="Zoom in" onClick={() => viewport.current?.zoom('in')}>
          <Plus size={17} />
        </ToolButton>
        <ToolButton label="Zoom out" onClick={() => viewport.current?.zoom('out')}>
          <Minus size={17} />
        </ToolButton>
        <span className="tool-divider" />
        <ToolButton label="Show whole space" onClick={() => viewport.current?.focus(null)}>
          <Focus size={17} />
        </ToolButton>
        <ToolButton
          label="Fullscreen"
          onClick={() => {
            void (
              document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen()
            ).catch((error: unknown) => s.setError(errorMessage(error)));
          }}
        >
          <Maximize size={16} />
        </ToolButton>
      </nav>
      <div className="corner-tools">
        {!candidate && (
          <ToolButton
            label="Version history"
            active={panel === 'history'}
            onClick={() => toggle('history')}
          >
            <History size={17} />
          </ToolButton>
        )}
        <ToolButton label="How to explore" active={panel === 'help'} onClick={() => toggle('help')}>
          <HelpCircle size={17} />
        </ToolButton>
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
                <ToolButton
                  label="Focus selected object"
                  onClick={() => viewport.current?.focus(s.selected?.id ?? null)}
                >
                  <Focus size={16} />
                </ToolButton>
                <ToolButton
                  label="Remove selected object"
                  disabled={!s.editable}
                  onClick={() => {
                    if (s.selected)
                      void s.save({ type: 'remove', objectId: s.selected.id }, 'Removed object');
                  }}
                >
                  <Trash2 size={15} />
                </ToolButton>
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
          <form
            className="scene-composer glass"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {(s.anchor || s.selected) && (
              <div className="context-row">
                <span className="context-chip">
                  <Pin size={12} />
                  {s.anchor ? 'Pinned place' : s.selected?.label}
                  <button
                    type="button"
                    aria-label="Clear context"
                    onClick={() => {
                      s.setAnchor(null);
                      viewport.current?.select(null);
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
                <span className="context-description">Your agent will see this in context</span>
              </div>
            )}
            <textarea
              ref={composer}
              rows={1}
              aria-label="Message your agent"
              placeholder={
                s.anchor
                  ? 'What would you change here?'
                  : s.selected
                    ? 'What would you like to do with this?'
                    : 'What would you like to create?'
              }
              value={s.text}
              maxLength={4000}
              onChange={(event) => {
                s.setText(event.target.value);
                event.target.style.height = 'auto';
                event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (s.editable && s.text.trim()) void send();
                }
              }}
            />
            <div className="composer-footer">
              <div className="composer-tools">
                <button
                  type="button"
                  className={`icon-button${panel === 'add' ? ' active' : ''}`}
                  aria-label="Add to space"
                  title="Add to space"
                  disabled={!s.editable}
                  onClick={() => toggle('add')}
                >
                  <Plus size={19} />
                </button>
                <button
                  type="button"
                  className={`icon-button${s.annotating ? ' active' : ''}`}
                  aria-label="Annotate a place"
                  title="Annotate a place"
                  disabled={!s.editable}
                  onClick={() => {
                    s.setAnnotating(!s.annotating);
                    setPanel(null);
                  }}
                >
                  <Pin size={17} />
                </button>
                {!!s.project?.document.annotations.length && (
                  <button
                    type="button"
                    className={`notes-count${panel === 'notes' ? ' active' : ''}`}
                    onClick={() => toggle('notes')}
                  >
                    {s.project.document.annotations.length}{' '}
                    {s.project.document.annotations.length === 1 ? 'note' : 'notes'}
                  </button>
                )}
                <span className="composer-divider" />
                <button
                  type="button"
                  className={`connection-trigger${s.session ? ' connected' : ''}`}
                  onClick={() => {
                    toggle('connect');
                    if (!s.session && panel !== 'connect') void s.pair();
                  }}
                >
                  <span className="connection-dot" />
                  <span>{s.session ? 'Agent connected' : 'Connect agent'}</span>
                </button>
              </div>
              <div className="send-tools">
                {(s.anchor || s.selected) && !!s.text.trim() && (
                  <button
                    type="button"
                    className="pin-note-button"
                    disabled={!s.editable}
                    onClick={() => {
                      void s.pin();
                    }}
                  >
                    Pin note
                  </button>
                )}
                <button
                  className="send-button"
                  title="Send to agent"
                  aria-label="Send to agent"
                  disabled={!s.text.trim() || !s.editable}
                >
                  {s.busy === 'Sending' ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <ArrowUp size={19} />
                  )}
                </button>
              </div>
            </div>
          </form>
          {!s.selected && !s.annotating && (
            <div className="scene-bottom-hint">
              Drag to look around <span>·</span> Scroll to get closer <span>·</span> Click something
              to shape it
            </div>
          )}
        </div>
      )}
      {(s.error || s.project?.source.error || s.notice) && (
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
      {panel && (
        <>
          <button
            className="panel-dismiss"
            aria-label="Close panel"
            tabIndex={-1}
            onClick={() => setPanel(null)}
          />
          <section
            className={`floating-panel glass panel-${panel}`}
            role="dialog"
            aria-label={
              panel === 'connect'
                ? 'Connect agent'
                : panel === 'search'
                  ? 'Find an object'
                  : panel === 'add'
                    ? 'Add to space'
                    : panel === 'history'
                      ? 'Version history'
                      : panel === 'notes'
                        ? 'Space notes'
                        : panel === 'workspaces'
                          ? 'Workspaces'
                          : 'How to explore'
            }
          >
            <div className="panel-heading">
              <h2>
                {panel === 'connect'
                  ? 'Make room for your agent'
                  : panel === 'search'
                    ? 'Find an object'
                    : panel === 'add'
                      ? 'Add something'
                      : panel === 'history'
                        ? 'Your space, over time'
                        : panel === 'notes'
                          ? 'Notes in this space'
                          : panel === 'workspaces'
                            ? 'Workspaces'
                            : 'A few simple gestures'}
              </h2>
              <button
                className="icon-button"
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <X size={16} />
              </button>
            </div>
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
                <p className="panel-caption">
                  You can also drop model files anywhere in the space.
                </p>
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
            {panel === 'connect' && (
              <>
                {s.session ? (
                  <>
                    <p className="panel-copy">
                      <span className="connected-check">
                        <Check size={15} />
                      </span>{' '}
                      This page is connected to your Codex task.
                    </p>
                    <code className="session-id">{s.session.sessionId}</code>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        instance.bind(id, null);
                      }}
                    >
                      Disconnect this page
                    </button>
                  </>
                ) : (
                  <>
                    <p className="panel-copy">
                      Paste this into your Codex task. The agent can then work with the space you’re
                      looking at.
                    </p>
                    {s.pairing?.state === 'waiting-agent' ? (
                      <button
                        className="connection-code"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(
                              `Connect to my 3D Space app using connection code ${s.pairing!.code}. The local service is at ${location.origin}.`,
                            )
                            .then(() =>
                              s.setNotice(
                                'Connection message copied. Paste it in your Codex task.',
                              ),
                            )
                            .catch((error: unknown) => s.setError(errorMessage(error)));
                        }}
                      >
                        <span>{s.pairing.code}</span>
                        <Copy size={16} />
                      </button>
                    ) : (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          void s.pair();
                        }}
                      >
                        Get connection code
                      </button>
                    )}
                    <div className="panel-rule" />
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const sessionId = /([a-zA-Z0-9-]{10,100})\/?$/.exec(task.trim())?.[1];
                        if (!sessionId) {
                          s.setError('Paste a valid Codex task link or ID.');
                          return;
                        }
                        instance.bind(id, { provider: 'codex', sessionId });
                        setTask('');
                      }}
                    >
                      <label className="field-label" htmlFor="task-link">
                        Or paste an existing task link
                      </label>
                      <div className="inline-input">
                        <input
                          id="task-link"
                          placeholder="Codex task link or ID"
                          value={task}
                          onChange={(event) => setTask(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="icon-button"
                          aria-label="Connect task"
                          disabled={!task.trim()}
                        >
                          <Link2 size={16} />
                        </button>
                      </div>
                    </form>
                  </>
                )}
                <p className="panel-caption">
                  Connecting does not send a message. You choose when to send.
                </p>
              </>
            )}
            {panel === 'history' && (
              <div className="panel-list">
                {s.project?.history.map((revision) => (
                  <button
                    className="menu-row history-row"
                    key={revision.id}
                    disabled={!!s.busy || revision.id === s.project?.revisionId}
                    onClick={() => {
                      void s.travel('undo', revision.id);
                      setPanel(null);
                    }}
                  >
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
                    {revision.id === s.project?.revisionId && (
                      <span className="current-badge">Current</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {panel === 'notes' && (
              <div className="panel-list">
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
                    <ToolButton
                      label="Remove annotation"
                      disabled={!s.editable}
                      onClick={() => {
                        void s.save(
                          { type: 'remove-annotation', id: note.id },
                          'Removed annotation',
                        );
                      }}
                    >
                      <X size={13} />
                    </ToolButton>
                  </div>
                ))}
              </div>
            )}
            {panel === 'workspaces' && (
              <>
                <div className="panel-list">
                  {workspaces.map((workspace) => (
                    <button
                      className="menu-row"
                      key={workspace.id}
                      onClick={() => {
                        onSelect(workspace.id);
                        setPanel(null);
                      }}
                    >
                      <FolderOpen size={16} />
                      <span>{workspace.name}</span>
                      {workspace.id === id && <Check size={14} />}
                    </button>
                  ))}
                </div>
                <div className="panel-rule" />
                <button className="menu-row" onClick={onLeave}>
                  <Plus size={16} />
                  <span>New workspace</span>
                </button>
              </>
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
                  In Explore, click the space and use WASD to travel, Q / E to move down or up.
                  Press Escape to cancel a drag.
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
          </section>
        </>
      )}
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
