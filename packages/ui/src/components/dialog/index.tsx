import { X } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useModalLayer } from '../../hooks/use-modal-layer';

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 480 | 640 | 880;
  onOpenChange: (open: boolean) => void;
}

export function Dialog({
  children,
  description,
  footer,
  onOpenChange,
  open,
  size = 480,
  title,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const { closeButtonRef, layerRef } = useModalLayer(open, () => onOpenChange(false));

  if (!open) return null;

  return (
    <div className="zl-overlay" onMouseDown={() => onOpenChange(false)}>
      <section
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="zl-dialog"
        style={{ width: size }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="zl-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            ref={closeButtonRef}
            className="zl-icon-button"
            aria-label="关闭"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="zl-dialog__body">{children}</div>
        {footer ? <footer className="zl-dialog__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
