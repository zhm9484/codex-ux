import { FloatingPanel } from '@codex-ux/editor-ui';
import type { EditorState } from '../hooks/use-editor';
import { FeedbackComposer } from './feedback-composer';
export function ChatDock({ state }: { state: EditorState }) {
  return (
    <div className="chat-dock">
      <FloatingPanel
        open={state.chatOpen}
        anchor={state.chatAnchor}
        title={state.feedbackMode === 'note' ? 'Note' : 'Chat'}
        heading={false}
        movable
        className="chat-popover"
        closeLabel="Close chat"
        onClose={() => state.setChatOpen(false)}
      >
        <FeedbackComposer state={state} />
      </FloatingPanel>
    </div>
  );
}
