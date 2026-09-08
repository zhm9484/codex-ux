import { useFloatingPosition } from '../hooks/use-floating-position';
import type { EditorState } from '../hooks/use-editor';
import { HistoryPanel } from '../panels/history';

export function SidePanel({ state }: { state: EditorState }) {
  const popup = useFloatingPosition(!!state.panel, state.panelAnchor);
  const project = state.project;
  if (!project || !state.panel) return null;
  const close = () => state.setPanel(null);
  return (
    <aside
      ref={popup}
      className={`side-panel ${state.panelAnchor ? 'island-panel' : ''}`}
      aria-label={`${state.panel} panel`}
    >
      <div className="sheet-handle" />
      {state.panel === 'history' && (
        <HistoryPanel
          project={project}
          disabled={state.saving}
          onClose={close}
          onCompare={(revision) => {
            state.control.current?.pause();
            state.setComparison(revision);
            close();
          }}
          onRestore={(revision) => state.save(revision.document, `Restore ${revision.label}`)}
        />
      )}
    </aside>
  );
}
