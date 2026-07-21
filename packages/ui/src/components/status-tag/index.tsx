import { AlertCircle, CheckCircle2, Circle, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusTagProps {
  children: ReactNode;
  tone?: StatusTone;
}

const icons = {
  neutral: Circle,
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  danger: XCircle,
};

export function StatusTag({ children, tone = 'neutral' }: StatusTagProps) {
  const Icon = icons[tone];
  return (
    <span className={`zl-status zl-status--${tone}`} data-tone={tone}>
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
