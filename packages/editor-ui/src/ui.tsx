import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({
  label,
  children,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`icon-button ${props.className ?? ''}${active ? ' active' : ''}`}
      aria-pressed={props['aria-pressed'] ?? active}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
