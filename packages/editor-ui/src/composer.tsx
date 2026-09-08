import type { ComponentProps, ReactNode } from 'react';
import { MentionInput } from '@codex-ux/library-react';

export function Composer({
  context,
  secondaryAction,
  primaryAction,
  error,
  ...input
}: Omit<ComponentProps<typeof MentionInput>, 'actions'> & {
  context?: ReactNode;
  secondaryAction?: ReactNode;
  primaryAction: ReactNode;
  error?: ReactNode;
}) {
  return (
    <div className="feedback-composer">
      {context}
      <MentionInput
        {...input}
        actions={
          <div className="composer-actions">
            {secondaryAction}
            {primaryAction}
          </div>
        }
      />
      <p className="composer-shortcut">Enter for a new line · ⌘/Ctrl+Enter to send</p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}
