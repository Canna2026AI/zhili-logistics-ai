import { X } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useModalLayer } from '../../hooks/use-modal-layer';

export interface DrawerProps {
  open: boolean;
  title: string;
  children: ReactNode;
  subheader?: ReactNode;
  footer?: ReactNode;
  size?: 480 | 640;
  onOpenChange: (open: boolean) => void;
}

export function Drawer({
  children,
  footer,
  onOpenChange,
  open,
  size = 480,
  subheader,
  title,
}: DrawerProps) {
  const titleId = useId();
  const { closeButtonRef, layerRef } = useModalLayer(open, () => onOpenChange(false));

  if (!open) return null;

  return (
    <div className="zl-overlay zl-overlay--drawer" onMouseDown={() => onOpenChange(false)}>
      <aside
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="zl-drawer"
        data-size={String(size)}
        style={{ width: size }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="zl-drawer__header">
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeButtonRef}
            className="zl-icon-button"
            aria-label="关闭"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        {subheader ? <div className="zl-drawer__subheader">{subheader}</div> : null}
        <div className="zl-drawer__body">{children}</div>
        {footer ? <footer className="zl-drawer__footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
