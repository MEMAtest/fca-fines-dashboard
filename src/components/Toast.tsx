interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onDismiss?: () => void;
}

export function Toast({ message, type = 'success', onDismiss }: ToastProps) {
  return (
    <div className={`toast ${type === 'error' ? 'toast--error' : 'toast--success'}`} role="status">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="toast__close" onClick={onDismiss} aria-label="Dismiss notification">
          ×
        </button>
      )}
    </div>
  );
}
