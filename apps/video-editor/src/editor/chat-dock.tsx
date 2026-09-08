import { X } from 'lucide-react';
import type { EditorState } from '../hooks/use-editor';
import { FeedbackComposer } from './feedback-composer';
import { useFloatingPosition } from '../hooks/use-floating-position';
import { IconButton } from '../components/ui';

export function ChatDock({ state }: { state: EditorState }) {
  const popup = useFloatingPosition(state.chatOpen, state.chatAnchor);
  return (
    <div className="chat-dock">
      <section ref={popup} className="chat-popover" hidden={!state.chatOpen} aria-label="Chat">
        <div className="chat-heading">
          <h2>Add note</h2>
          <IconButton label="Close chat" onClick={() => state.setChatOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <FeedbackComposer state={state} />
      </section>
    </div>
  );
}
