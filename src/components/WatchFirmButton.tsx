import { useState, FormEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, CheckCircle, AlertCircle } from 'lucide-react';

interface WatchFirmButtonProps {
  firmName: string;
  variant?: 'icon' | 'button' | 'text';
  className?: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

export function WatchFirmButton({ firmName, variant = 'button', className = '' }: WatchFirmButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    setStatus('submitting');

    try {
      const response = await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firmName }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add to watchlist');
      }

      setStatus('success');
    } catch (error) {
      console.error('Watchlist error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add to watchlist');
      setStatus('error');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStatus('idle');
    setEmail('');
    setErrorMessage('');
  };

  const renderTrigger = () => {
    const baseProps = {
      onClick: () => setIsOpen(true),
      className: `watch-firm-trigger ${variant} ${className}`.trim(),
      'aria-label': `Watch ${firmName} for new fines`,
    };

    if (variant === 'icon') {
      return (
        <button {...baseProps} type="button">
          <Eye size={16} />
        </button>
      );
    }

    if (variant === 'text') {
      return (
        <button {...baseProps} type="button">
          <Eye size={14} />
          Watch firm
        </button>
      );
    }

    return (
      <button {...baseProps} type="button">
        <Eye size={16} />
        Watch this firm
      </button>
    );
  };

  return (
    <>
      {renderTrigger()}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
            />

            <div className="modal-container" onClick={handleClose}>
              <motion.div
                className="modal-inner watch-firm-modal"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div className="modal-header-icon">
                    <Eye size={24} />
                  </div>
                  <div>
                    <h2>Watch Firm</h2>
                    <p className="modal-subtitle">Get notified when this firm receives new fines</p>
                  </div>
                  <button className="modal-close" onClick={handleClose}>
                    <X size={24} />
                  </button>
                </div>

                <div className="modal-content">
                  {status === 'success' ? (
                    <div className="subscribe-success">
                      <CheckCircle size={48} className="success-icon" />
                      <h3>Check your inbox!</h3>
                      <p>We've sent a verification email to <strong>{email}</strong>.</p>
                      <p>Click the link to start watching <strong>{firmName}</strong>.</p>
                      <button className="btn btn-primary" onClick={handleClose}>
                        Done
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="subscribe-form">
                      <div className="watch-firm-name">
                        <span className="label">Firm</span>
                        <span className="value">{firmName}</span>
                      </div>

                      <div className="form-group">
                        <label htmlFor="watch-email">Your email address</label>
                        <input
                          type="email"
                          id="watch-email"
                          value={email}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                          placeholder="you@company.com"
                          required
                          autoFocus
                        />
                      </div>

                      {(status === 'error' || errorMessage) && (
                        <div className="form-error">
                          <AlertCircle size={16} />
                          <span>{errorMessage || 'Something went wrong. Please try again.'}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={status === 'submitting'}
                      >
                        {status === 'submitting' ? 'Adding...' : 'Start Watching'}
                      </button>

                      <p className="form-footer">
                        You'll receive an email whenever {firmName} is fined by the FCA.
                        Unsubscribe anytime.
                      </p>
                    </form>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
