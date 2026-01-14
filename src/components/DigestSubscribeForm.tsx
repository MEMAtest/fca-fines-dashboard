import { useState, FormEvent, ChangeEvent } from 'react';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';

interface DigestSubscribeFormProps {
  defaultFrequency?: 'weekly' | 'monthly';
  compact?: boolean;
  className?: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

export function DigestSubscribeForm({
  defaultFrequency = 'weekly',
  compact = false,
  className = ''
}: DigestSubscribeFormProps) {
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(defaultFrequency);
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
      const response = await fetch('/api/digest/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, frequency }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to subscribe');
      }

      setStatus('success');
    } catch (error) {
      console.error('Digest subscribe error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to subscribe');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className={`digest-subscribe-form success ${className}`.trim()}>
        <div className="success-content">
          <CheckCircle size={compact ? 24 : 32} className="success-icon" />
          <div>
            <p className="success-title">Check your inbox!</p>
            <p className="success-message">
              Click the link in our email to confirm your {frequency} digest subscription.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className={`digest-subscribe-form compact ${className}`.trim()}>
        <div className="compact-form-row">
          <div className="compact-input-group">
            <Mail size={16} className="input-icon" />
            <input
              type="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <select
            value={frequency}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setFrequency(e.target.value as 'weekly' | 'monthly')}
            className="frequency-select"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? '...' : 'Subscribe'}
          </button>
        </div>
        {(status === 'error' || errorMessage) && (
          <div className="form-error compact">
            <AlertCircle size={14} />
            <span>{errorMessage || 'Something went wrong'}</span>
          </div>
        )}
      </form>
    );
  }

  return (
    <div className={`digest-subscribe-form ${className}`.trim()}>
      <div className="digest-header">
        <Mail size={24} />
        <div>
          <h3>FCA Fines Digest</h3>
          <p>Get a summary of all new fines delivered to your inbox</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="digest-email">Email address</label>
          <input
            type="email"
            id="digest-email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </div>

        <div className="form-group">
          <label>Frequency</label>
          <div className="frequency-toggle">
            <button
              type="button"
              className={frequency === 'weekly' ? 'active' : ''}
              onClick={() => setFrequency('weekly')}
            >
              Weekly
              <span className="frequency-desc">Every Monday</span>
            </button>
            <button
              type="button"
              className={frequency === 'monthly' ? 'active' : ''}
              onClick={() => setFrequency('monthly')}
            >
              Monthly
              <span className="frequency-desc">1st of each month</span>
            </button>
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
          {status === 'submitting' ? 'Subscribing...' : 'Subscribe to Digest'}
        </button>

        <p className="form-footer">
          Unsubscribe anytime with one click.
        </p>
      </form>
    </div>
  );
}
