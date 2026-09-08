import type {
  LibrarySource,
  LibraryReference,
  LibraryEntry,
  LibrarySearch,
} from '@codex-ux/protocol';

export interface LocalDirectory {
  path: string;
  parent: string;
  truncated: boolean;
  entries: { path: string; name: string; kind: 'file' | 'directory' }[];
}
/** HTTP client only; file access and path validation stay in the local service. */
export class WorkspaceLibrary {
  readonly base: string;
  constructor(workspaceId: string, origin = '') {
    this.base = `${origin}/api/workspaces/${encodeURIComponent(workspaceId)}/library`;
  }
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(this.base + path, options);
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Library request failed.');
    return body;
  }
  private post<T>(path: string, body: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  sources() {
    return this.request<LibrarySource[]>('');
  }
  add(path: string) {
    return this.post<LibrarySource>('/sources', { path });
  }
  remove(id: string) {
    return this.request<LibrarySource[]>(`/sources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  browse(path = '') {
    return this.request<LocalDirectory>(`/browse?path=${encodeURIComponent(path)}`);
  }
  search(query: string, source = '', signal?: AbortSignal) {
    return this.request<LibrarySearch>(
      `/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`,
      signal ? { signal } : undefined,
    );
  }
  reference(entry: LibraryEntry) {
    return this.post<LibraryReference>('/references', {
      sourceId: entry.sourceId,
      relativePath: entry.relativePath,
    });
  }
  upload(file: File) {
    return this.request<LibraryReference>('/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
  }
  content(ref: LibraryReference) {
    return `${this.base}/references/${encodeURIComponent(ref.id)}/content`;
  }
}
