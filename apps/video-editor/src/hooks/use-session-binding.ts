import { useContext, useState } from 'react';
import { AppInstanceContext } from '../lib/app-instance';

export function useSessionBinding(workspaceId: string) {
  const instance = useContext(AppInstanceContext);
  if (!instance) throw new Error('The application instance is missing.');
  const [session, setSession] = useState(() => instance.session(workspaceId));
  const [bindingError, setBindingError] = useState('');
  const bind = (sessionId: string | null) => {
    try {
      if (sessionId && !/^[a-zA-Z0-9-]{10,100}$/.test(sessionId))
        throw new Error('Enter a valid Codex session ID or task link.');
      const next = sessionId ? { provider: 'codex', sessionId } : null;
      instance.bind(workspaceId, next);
      setSession(next);
      setBindingError('');
      return Promise.resolve(true);
    } catch (error) {
      setBindingError(error instanceof Error ? error.message : 'Could not save the connection.');
      return Promise.resolve(false);
    }
  };
  return { session, bind, bindingError, target: () => instance.target(workspaceId) };
}
