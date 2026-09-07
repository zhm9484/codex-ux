import { ElementTimeline } from './element-timeline';
import { previewScenes } from './timeline-items';
import type { EditorState } from '../hooks/use-editor';
import { useThumbnails } from '../hooks/use-thumbnails';
import { SceneStrip } from './scene-strip';

export function TimelineDock({ state }: { state: EditorState }) {
  const workspace = state.workspace!;
  const thumbnail = useThumbnails(
    workspace.id,
    workspace.revisionId,
    previewScenes(workspace.revision.document),
  );
  return (
    <div className="timeline-dock">
      <SceneStrip
        document={workspace.revision.document}
        time={state.time}
        clock={state.clock}
        range={state.range}
        thumbnail={thumbnail}
        onSeek={state.seek}
        onRange={state.setRange}
        onPoint={state.setNotePoint}
        onRangeStart={state.clearSelection}
      />
      {state.timelineExpanded && <ElementTimeline state={state} />}
    </div>
  );
}
