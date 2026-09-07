import { useEffect, useState } from 'react';
import { Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import type { Workspace } from '@codex-ux/protocol';

export function WorkspaceMenu({
  workspaces,
  current,
  onSelect,
}: {
  workspaces: Workspace[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  return (
    <div className="workspace-menu">
      <button
        className="workspace-switcher"
        aria-label="Select workspace"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{workspaces.find((w) => w.id === current)?.name ?? 'video-editor'}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <button
            className="dismiss-layer"
            aria-label="Close workspace menu"
            onClick={() => setOpen(false)}
          />
          <div className="workspace-popover">
            <div className="popover-label">
              WORKSPACES <ArrowUpRight size={13} />
            </div>
            {workspaces.map((w) => (
              <button
                key={w.id}
                className="workspace-option"
                onClick={() => {
                  onSelect(w.id);
                  setOpen(false);
                }}
              >
                <span>{w.name}</span>
                {w.id === current && <Check size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
