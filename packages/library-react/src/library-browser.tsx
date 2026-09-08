import { useEffect, useState } from 'react';
import type { LibraryEntry, LibraryReference, LibrarySource } from '@codex-ux/protocol';
import type { WorkspaceLibrary, LocalDirectory } from '@codex-ux/sdk';
import { FileIcon, LibraryIcon } from './file-icon';
import { AttachmentList } from './attachments';

export function LibraryBrowser({
  library,
  onChoose,
}: {
  library: WorkspaceLibrary;
  onChoose?: (ref: LibraryReference) => void;
}) {
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<LibraryReference | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void library
      .sources()
      .then((list) => {
        if (active) setSources(list);
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [library, revision]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void library
        .search(query, source, controller.signal)
        .then((result) => {
          setEntries(result.entries);
          setTruncated(result.truncated);
          setError(
            result.unavailable.length
              ? `Unavailable locations: ${result.unavailable.join(', ')}`
              : '',
          );
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : 'Search failed.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [library, query, source, revision]);
  async function choose(entry: LibraryEntry) {
    setBusy(true);
    try {
      const ref = await library.reference(entry);
      if (onChoose) onChoose(ref);
      else setPreview(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File unavailable.');
    } finally {
      setBusy(false);
    }
  }
  if (adding)
    return (
      <LocalPicker
        library={library}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          setRevision((value) => value + 1);
        }}
      />
    );
  return (
    <div className="ux-library">
      <div className="ux-library-intro">
        <LibraryIcon size={26} />
        <div>
          <strong>Your local materials</strong>
          <p>Reference these files in any app in this workspace.</p>
        </div>
        <button type="button" className="ux-button" onClick={() => setAdding(true)}>
          + Add location
        </button>
      </div>
      <div className="ux-library-locations">
        {sources.map((item) => (
          <div className={`ux-location ${source === item.id ? 'selected' : ''}`} key={item.id}>
            <button
              type="button"
              title={item.path}
              onClick={() => setSource(source === item.id ? '' : item.id)}
            >
              <FileIcon kind={item.kind} name={item.name} size={25} />
              <span>
                {item.name}
                <small>{item.managed ? 'Pasted and attached files' : item.path}</small>
              </span>
            </button>
            {!item.managed && (
              <button
                className="ux-remove"
                type="button"
                aria-label={`Remove location ${item.name}`}
                title="Remove from library; original files stay in place"
                onClick={() => {
                  void library
                    .remove(item.id)
                    .then(() => {
                      setSource('');
                      setRevision((value) => value + 1);
                    })
                    .catch((e: unknown) => setError(String(e)));
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="ux-search-field">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Search library"
          placeholder="Search files and folders…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>⌘ K</kbd>
      </div>
      {error && (
        <p className="ux-error" role="alert">
          {error}
        </p>
      )}
      <div className="ux-library-results" aria-busy={loading}>
        {loading ? (
          <p className="ux-empty">Finding your materials…</p>
        ) : entries.length ? (
          entries.map((entry) => (
            <button
              type="button"
              className="ux-result"
              key={`${entry.sourceId}/${entry.relativePath}`}
              disabled={busy}
              onClick={() => void choose(entry)}
            >
              <FileIcon name={entry.name} mime={entry.mime} kind={entry.kind} />
              <span>
                <strong>{entry.name}</strong>
                <small>
                  {sources.find((item) => item.id === entry.sourceId)?.name} /{' '}
                  {entry.sourceId === 'attachments' ? entry.name : entry.relativePath || entry.name}
                </small>
              </span>
              <span className="ux-result-action">{onChoose ? 'Attach ↵' : 'View ↗'}</span>
            </button>
          ))
        ) : (
          <div className="ux-empty">
            <FileIcon kind="directory" size={40} />
            <strong>{query ? 'No matching materials' : 'A place for your references'}</strong>
            <p>
              {query
                ? 'Try another filename or location.'
                : 'Add a local folder or file, then use @ in Chat to reference it.'}
            </p>
          </div>
        )}
      </div>
      {truncated && (
        <p className="ux-footnote">
          Showing a bounded selection. Narrow the search or choose a more specific folder.
        </p>
      )}
      {preview && (
        <AttachmentList
          key={preview.id}
          expanded
          library={library}
          items={[preview]}
          onRemove={() => setPreview(null)}
        />
      )}
      <p className="ux-footnote">
        Files stay at their original locations. Removing a location does not delete its files.
      </p>
    </div>
  );
}
function LocalPicker({
  library,
  onClose,
  onAdded,
}: {
  library: WorkspaceLibrary;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [directory, setDirectory] = useState<LocalDirectory | null>(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function browse(next = '') {
    setBusy(true);
    try {
      const result = await library.browse(next);
      setDirectory(result);
      setPath(result.path);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Directory unavailable.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void library
      .browse()
      .then((result) => {
        if (active) {
          setDirectory(result);
          setPath((current) => current || result.path);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [library]);
  async function add(next: string) {
    setBusy(true);
    try {
      await library.add(next);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add location.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ux-local-picker">
      <button type="button" className="ux-link" onClick={onClose}>
        ← Library
      </button>
      <h3>Add a local folder or file</h3>
      <p className="ux-footnote">Browse this computer, or paste an absolute path.</p>
      <form
        className="ux-path-field"
        onSubmit={(event) => {
          event.preventDefault();
          void browse(path);
        }}
      >
        <input
          aria-label="Local path"
          disabled={busy}
          value={path}
          onChange={(event) => setPath(event.target.value)}
        />
        <button className="ux-button" disabled={busy}>
          Go
        </button>
        <button
          type="button"
          className="ux-button primary"
          disabled={busy || !path.trim()}
          onClick={() => void add(path)}
        >
          Add path
        </button>
      </form>
      {error && (
        <p className="ux-error" role="alert">
          {error}
        </p>
      )}
      {directory && (
        <>
          <div className="ux-local-heading">
            <button
              type="button"
              className="ux-link"
              disabled={busy || directory.path === directory.parent}
              onClick={() => void browse(directory.parent)}
            >
              ↑ Parent folder
            </button>
            <button
              type="button"
              className="ux-button"
              disabled={busy}
              onClick={() => void add(directory.path)}
            >
              Use this folder
            </button>
          </div>
          <div className="ux-local-entries">
            {directory.entries.map((entry) => (
              <div className="ux-local-row" key={entry.path}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    entry.kind === 'directory' ? void browse(entry.path) : void add(entry.path)
                  }
                >
                  <FileIcon kind={entry.kind} name={entry.name} size={26} />
                  <span>{entry.name}</span>
                </button>
                <button
                  type="button"
                  className="ux-link"
                  disabled={busy}
                  aria-label={`Add ${entry.name}`}
                  onClick={() => void add(entry.path)}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
          {directory.truncated && (
            <p className="ux-footnote">More entries exist. Enter a more specific path above.</p>
          )}
        </>
      )}
    </div>
  );
}
