import { useFloatingPosition } from '../hooks/use-floating-position';
import type { EditorState } from '../hooks/use-editor';
import { SourcePanel } from '../panels/source';
import { NotesPanel } from '../panels/notes';
import { AssetsPanel } from '../panels/assets';
import { HistoryPanel } from '../panels/history';

export function SidePanel({ state }: { state: EditorState }) {
  const popup = useFloatingPosition(!!state.panel, state.panelAnchor);
  const project = state.project;
  if (!project || !state.panel) return null;
  const document = project.revision.document;
  const close = () => state.setPanel(null);
  return (
    <aside
      ref={popup}
      className={`side-panel ${state.panelAnchor ? 'island-panel' : ''}`}
      aria-label={`${state.panel} panel`}
    >
      <div className="sheet-handle" />
      {state.panel === 'notes' && (
        <NotesPanel
          project={project}
          session={state.session}
          target={state.target}
          disabled={state.saving}
          onClose={close}
          onRemove={state.removeNote}
          onBind={state.bind}
          onRefresh={state.refresh}
          onLocate={state.locate}
        />
      )}
      {state.panel === 'source' && <SourcePanel state={state} onClose={close} />}
      {state.panel === 'assets' && (
        <AssetsPanel
          workspaceId={project.workspaceId}
          document={document}
          disabled={state.saving}
          onClose={close}
          onUpload={state.upload}
        />
      )}
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
