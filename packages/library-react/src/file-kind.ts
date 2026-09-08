export function fileKind(name: string, mime = '', kind = 'file') {
  if (kind === 'directory') return 'folder';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('font/')) return 'font';
  if (/\.(tsx?|jsx?|html|css|json|ya?ml|py|sh|rs|go)$/i.test(name)) return 'code';
  if (/\.(pdf|docx?|txt|md|rtf)$/i.test(name)) return 'document';
  return 'file';
}
