import { useCallback, useEffect, useState } from 'react';
import { fetchNotifications } from '../api';
import type { NotificationItem } from '../types';

export function useNotificationFeed() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNotifications();
      if (response?.data) {
        const mapped = response.data.map((item) => ({
          id: item.id,
          title: item.title,
          detail: item.detail,
          time: item.time,
          read: item.read,
        }));
        setNotifications(mapped);
      }
      return true;
    } catch (err) {
      console.error('Notification feed failed', err);
      setError('Unable to load alerts');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { notifications, loading, error, refresh };
}
