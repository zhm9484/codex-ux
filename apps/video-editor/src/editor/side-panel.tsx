import { useFloatingPosition } from '../hooks/use-floating-position';
import type { EditorState } from '../hooks/use-editor';
import { Inspector } from '../panels/inspector';
import { NotesPanel } from '../panels/notes';
import { AssetsPanel } from '../panels/assets';
import { HistoryPanel } from '../panels/history';

export function SidePanel({ state }: { state: EditorState }) {
  const popup = useFloatingPosition(!!state.panel, state.panelAnchor);
  const workspace = state.workspace;
  if (!workspace || !state.panel) return null;
  const document = workspace.revision.document;
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
          workspace={workspace}
          disabled={state.saving}
          onClose={close}
          onRemove={state.removeNote}
          onBind={state.bind}
          onRefresh={state.refresh}
          onLocate={state.locate}
        />
      )}
      {state.panel === 'edit' && (
        <Inspector
          clip={document.clips.find((clip) => clip.id === state.selectedId)}
          document={document}
          disabled={state.saving}
          onClose={close}
          onPreview={(clip) => state.control.current?.patch(clip)}
          onSave={state.updateClip}
          onAddText={state.addText}
        />
      )}
      {state.panel === 'assets' && (
        <AssetsPanel
          workspaceId={workspace.id}
          document={document}
          disabled={state.saving}
          onClose={close}
          onUpload={state.upload}
          onAdd={state.addAsset}
        />
      )}
      {state.panel === 'history' && (
        <HistoryPanel
          workspace={workspace}
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
