import { ReactNode, useEffect, useId } from 'react';

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, subtitle, onClose, children }: ModalProps) {
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
      <div className="modal">
        <header className="modal__header">
          <div>
            {subtitle && <p className="modal__eyebrow">{subtitle}</p>}
            <h3 id={titleId}>{title}</h3>
          </div>
          <button className="modal__close" type="button" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </header>
        <div className="modal__body" id={bodyId}>
          {children}
        </div>
      </div>
    </div>
  );
}
