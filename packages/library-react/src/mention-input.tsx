import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useId,
} from 'react';
import { createPortal } from 'react-dom';
import type { LibraryEntry, LibraryReference } from '@codex-ux/protocol';
import type { WorkspaceLibrary } from '@codex-ux/sdk';
import { FileIcon, LibraryIcon } from './file-icon';
import { fileKind } from './file-kind';
import { AttachmentList } from './attachments';

type Snapshot = { html: string; refs: LibraryReference[] };
export function MentionInput({
  library,
  value,
  attachments,
  onChange,
  onFocus,
  onManage,
  onSubmit,
  disabled = false,
  focusKey = 0,
  active = true,
  label = 'Message',
  placeholder = 'What would you like to do? Type @ to add a reference…',
  actions,
  onBusy,
  incomingFiles = null,
  onConsumed,
  imagePreviews = false,
  onPreview,
}: {
  incomingFiles?: File[] | null;
  onConsumed?: () => void;
  library: WorkspaceLibrary;
  value: string;
  attachments: LibraryReference[];
  onChange: (text: string, refs: LibraryReference[]) => void;
  onFocus?: () => void;
  onManage: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  focusKey?: number;
  active?: boolean;
  label?: string;
  placeholder?: string;
  actions?: ReactNode;
  onBusy?: (busy: boolean) => void;
  imagePreviews?: boolean;
  onPreview?: (reference: LibraryReference) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const caret = useRef<Range | null>(null);
  const trigger = useRef<Range | null>(null);
  const known = useRef(new Map<string, LibraryReference>());
  const past = useRef<Snapshot[]>([{ html: '', refs: [] }]);
  const index = useRef(0);
  const lastText = useRef('');
  const composing = useRef(false);
  const pending = useRef(false);
  const [menu, setMenu] = useState<{
    query: string;
    manual: boolean;
    left: number;
    top: number;
  } | null>(null);
  const [loadedQuery, setLoadedQuery] = useState<string | undefined>(undefined);
  const [found, setResults] = useState<LibraryEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<LibraryReference | null>(null);
  const listId = useId();
  function showPreview(reference: LibraryReference) {
    if (onPreview) onPreview(reference);
    else setPreview(reference);
  }
  function text() {
    return (editor.current?.innerText ?? '').replaceAll('\u00a0', ' ');
  }
  function references() {
    return [
      ...new Set(
        Array.from(editor.current!.querySelectorAll<HTMLElement>('[data-reference]')).map(
          (node) => node.dataset.reference!,
        ),
      ),
    ]
      .map((id) => known.current.get(id)!)
      .filter(Boolean);
  }
  function emit(record = true) {
    const next = text();
    if (next.length > 4000) {
      editor.current!.innerHTML = past.current[index.current]!.html;
      select(end());
      setError('Keep your message within 4,000 characters.');
      return;
    }
    const refs = references();
    lastText.current = next;
    if (record) {
      past.current = past.current.slice(0, index.current + 1);
      past.current.push({ html: editor.current!.innerHTML, refs });
      if (past.current.length > 100) past.current.shift();
      index.current = past.current.length - 1;
    }
    onChange(next, refs);
  }
  function end() {
    const range = document.createRange();
    range.selectNodeContents(editor.current!);
    range.collapse(false);
    return range;
  }
  function select(range: Range) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    caret.current = range.cloneRange();
  }
  function chip(ref: LibraryReference) {
    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.dataset.reference = ref.id;
    span.className = `ux-inline-reference ${fileKind(ref.name, ref.mime, ref.kind)}`;
    span.title = ref.path;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      ref.kind === 'directory'
        ? 'M3 4h3l2 2h5q1 0 1 1v5q0 1-1 1H3q-1 0-1-1V5q0-1 1-1Z'
        : 'M5 2h4l3 3v8q0 1-1 1H5q-1 0-1-1V3q0-1 1-1ZM9 2v3q0 1 1 1h2',
    );
    icon.append(path);
    span.append(icon, document.createTextNode(`@${ref.name}`));
    return span;
  }
  useLayoutEffect(() => {
    attachments.forEach((ref) => known.current.set(ref.id, ref));
    if (value !== lastText.current) {
      editor.current!.replaceChildren();
      const tokens = attachments
        .map((ref) => ({ ref, at: value.indexOf(`@${ref.name}`) }))
        .filter((token) => token.at >= 0)
        .sort((a, b) => a.at - b.at);
      let offset = 0;
      for (const token of tokens) {
        if (token.at < offset) continue;
        editor.current!.append(
          document.createTextNode(value.slice(offset, token.at)),
          chip(token.ref),
        );
        offset = token.at + token.ref.name.length + 1;
      }
      editor.current!.append(document.createTextNode(value.slice(offset)));
      lastText.current = value;
      past.current = [{ html: editor.current!.innerHTML, refs: attachments }];
      index.current = 0;
    }
  }, [value, attachments]);
  useEffect(() => {
    if (active) editor.current?.focus();
  }, [active, focusKey]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.ux-mention-menu,.ux-mention-input')) setMenu(null);
    };
    const close = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest('.ux-mention-menu')))
        setMenu(null);
    };
    const observer = new ResizeObserver(() => {
      setMenu((current) => {
        if (!current || !caret.current || !popup.current) return current;
        const rect = caret.current.getBoundingClientRect();
        if (!rect.height) return current;
        const height = popup.current.offsetHeight;
        const left = Math.max(10, Math.min(window.innerWidth - 370, rect.left));
        const top =
          rect.bottom + height + 18 <= window.innerHeight
            ? rect.bottom + 8
            : Math.max(10, rect.top - height - 8);
        return current.left === left && current.top === top ? current : { ...current, left, top };
      });
    });
    if (editor.current?.parentElement?.parentElement)
      observer.observe(editor.current.parentElement.parentElement);
    const popupObserver = new MutationObserver(() => {
      if (popup.current) observer.observe(popup.current);
    });
    popupObserver.observe(document.body, { childList: true });
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      observer.disconnect();
      popupObserver.disconnect();
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);
  const query = menu?.query;
  const results = query === loadedQuery ? found : [];
  useEffect(() => {
    if (query === undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void library
        .search(query, '', controller.signal)
        .then((data) => {
          setResults(data.entries.slice(0, 30));
          setLoadedQuery(query);
          setSelected(0);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : 'Search failed.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 100);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [library, query]);
  function open(query: string, manual: boolean) {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.current!.contains(selection.anchorNode))
      caret.current = selection.getRangeAt(0).cloneRange();
    const rect = caret.current?.getBoundingClientRect();
    const fallback = editor.current!.getBoundingClientRect();
    const bottom = rect?.height ? rect.bottom : fallback.bottom;
    const left = rect?.height ? rect.left : fallback.left;
    setMenu({
      query,
      manual,
      left: Math.max(10, Math.min(window.innerWidth - 370, left)),
      top: Math.max(10, Math.min(window.innerHeight - 370, bottom + 8)),
    });
  }
  function detect() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.current!.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    caret.current = range.cloneRange();
    if (
      range.startContainer.nodeType !== Node.TEXT_NODE ||
      range.startContainer.parentElement?.closest('[data-reference]')
    ) {
      setMenu(null);
      return;
    }
    const before = range.startContainer.textContent!.slice(0, range.startOffset);
    const match = /(?:^|\s)@([^@\n]*)$/.exec(before);
    if (!match) {
      setMenu(null);
      trigger.current = null;
      return;
    }
    const token = range.cloneRange();
    token.setStart(range.startContainer, before.length - match[1]!.length - 1);
    trigger.current = token;
    open(match[1]!, false);
  }
  function insert(ref: LibraryReference) {
    if (references().length >= 20) throw new Error('Attach up to 20 files to one message.');
    known.current.set(ref.id, ref);
    const range = trigger.current ?? caret.current ?? end();
    if (!editor.current!.contains(range.commonAncestorContainer)) {
      range.selectNodeContents(editor.current!);
      range.collapse(false);
    }
    range.deleteContents();
    const node = chip(ref);
    range.insertNode(node);
    const space = document.createTextNode('\u00a0');
    node.after(space);
    range.setStartAfter(space);
    range.collapse(true);
    editor.current!.focus();
    select(range);
    trigger.current = null;
    setMenu(null);
    emit();
  }
  async function choose(entry: LibraryEntry) {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    setError('');
    try {
      insert(await library.reference(entry));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach file.');
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  async function attach(files: File[]) {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    setError('');
    try {
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024)
          throw new Error('Each attachment must be 100 MB or smaller.');
        if (references().length >= 20) throw new Error('Attach up to 20 files to one message.');
        insert(await library.upload(file));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Attachment could not be saved.');
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
      if (upload.current) upload.current.value = '';
    }
  }
  const consume = useEffectEvent((files: File[]) => {
    caret.current = end();
    void attach(files);
    onConsumed?.();
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      if (incomingFiles) consume(incomingFiles);
    }, 0);
    return () => clearTimeout(timer);
  }, [incomingFiles]);
  function history(direction: number) {
    const next = Math.max(0, Math.min(past.current.length - 1, index.current + direction));
    index.current = next;
    const snapshot = past.current[next]!;
    snapshot.refs.forEach((ref) => known.current.set(ref.id, ref));
    editor.current!.innerHTML = snapshot.html;
    select(end());
    emit(false);
    setMenu(null);
  }
  function key(event: React.KeyboardEvent) {
    if (composing.current || event.nativeEvent.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      history(event.shiftKey ? 1 : -1);
      return;
    }
    if (menu) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenu(null);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected(
          (value) =>
            (value + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, results.length)) %
            Math.max(1, results.length),
        );
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (results[selected]) void choose(results[selected]);
        return;
      }
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  }
  return (
    <div className="ux-mention-input">
      <div
        ref={editor}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        aria-controls={menu ? listId : undefined}
        aria-activedescendant={menu && results[selected] ? `${listId}-${selected}` : undefined}
        contentEditable={!disabled && !busy}
        suppressContentEditableWarning
        className="ux-message-editor"
        data-placeholder={placeholder}
        onFocus={onFocus}
        onKeyDown={key}
        onKeyUp={(event) => {
          if (
            !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key) &&
            !composing.current
          )
            detect();
        }}
        onCompositionStart={() => {
          composing.current = true;
          setMenu(null);
        }}
        onCompositionEnd={() => {
          composing.current = false;
          emit();
          detect();
        }}
        onInput={() => {
          emit();
          if (!composing.current) detect();
        }}
        onBeforeInput={(event) => {
          const input = event.nativeEvent;
          if (input.inputType === 'historyUndo' || input.inputType === 'historyRedo') {
            event.preventDefault();
            history(input.inputType === 'historyUndo' ? -1 : 1);
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          const files = Array.from(event.clipboardData.items)
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile())
            .filter((file): file is File => !!file);
          if (files.length) {
            caret.current = window.getSelection()?.getRangeAt(0).cloneRange() ?? end();
            void attach(
              files.map(
                (file) =>
                  new File(
                    [file],
                    file.type.startsWith('image/')
                      ? `Screenshot-${Date.now()}.${file.type.split('/')[1] || 'png'}`
                      : file.name,
                    { type: file.type },
                  ),
              ),
            );
          } else {
            const range = window.getSelection()?.getRangeAt(0) ?? end();
            range.deleteContents();
            const node = document.createTextNode(event.clipboardData.getData('text/plain'));
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            select(range);
            emit();
          }
        }}
        onClick={(event) => {
          const id = (event.target as Element).closest<HTMLElement>('[data-reference]')?.dataset
            .reference;
          const reference = id ? known.current.get(id) : undefined;
          if (reference) showPreview(reference);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length) {
            event.preventDefault();
            event.stopPropagation();
            caret.current = end();
            void attach(Array.from(event.dataTransfer.files));
          }
        }}
      />
      {imagePreviews &&
        attachments.some((item) => /^image\/(png|jpeg|webp|gif|avif)$/.test(item.mime)) && (
          <div className="ux-composer-images" aria-label="Attached images">
            {attachments
              .filter((item) => /^image\/(png|jpeg|webp|gif|avif)$/.test(item.mime))
              .map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-label={`Preview ${item.name}`}
                  title={item.name}
                  onClick={() => showPreview(item)}
                >
                  <img src={library.content(item)} alt={item.name} />
                </button>
              ))}
          </div>
        )}
      <div className="ux-attach-tools">
        <button
          type="button"
          className="ux-add-attachment"
          aria-label="Add attachment"
          disabled={disabled || busy}
          onClick={() => {
            trigger.current = null;
            open('', true);
          }}
        >
          ＋
        </button>
        {!actions && <span>Local files · paste images · @ to reference</span>}
        {actions}
      </div>
      {busy && (
        <p role="status" className="ux-attachment-status">
          Saving attachment locally…
        </p>
      )}
      <input
        ref={upload}
        type="file"
        multiple
        hidden
        aria-label="Attach files"
        onChange={(event) => void attach(Array.from(event.target.files ?? []))}
      />
      {error && (
        <p className="ux-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <AttachmentList library={library} items={[preview]} onRemove={() => setPreview(null)} />
      )}
      {menu &&
        active &&
        createPortal(
          <div
            className="ux-mention-menu"
            ref={popup}
            style={{ left: menu.left, top: menu.top }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header>
              <span className="ux-mention-heading">
                <span className="ux-mention-sigil">@</span> Add reference
              </span>
              <kbd>esc</kbd>
            </header>
            {menu.manual && (
              <input
                className="ux-menu-search"
                aria-label="Find a reference"
                autoFocus
                placeholder="Search your library…"
                value={menu.query}
                onChange={(event) => {
                  setMenu({ ...menu, query: event.target.value });
                }}
                onKeyDown={key}
              />
            )}
            <div className="ux-mention-section">
              <span>{menu.query ? 'Matching files' : 'Your library'}</span>
              <span>{loading ? 'Searching' : `${results.length} shown`}</span>
            </div>
            <div
              role="listbox"
              id={listId}
              aria-label="Library references"
              className="ux-mention-results"
              aria-busy={loading}
            >
              {loading || query !== loadedQuery ? (
                <p className="ux-empty">Searching…</p>
              ) : results.length ? (
                results.map((entry, i) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === selected}
                    id={`${listId}-${i}`}
                    className="ux-result ux-mention-option"
                    key={`${entry.sourceId}/${entry.relativePath}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => void choose(entry)}
                  >
                    <FileIcon name={entry.name} mime={entry.mime} kind={entry.kind} size={26} />
                    <span>
                      <strong>{entry.name}</strong>
                      {entry.relativePath.includes('/') && entry.sourceId !== 'attachments' && (
                        <small>
                          {entry.relativePath
                            .slice(0, entry.relativePath.lastIndexOf('/'))
                            .replaceAll('/', ' / ')}
                        </small>
                      )}
                    </span>
                    <span className="ux-mention-type">
                      {entry.kind === 'directory'
                        ? 'Folder'
                        : entry.name.includes('.')
                          ? entry.name.split('.').pop()?.toUpperCase()
                          : 'File'}
                    </span>
                    <kbd className="ux-mention-return" aria-hidden="true">
                      ↵
                    </kbd>
                  </button>
                ))
              ) : (
                <div className="ux-empty">
                  <FileIcon kind="directory" size={30} />
                  <p>
                    {menu.query
                      ? 'No matching files. Try another name.'
                      : 'Add a location to start referencing files.'}
                  </p>
                </div>
              )}
            </div>
            <footer>
              <button type="button" onClick={() => upload.current?.click()}>
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  aria-hidden="true"
                >
                  <path d="M8 11V2m-3 3 3-3 3 3M3 10v4h10v-4" />
                </svg>
                Upload files
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  editor.current?.focus();
                  onManage();
                }}
              >
                <LibraryIcon size={14} /> Library <span aria-hidden="true">↗</span>
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </div>
  );
}
