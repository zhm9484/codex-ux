import { FloatingPanel } from '@codex-ux/editor-ui';
import type { EditorState } from '../hooks/use-editor';
import { HistoryPanel } from '../panels/history';

export function SidePanel({ state }: { state: EditorState }) {
  const project = state.project;
  if (!project || !state.panel) return null;
  const close = () => state.setPanel(null);
  return (
    <FloatingPanel
      open={!!state.panel}
      anchor={state.panelAnchor}
      title="History"
      onClose={close}
      className="side-panel"
    >
      {state.panel === 'history' && (
        <HistoryPanel
          project={project}
          disabled={state.saving}
          onCompare={(revision) => {
            state.control.current?.pause();
            state.setComparison(revision);
            close();
          }}
          onRestore={(revision) => state.save(revision.document, `Restore ${revision.label}`)}
        />
      )}
    </FloatingPanel>
  );
}
