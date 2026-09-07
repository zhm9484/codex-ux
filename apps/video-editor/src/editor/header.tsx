import { Download, Undo2, Redo2, History } from 'lucide-react';
import type { Workspace, WorkspaceSummary } from '@codex-ux/video-domain';
import { IconButton } from '../components/ui';
import { WorkspaceMenu } from '../components/workspace-menu';
interface HeaderProps {
  workspace: Workspace;
  workspaces: WorkspaceSummary[];
  saving: boolean;
  onTravel: (direction: 'undo' | 'redo') => void;
  onExport: () => void;
  historyOpen: boolean;
  onHistory: (event: React.MouseEvent<HTMLElement>) => void;
  onSelect: (id: string) => void;
}
export function Header(p: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-identity">
        <WorkspaceMenu current={p.workspace.id} workspaces={p.workspaces} onSelect={p.onSelect} />
        <span className="save-indicator" role="status">
          {p.saving ? 'Saving…' : 'Saved locally'}
        </span>
      </div>
      <div className="header-actions">
        <div
          className={`undo-controls ${p.workspace.canUndo || p.workspace.canRedo ? '' : 'empty'}`}
        >
          <IconButton
            label="Undo (⌘Z)"
            disabled={p.saving || !p.workspace.canUndo}
            onClick={() => p.onTravel('undo')}
          >
            <Undo2 size={16} />
          </IconButton>
          <IconButton
            label="Redo (⌘⇧Z)"
            disabled={p.saving || !p.workspace.canRedo}
            onClick={() => p.onTravel('redo')}
          >
            <Redo2 size={16} />
          </IconButton>
        </div>
        <IconButton
          label="History"
          data-panel-trigger
          aria-expanded={p.historyOpen}
          className={p.historyOpen ? 'active' : ''}
          onClick={p.onHistory}
        >
          <History size={16} />
        </IconButton>
        <button className="export-button" onClick={p.onExport}>
          <Download size={15} />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
}
