import { useEffect, useState } from 'react';
import type { AgentSessionRef } from '@codex-ux/protocol';

export function AgentConnection({
  session,
  pairing,
  onPair,
  onBind,
  error,
  pendingSend,
  sending,
  onContinue,
}: {
  session: AgentSessionRef | null;
  pairing: { state: string; code: string } | null;
  onPair: () => Promise<unknown>;
  onBind: (sessionId: string | null) => unknown;
  error?: string;
  pendingSend?: boolean;
  sending?: boolean;
  onContinue?: () => void;
}) {
  const [thread, setThread] = useState(session?.sessionId ?? '');
  const [busy, setBusy] = useState(false);
  const [inputError, setInputError] = useState('');
  const [delivery, setDelivery] = useState<'checking' | 'available' | 'unavailable'>('checking');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch('/api/agents/codex', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Connection check failed.');
        const result = (await response.json()) as { deliveryAvailable?: boolean };
        if (active) setDelivery(result.deliveryAvailable === true ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (active) setDelivery('unavailable');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  return (
    <div className="agent-settings">
      <div className="connection-status">
        <span
          className={`connection-dot ${session && delivery === 'available' ? 'connected' : ''}`}
        />
        <strong>
          {!session
            ? 'Connect your agent'
            : delivery === 'checking'
              ? 'Checking message delivery…'
              : delivery === 'available'
                ? 'Task saved · delivery available'
                : 'Task saved · delivery unavailable'}
        </strong>
      </div>
      <p className="muted-copy">
        Connect this page to the Codex task you want to collaborate with.
      </p>
      {delivery === 'unavailable' && (
        <p role="alert" className="inline-error">
          The agent needs to repair the local message connection. Your task and draft are saved;
          copying a connection code will not fix delivery.
        </p>
      )}
      {session && <code className="session-id">{session.sessionId}</code>}
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onPair().finally(() => setBusy(false));
        }}
      >
        {session ? 'Confirm this page with the agent' : 'Connect current agent'}
      </button>
      {pairing && (
        <div className="pairing-card">
          {pairing.state === 'connected' ? (
            <p role="status">This page confirmed the connection.</p>
          ) : (
            <>
              <label className="field">
                Give this connection code to your agent
                <input readOnly value={pairing.code} onFocus={(event) => event.target.select()} />
              </label>
              <p className="field-help">
                Valid for 10 minutes. Connects only this page and workspace.
              </p>
            </>
          )}
        </div>
      )}
      <details className="manual-connection">
        <summary>Use a task ID or link</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const id = thread.trim().replace(/^codex:\/\/threads\//, '');
            if (id && !/^[a-zA-Z0-9-]{10,100}$/.test(id)) {
              setInputError('Enter a valid Codex session ID or task link.');
              return;
            }
            setInputError('');
            void onBind(id || null);
          }}
        >
          <label className="field">
            Session ID or task link
            <input
              placeholder="codex://threads/…"
              value={thread}
              onChange={(event) => setThread(event.target.value)}
            />
          </label>
          <button className="secondary-button">Save connection</button>
        </form>
      </details>
      {(inputError || error) && (
        <p role="alert" className="inline-error">
          {inputError || error}
        </p>
      )}
      {pendingSend ? (
        <div className="connection-next">
          <p>Your draft is ready. Continue when the right task is connected.</p>
          <button
            className="primary-button"
            disabled={!session || delivery !== 'available' || sending || busy}
            onClick={() => {
              onContinue?.();
            }}
          >
            Continue sending
          </button>
        </div>
      ) : (
        <p className="field-help">Connecting does not send a message. You choose when to send.</p>
      )}
      {session && (
        <button className="text-button" onClick={() => void onBind(null)}>
          Disconnect session
        </button>
      )}
    </div>
  );
}
