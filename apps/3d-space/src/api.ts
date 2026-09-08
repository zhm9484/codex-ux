export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error ?? 'The local service could not complete the request.');
  return result;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export async function dropFiles(transfer: DataTransfer) {
  const files: { file: File; path: string }[] = [];
  async function walk(entry: FileSystemEntry, prefix = ''): Promise<void> {
    if (entry.name.startsWith('.')) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      files.push({ file, path: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!entries.length) break;
        for (const child of entries) await walk(child, prefix + entry.name + '/');
      }
    }
    if (files.length > 1000)
      throw new Error('Import up to 1,000 model and texture files at a time.');
  }
  const entries = [...transfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (entries.length) {
    for (const entry of entries) await walk(entry);
  } else
    for (const file of transfer.files)
      files.push({ file, path: file.webkitRelativePath || file.name });
  return files;
}
