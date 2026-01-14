import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface RecentFine {
  firm: string;
  amount: number;
  date: string;
  breachType: string;
  noticeUrl?: string;
}

interface HomepageStats {
  totalFines: number;
  totalAmount: number;
  latestFines: RecentFine[];
}

export function RecentActionsList() {
  const [stats, setStats] = useState<HomepageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/homepage/stats')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load homepage stats:', err);
        setError('Unable to load recent fines');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="recent-actions-container">
        <div className="actions-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="action-card skeleton">
              <div className="skeleton-line" style={{ width: '70%', height: '20px' }} />
              <div className="skeleton-line" style={{ width: '40%', height: '16px', marginTop: '8px' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="recent-actions-container">
        <p style={{ textAlign: 'center', color: '#6B7280' }}>{error || 'No data available'}</p>
      </div>
    );
  }

  const maxAmount = Math.max(...stats.latestFines.map(f => f.amount));

  // Format amount for display
  const formatAmount = (amount: number) => {
    if (amount >= 1000000) {
      return `£${(amount / 1000000).toFixed(1)}m`;
    }
    return `£${(amount / 1000).toFixed(0)}k`;
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="recent-actions-container">
      <div className="actions-grid">
        {stats.latestFines.map((fine, i) => (
          <motion.div
            key={i}
            className="action-card"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
          >
            <div className="action-header">
              <h4>{fine.firm}</h4>
              <span className="action-badge fine">
                {fine.breachType || 'Fine'}
              </span>
            </div>

            <div className="action-details">
              <div className="action-amount">
                <span className="amount-label">Fine Amount</span>
                <span className="amount-value">{formatAmount(fine.amount)}</span>
              </div>
              <div className="action-date">
                <span className="date-label">Date</span>
                <span className="date-value">{formatDate(fine.date)}</span>
              </div>
            </div>

            <div className="action-bar">
              <motion.div
                className="action-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${(fine.amount / maxAmount) * 100}%` }}
                transition={{ delay: 0.5 + i * 0.08, duration: 0.6 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="chart-summary">
        <p><strong>Latest enforcement:</strong> {stats.latestFines[0]?.firm} - {formatAmount(stats.latestFines[0]?.amount)} ({formatDate(stats.latestFines[0]?.date)})</p>
        <p><strong>Total fines tracked:</strong> {stats.totalFines} enforcement actions totalling £{(stats.totalAmount / 1000000000).toFixed(2)}B</p>
      </div>
    </div>
  );
}
