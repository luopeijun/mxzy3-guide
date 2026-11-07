import type { ReactNode } from 'react';

interface Props {
  icon?: string;
  title: string;
  text: string;
  children?: ReactNode;
}

export default function EmptyState({ icon = '◇', title, text, children }: Props) {
  return (
    <div className="rounded-ui-lg border border-dashed border-line-strong bg-surface-soft px-7 py-12 text-center">
      <div className="text-[30px] text-brand-line" aria-hidden="true">{icon}</div>
      <h2 className="mt-2.5 text-ui-lg font-bold">{title}</h2>
      <p className="mt-2 text-ui-xs leading-[1.8] text-ink-muted">{text}</p>
      {children}
    </div>
  );
}
