import { Download, Undo2, Redo2, History } from 'lucide-react';
import type { VideoProject } from '@codex-ux/video-domain';
import type { Workspace } from '@codex-ux/protocol';
import { IconButton } from '../components/ui';
import { WorkspaceMenu } from '../components/workspace-menu';
interface HeaderProps {
  project: VideoProject;
  workspaces: Workspace[];
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
        <WorkspaceMenu
          current={p.project.workspaceId}
          workspaces={p.workspaces}
          onSelect={p.onSelect}
        />
        <span className="save-indicator" role="status">
          {p.saving ? 'Saving…' : 'Saved locally'}
        </span>
      </div>
      <div className="header-actions">
        <div className={`undo-controls ${p.project.canUndo || p.project.canRedo ? '' : 'empty'}`}>
          <IconButton
            label="Undo (⌘Z)"
            disabled={p.saving || !p.project.canUndo}
            onClick={() => p.onTravel('undo')}
          >
            <Undo2 size={16} />
          </IconButton>
          <IconButton
            label="Redo (⌘⇧Z)"
            disabled={p.saving || !p.project.canRedo}
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
