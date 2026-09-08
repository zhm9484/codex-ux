import { Download, Film } from 'lucide-react';
import { EditorHeader } from '@codex-ux/editor-ui';
import type { VideoProject } from '@codex-ux/video-domain';
import type { Workspace } from '@codex-ux/protocol';
interface HeaderProps {
  onAgent: () => void;
  onFiles: () => void;
  connected: boolean;
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
    <EditorHeader
      homeHref="/apps/video-editor/"
      name="Video Editor"
      icon={<Film size={19} />}
      workspaceId={p.project.workspaceId}
      workspaces={p.workspaces}
      onSelect={p.onSelect}
      status={p.saving ? 'Saving…' : 'Saved locally'}
      canUndo={p.project.canUndo}
      canRedo={p.project.canRedo}
      busy={p.saving}
      onTravel={p.onTravel}
      onHistory={p.onHistory}
      historyOpen={p.historyOpen}
      onLibrary={p.onFiles}
      onAgent={p.onAgent}
      connected={p.connected}
    >
      <button className="export-button" onClick={p.onExport}>
        <Download size={15} />
        <span>Export</span>
      </button>
    </EditorHeader>
  );
}
