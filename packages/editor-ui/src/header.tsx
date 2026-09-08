import type { ReactNode, MouseEvent } from 'react';
import type { Workspace } from '@codex-ux/protocol';
import { Bot, History, Undo2, Redo2 } from 'lucide-react';
import { LibraryIcon } from '@codex-ux/library-react';
import { IconButton } from './ui';
import { WorkspaceMenu } from './workspace-menu';

export function EditorHeader({
  name,
  homeHref,
  icon,
  workspaceId,
  workspaces,
  onSelect,
  status,
  canUndo,
  canRedo,
  busy,
  onTravel,
  onHistory,
  historyOpen,
  onLibrary,
  onAgent,
  connected,
  children,
  overlay = false,
  readOnly = false,
}: {
  name: string;
  homeHref: string;
  icon: ReactNode;
  workspaceId: string;
  workspaces: Workspace[];
  onSelect: (id: string) => void;
  status: string;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  onTravel: (direction: 'undo' | 'redo') => void;
  onHistory: (event: MouseEvent<HTMLButtonElement>) => void;
  historyOpen: boolean;
  onLibrary: () => void;
  onAgent: () => void;
  connected: boolean;
  children?: ReactNode;
  overlay?: boolean;
  readOnly?: boolean;
}) {
  return (
    <header className={`app-header${overlay ? ' overlay-header' : ''}`}>
      <div className="header-identity">
        <span className="app-brand" title={name}>
          {icon}
          <span>{name}</span>
        </span>
        <WorkspaceMenu
          current={workspaceId}
          workspaces={workspaces}
          onSelect={onSelect}
          homeHref={homeHref}
        />
        <span className="save-indicator" role="status">
          {status}
        </span>
      </div>
      <div className="header-actions">
        {!readOnly && (
          <>
            <div className="undo-controls">
              <IconButton label="Undo" disabled={busy || !canUndo} onClick={() => onTravel('undo')}>
                <Undo2 size={16} />
              </IconButton>
              <IconButton label="Redo" disabled={busy || !canRedo} onClick={() => onTravel('redo')}>
                <Redo2 size={16} />
              </IconButton>
            </div>
            <IconButton
              label="History"
              className={historyOpen ? 'active' : ''}
              aria-expanded={historyOpen}
              data-panel-trigger
              onClick={onHistory}
            >
              <History size={16} />
            </IconButton>
            <button className="agent-button" aria-label="Library" onClick={onLibrary}>
              <LibraryIcon />
              <span>Library</span>
            </button>
            <button className="agent-button" aria-label="Agent connection" onClick={onAgent}>
              <Bot size={17} />
              <span>Agent</span>
              <i className={`connection-dot ${connected ? 'connected' : ''}`} />
            </button>
          </>
        )}
        {children}
      </div>
    </header>
  );
}
