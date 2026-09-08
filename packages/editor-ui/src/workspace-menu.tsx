import { useState } from 'react';
import { Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import type { Workspace } from '@codex-ux/protocol';
import { FloatingPanel } from './floating-panel';
import type { FloatingAnchor } from './use-floating-position';

export function WorkspaceMenu({
  workspaces,
  current,
  onSelect,
  homeHref,
}: {
  workspaces: Workspace[];
  current: string;
  onSelect: (id: string) => void;
  homeHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<FloatingAnchor | null>(null);
  return (
    <div className="workspace-menu">
      <button
        className="workspace-switcher"
        aria-label="Select workspace"
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom });
          setOpen(!open);
        }}
      >
        <span>{workspaces.find((w) => w.id === current)?.name ?? 'Workspace'}</span>
        <ChevronDown size={14} />
      </button>
      <FloatingPanel
        open={open}
        anchor={anchor}
        title="Workspaces"
        onClose={() => setOpen(false)}
        className="workspace-panel"
      >
        {workspaces.map((w) => (
          <button
            className="workspace-option"
            key={w.id}
            onClick={() => {
              onSelect(w.id);
              setOpen(false);
            }}
          >
            <span>{w.name}</span>
            {w.id === current && <Check size={14} />}
          </button>
        ))}
        <a className="workspace-option" href={homeHref}>
          Choose or create workspace
          <ArrowUpRight size={14} />
        </a>
      </FloatingPanel>
    </div>
  );
}
