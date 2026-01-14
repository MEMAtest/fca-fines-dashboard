import { useState, FormEvent, ChangeEvent } from 'react';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';

const CONTACT_REASONS = [
  { value: '', label: 'Select a reason *' },
  { value: 'demo', label: 'Request a Demo' },
  { value: 'inquiry', label: 'General Inquiry' },
  { value: 'partnership', label: 'Partnership Opportunity' },
  { value: 'support', label: 'Technical Support' },
  { value: 'other', label: 'Other' },
];

interface FormData {
  name: string;
  email: string;
  company: string;
  reason: string;
  message: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

export function ContactForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    company: '',
    reason: '',
    message: '',
  });
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.reason) {
      newErrors.reason = 'Please select a reason';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setStatus('submitting');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      setStatus('success');
      setFormData({
        name: '',
        email: '',
        company: '',
        reason: '',
        message: '',
      });

      // Reset to idle after 5 seconds
      setTimeout(() => setStatus('idle'), 5000);
    } catch (error) {
      console.error('Contact form error:', error);
      setStatus('error');

      // Reset to idle after 5 seconds
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error for this field
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  if (status === 'success') {
    return (
      <div className="contact-form success-state">
        <div className="success-icon">
          <CheckCircle size={48} />
        </div>
        <h3>Thank you for reaching out!</h3>
        <p>We've received your message and will get back to you within 24 hours.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="contact-form">
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="name">
            Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={errors.name ? 'error' : ''}
            placeholder="John Smith"
          />
          {errors.name && <span className="error-message">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="email">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={errors.email ? 'error' : ''}
            placeholder="john@company.com"
          />
          {errors.email && <span className="error-message">{errors.email}</span>}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="company">
          Company
        </label>
        <input
          type="text"
          id="company"
          name="company"
          value={formData.company}
          onChange={handleChange}
          placeholder="Your Company Ltd (optional)"
        />
      </div>

      <div className="form-group">
        <label htmlFor="reason">
          Reason for Contact *
        </label>
        <select
          id="reason"
          name="reason"
          value={formData.reason}
          onChange={handleChange}
          className={errors.reason ? 'error' : ''}
        >
          {CONTACT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.reason && <span className="error-message">{errors.reason}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="message">
          Message *
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          value={formData.message}
          onChange={handleChange}
          className={errors.message ? 'error' : ''}
          placeholder="Tell us how we can help you..."
        />
        {errors.message && <span className="error-message">{errors.message}</span>}
      </div>

      <button
        type="submit"
        className="submit-button"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? (
          'Sending...'
        ) : (
          <>
            Send Message
            <Send size={16} />
          </>
        )}
      </button>

      {status === 'error' && (
        <div className="form-message error">
          <AlertCircle size={20} />
          <span>Failed to send message. Please try again or email us directly at contact@memaconsultants.com</span>
        </div>
      )}
    </form>
  );
}
