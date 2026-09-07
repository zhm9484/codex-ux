import { ElementTimeline } from './element-timeline';
import { previewScenes } from './timeline-items';
import type { EditorState } from '../hooks/use-editor';
import { useThumbnails } from '../hooks/use-thumbnails';
import { SceneStrip } from './scene-strip';

export function TimelineDock({ state }: { state: EditorState }) {
  const project = state.project!;
  const thumbnail = useThumbnails(
    project.workspaceId,
    state.displayedRevision || project.revisionId,
    previewScenes(state.document!),
  );
  return (
    <div className="timeline-dock">
      <SceneStrip
        document={state.document!}
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
