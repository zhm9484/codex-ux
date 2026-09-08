import { useEffect, useRef, useState, type ReactNode } from 'react';
type State = {
  id: string;
  state: string;
  stage: string;
  error?: string;
  startedAt?: number;
  logPath?: string;
};
const names: Record<string, string> = {
  core: 'Workspace',
  scene: '3D Space',
  video: 'Video Editor',
  hyperframes: 'Animation preview',
  remotion: 'Animation preview',
  'remotion-export': 'Video export',
  'hyperframes-export': 'Video export',
  browser: 'Background previews',
  probe: 'Media information',
  encoder: 'Video encoding',
};

/** A visible shell precedes optional preparation. Failed capabilities do not disable the editor. */
export function RuntimeGate({ app, children }: { app: 'scene' | 'video'; children: ReactNode }) {
  const [states, setStates] = useState<State[]>([]);
  const [error, setError] = useState('');
  const started = useRef(false);
  const [now, setNow] = useState(Date.now);
  async function act(id: string, method = 'POST') {
    try {
      const response = await fetch(`/api/environment/${id}`, { method });
      if (!response.ok) throw new Error('Could not change preparation. Try again.');
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch('/api/environment', { signal: controller.signal });
        if (!response.ok) throw new Error('Could not check application readiness.');
        const next = (await response.json()) as State[];
        if (!alive) return;
        setStates(next);
        setNow(Date.now());
        if (next.find((s) => s.id === app)?.state === 'absent' && !started.current) {
          started.current = true;
          await act(app);
        }
      } catch (error) {
        if (alive) setError(error instanceof Error ? error.message : String(error));
      }
    }
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [app]);
  const ready = states.find((s) => s.id === app)?.state === 'ready';
  const active = states.filter(
    (s) =>
      (app === 'scene' ? ['core', 'scene'].includes(s.id) : s.id !== 'scene') &&
      ['preparing', 'failed'].includes(s.state),
  );
  const browser = states.find((s) => s.id === 'browser');
  return (
    <>
      {ready ? (
        children
      ) : (
        <div className="ux-runtime-opening" role="status">
          <h1>{names[app]}</h1>
          <p>Preparing this app. Your workspace stays on this computer.</p>
        </div>
      )}
      {(active.length > 0 || error || (app === 'video' && browser?.state === 'absent')) && (
        <aside className="ux-runtime-status" aria-label="Application preparation">
          {error && <p role="alert">{error}</p>}
          {active.map((s) => (
            <div key={s.id}>
              <strong>{names[s.id] ?? s.id}</strong>
              <p role="status">
                {s.state === 'failed'
                  ? 'Preparation could not finish.'
                  : `Preparing… ${Math.max(0, Math.floor((now - (s.startedAt ?? now)) / 1000))}s`}
              </p>
              <details>
                <summary>Details</summary>
                <p>{s.error ?? s.stage}</p>
                {s.logPath && <p>Log: {s.logPath}</p>}
              </details>
              <button onClick={() => void act(s.id, s.state === 'failed' ? 'POST' : 'DELETE')}>
                {s.state === 'failed' ? 'Retry preparation' : 'Cancel preparation'}
              </button>
            </div>
          ))}
          {app === 'video' && browser?.state === 'absent' && (
            <button onClick={() => void act('browser')}>Enable background thumbnails</button>
          )}
        </aside>
      )}
    </>
  );
}
