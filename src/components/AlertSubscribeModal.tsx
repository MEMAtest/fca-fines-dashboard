import { useState, FormEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, CheckCircle, AlertCircle } from 'lucide-react';

interface AlertSubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const BREACH_TYPES = [
  'AML',
  'Consumer Protection',
  'Market Abuse',
  'Conduct',
  'Prudential',
  'Governance',
  'Systems & Controls',
  'Financial Crime',
];

const FREQUENCY_OPTIONS = [
  { value: 'immediate', label: 'Immediately', description: 'Get notified as soon as a new fine is published' },
  { value: 'daily', label: 'Daily Digest', description: 'Receive a summary each morning' },
  { value: 'weekly', label: 'Weekly Digest', description: 'Weekly roundup every Monday' },
];

export function AlertSubscribeModal({ isOpen, onClose }: AlertSubscribeModalProps) {
  const [email, setEmail] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [breachTypes, setBreachTypes] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('immediate');
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
      const response = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          minAmount: minAmount ? parseFloat(minAmount) * 1000000 : null,
          breachTypes: breachTypes.length > 0 ? breachTypes : null,
          frequency,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to subscribe');
      }

      setStatus('success');
    } catch (error) {
      console.error('Subscribe error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to subscribe');
      setStatus('error');
    }
  };

  const handleBreachTypeToggle = (type: string) => {
    setBreachTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleClose = () => {
    setStatus('idle');
    setEmail('');
    setMinAmount('');
    setBreachTypes([]);
    setFrequency('immediate');
    setErrorMessage('');
    onClose();
  };

  return (
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
              className="modal-inner alert-subscribe-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-header-icon">
                  <Bell size={24} />
                </div>
                <div>
                  <h2>Get Fine Alerts</h2>
                  <p className="modal-subtitle">Receive notifications when new FCA fines are published</p>
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
                    <p>Click the link in the email to activate your alerts.</p>
                    <button className="btn btn-primary" onClick={handleClose}>
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="subscribe-form">
                    <div className="form-group">
                      <label htmlFor="alert-email">Email address *</label>
                      <input
                        type="email"
                        id="alert-email"
                        value={email}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="min-amount">Minimum fine amount (optional)</label>
                      <div className="input-with-suffix">
                        <span className="input-prefix">£</span>
                        <input
                          type="number"
                          id="min-amount"
                          value={minAmount}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setMinAmount(e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.1"
                        />
                        <span className="input-suffix">million</span>
                      </div>
                      <p className="form-hint">Leave empty to receive alerts for all fines</p>
                    </div>

                    <div className="form-group">
                      <label>Breach types (optional)</label>
                      <div className="breach-type-grid">
                        {BREACH_TYPES.map(type => (
                          <button
                            key={type}
                            type="button"
                            className={`breach-type-chip ${breachTypes.includes(type) ? 'active' : ''}`}
                            onClick={() => handleBreachTypeToggle(type)}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                      <p className="form-hint">
                        {breachTypes.length === 0
                          ? 'All breach types selected'
                          : `${breachTypes.length} type${breachTypes.length !== 1 ? 's' : ''} selected`}
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Notification frequency</label>
                      <div className="frequency-options">
                        {FREQUENCY_OPTIONS.map(option => (
                          <label
                            key={option.value}
                            className={`frequency-option ${frequency === option.value ? 'active' : ''}`}
                          >
                            <input
                              type="radio"
                              name="frequency"
                              value={option.value}
                              checked={frequency === option.value}
                              onChange={(e) => setFrequency(e.target.value)}
                            />
                            <span className="frequency-label">{option.label}</span>
                            <span className="frequency-desc">{option.description}</span>
                          </label>
                        ))}
                      </div>
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
                      {status === 'submitting' ? 'Subscribing...' : 'Subscribe to Alerts'}
                    </button>

                    <p className="form-footer">
                      You can unsubscribe at any time via the link in our emails.
                    </p>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
