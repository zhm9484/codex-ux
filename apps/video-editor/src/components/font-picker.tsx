import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { VideoDocument } from '@codex-ux/video-domain';
import { useFloatingPosition, type FloatingAnchor } from '../hooks/use-floating-position';

const families = {
  'Sans serif': [
    'Arial',
    'Helvetica Neue',
    'Avenir',
    'Avenir Next',
    'Futura',
    'Optima',
    'Gill Sans',
    'Trebuchet MS',
    'Verdana',
  ],
  Serif: ['Georgia', 'Times New Roman', 'Baskerville', 'Didot', 'Palatino', 'Hoefler Text'],
  Monospace: ['Menlo', 'Monaco', 'Courier New'],
  Chinese: ['PingFang SC', 'Songti SC', 'Heiti SC', 'Kaiti SC'],
};
interface Props {
  value: string;
  document: VideoDocument;
  disabled: boolean;
  onChange: (family: string) => void;
}
export function FontPicker({ value, document: video, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<FloatingAnchor | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const popup = useFloatingPosition(open, anchor);
  const id = useId();
  const fonts = [
    ...Object.entries(families).flatMap(([group, names]) =>
      names.map((name) => ({ value: name, name, group })),
    ),
    ...video.assets
      .filter((asset) => asset.mime.startsWith('font/'))
      .map((asset) => ({ value: asset.id, name: asset.name, group: 'Imported' })),
  ];
  const visible = fonts.filter((font) =>
    `${font.name} ${font.group}`.toLowerCase().includes(query.toLowerCase()),
  );
  const choose = (family: string) => {
    onChange(family);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('pointerdown', outside, true);
    return () => window.removeEventListener('pointerdown', outside, true);
  }, [open, popup]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);
  return (
    <>
      <button
        ref={trigger}
        className="font-trigger"
        aria-label="Typeface"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect();
          setAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom });
          setQuery('');
          setActive(
            Math.max(
              0,
              fonts.findIndex((font) => font.value === value),
            ),
          );
          setOpen(!open);
        }}
      >
        <span>{fonts.find((font) => font.value === value)?.name ?? value}</span>
        <ChevronDown size={13} />
      </button>
      {open &&
        createPortal(
          <section
            ref={popup}
            className="font-popover"
            aria-label="Choose a typeface"
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) =>
                  Math.max(
                    0,
                    Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                  ),
                );
              }
              if (event.key === 'Enter' && visible[active]) {
                event.preventDefault();
                choose(visible[active].value);
              }
            }}
          >
            <label className="font-search">
              <Search size={15} />
              <input
                ref={search}
                placeholder="Find a typeface"
                aria-label="Find a typeface"
                value={query}
                aria-activedescendant={`${id}-${active}`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            </label>
            <div className="font-options" role="listbox" aria-label="Typefaces">
              {visible.map((font, index) => (
                <div key={font.value}>
                  {(index === 0 || visible[index - 1]?.group !== font.group) && (
                    <div className="font-group">{font.group}</div>
                  )}
                  <button
                    id={`${id}-${index}`}
                    role="option"
                    aria-label={font.name}
                    aria-selected={value === font.value}
                    className={`font-option ${index === active ? 'highlighted' : ''}`}
                    onPointerMove={() => setActive(index)}
                    onClick={() => choose(font.value)}
                  >
                    <span>{font.name}</span>
                    <span className="font-specimen" style={{ fontFamily: font.value }}>
                      {font.group === 'Chinese' ? '字' : 'Ag'}
                    </span>
                    <span className="font-check">
                      {value === font.value && <Check size={14} />}
                    </span>
                  </button>
                </div>
              ))}
              {!visible.length && <p className="font-empty">No matching typefaces</p>}
            </div>
          </section>,
          document.body,
        )}
    </>
  );
}
