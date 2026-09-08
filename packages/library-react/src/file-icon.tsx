import type { CSSProperties } from 'react';
import { fileKind } from './file-kind';
const colors: Record<string, string> = {
  folder: '#ba8a36',
  image: '#658b65',
  video: '#8270ad',
  audio: '#b0795c',
  font: '#b36a89',
  code: '#568b9a',
  document: '#6887ad',
  file: '#8a8a88',
};
/** Original 24px glyphs, sharing a folded sheet and restrained type accents. */
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
            <path d="M3 8V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1" />
            <path
              d="M3 8.5h18l-1 10a1.7 1.7 0 0 1-1.7 1.5H5.7A1.7 1.7 0 0 1 4 18.5Z"
              fill="currentColor"
              fillOpacity=".12"
            />
          </>
        ) : (
          <>
            <path
              d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"
              fill="currentColor"
              fillOpacity=".06"
            />
            <path d="M14 3v4a2 2 0 0 0 2 2h4" />
            {type === 'image' ? (
              <>
                <circle cx="9" cy="11" r="1.3" />
                <path d="m7 18 3.5-4 2.5 2 2.5-3 2 5Z" fill="currentColor" fillOpacity=".18" />
              </>
            ) : type === 'video' ? (
              <path d="m10 11 6 3.5-6 3.5Z" fill="currentColor" fillOpacity=".22" />
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
