import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface Props {
  children: ReactNode;
  variant?: 'missing' | 'accent' | 'primary';
}

const VARIANT_CLASS = {
  missing: 'border-line bg-missing-soft text-missing',
  accent: 'border-gold-line bg-gold-soft text-gold',
  primary: 'border-brand-line bg-brand-soft text-brand-strong',
} as const;

export default function StatusBadge({ children, variant = 'missing' }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-[7px] py-px text-ui-2xs font-medium leading-[1.6] whitespace-nowrap',
        VARIANT_CLASS[variant],
      )}
    >
      {children}
    </span>
  );
}
