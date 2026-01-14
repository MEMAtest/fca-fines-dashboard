import { useEffect, useState } from 'react';

export interface HomepageStats {
  totalFines: number;
  totalAmount: number;
  yearsCovered: number;
  earliestYear: number;
  latestYear: number;
  yoyChange: string | null;
  latestFines: Array<{
    firm: string;
    amount: number;
    date: string;
    breachType: string;
    noticeUrl?: string;
  }>;
}

export function useHomepageStats() {
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
        setError('Unable to load stats');
        setLoading(false);
      });
  }, []);

  return { stats, loading, error };
}

// Format helpers
export function formatAmount(amount: number): string {
  if (amount >= 1000000000) {
    return `£${(amount / 1000000000).toFixed(1)}B`;
  }
  if (amount >= 1000000) {
    return `£${(amount / 1000000).toFixed(1)}m`;
  }
  return `£${(amount / 1000).toFixed(0)}k`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
