import type { CSSProperties } from 'react';
import { fileKind } from './file-kind';
const colors: Record<string, string> = {
  folder: '#ff9800',
  image: '#1864ff',
  video: '#7938f5',
  audio: '#ef5a16',
  font: '#d51c93',
  code: '#075ae5',
  document: '#e52e45',
  file: '#606773',
};
/** Original 24px glyphs, with gently rounded folded sheets and saturated type colors. */
export function FileIcon({
  name = '',
  mime = '',
  kind = 'file',
  size = 32,
}: {
  name?: string;
  mime?: string;
  kind?: string;
  size?: number;
}) {
  const type = fileKind(name, mime, kind);
  return (
    <span
      className={`ux-file-icon ux-file-${type}`}
      style={{ '--file-color': colors[type], width: size, height: size } as CSSProperties}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {type === 'folder' ? (
          <>
            <path d="M3 8V5.5A1.5 1.5 0 0 1 4.5 4h3.9a1.5 1.5 0 0 1 1.1.45L11 6h8.5A1.5 1.5 0 0 1 21 7.5V9" />
            <path
              d="M3.5 8.5h17a1 1 0 0 1 1 1.2l-1.6 8.8a1.8 1.8 0 0 1-1.8 1.5H5.9a1.8 1.8 0 0 1-1.8-1.5L2.5 9.7a1 1 0 0 1 1-1.2Z"
              fill="currentColor"
              fillOpacity="1"
            />
          </>
        ) : (
          <>
            <path
              d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.6a1.5 1.5 0 0 0-.44-1.06l-5.1-5.1A1.5 1.5 0 0 0 13.4 2Z"
              fill="currentColor"
              fillOpacity="1"
            />
            <path d="M14 2.5V6.7A1.3 1.3 0 0 0 15.3 8h4.2" stroke="white" strokeOpacity=".65" />
            <g stroke="white">
              {type === 'image' ? (
                <>
                  <circle cx="9" cy="11" r="1.3" />
                  <path d="m7 18 3.5-4 2.5 2 2.5-3 2 5Z" fill="white" fillOpacity=".3" />
                </>
              ) : type === 'video' ? (
                <path
                  d="M10 11.8q0-1 .85-.5l4.6 2.7q.85.5 0 1l-4.6 2.7q-.85.5-.85-.5Z"
                  fill="white"
                  stroke="none"
                />
              ) : type === 'audio' ? (
                <>
                  <path d="M12 17v-6l5-1v5" />
                  <ellipse cx="10" cy="17.5" rx="2" ry="1.5" />
                  <ellipse cx="15" cy="15.5" rx="2" ry="1.5" />
                </>
              ) : type === 'font' ? (
                <>
                  <path d="m7 18 4-8 4 8M9 15h4M15 13h3m-1.5 0v5" />
                </>
              ) : type === 'code' ? (
                <>
                  <path d="m9 12-3 3 3 3m6-6 3 3-3 3m-2-7-2 8" />
                </>
              ) : (
                <>
                  <path d="M8 12h8M8 15h8M8 18h5" />
                </>
              )}
            </g>
          </>
        )}
      </svg>
    </span>
  );
}
export function LibraryIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7V5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10" />
      <path d="M3 8h6l2 2h8v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M7 15h8m-8 3h5" />
    </svg>
  );
}
