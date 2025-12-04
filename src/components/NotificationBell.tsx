import { Bell } from 'lucide-react';

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  read?: boolean;
}

interface NotificationBellProps {
  notifications: NotificationItem[];
  open: boolean;
  unreadCount: number;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRefresh?: () => void;
}

const skeletonPlaceholders = Array.from({ length: 3 });

export function NotificationBell({
  notifications,
  open,
  unreadCount,
  loading = false,
  error = null,
  onOpenChange,
  onMarkAsRead,
  onMarkAllRead,
  onRefresh,
}: NotificationBellProps) {
  const hasNotifications = notifications.length > 0;
  const showEmptyState = !loading && !error && !hasNotifications;

  return (
    <div className="notification-bell">
      <button
        type="button"
        className="notification-bell__btn hover-lift"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `${unreadCount} unread alerts` : 'Open notifications'}
        onClick={() => onOpenChange(!open)}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount}</span>}
      </button>
      {open && (
        <div
          className="notification-bell__dropdown"
          role="dialog"
          aria-label="Latest enforcement alerts"
          aria-busy={loading}
        >
          {loading && (
            <div className="notification-bell__skeletons" aria-live="polite">
              {skeletonPlaceholders.map((_, index) => (
                <div key={`notification-skeleton-${index}`} className="notification-bell__skeleton skeleton" />
              ))}
            </div>
          )}
          {!loading && error && (
            <div className="notification-bell__empty" role="status" aria-live="assertive">
              <p>{error}</p>
              {onRefresh && (
                <button type="button" onClick={onRefresh}>
                  Try again
                </button>
              )}
            </div>
          )}
          {showEmptyState && (
            <div className="notification-bell__empty" role="status" aria-live="polite">
              <p>All quiet — no alerts right now.</p>
              {onRefresh && (
                <button type="button" onClick={onRefresh}>
                  Check again
                </button>
              )}
            </div>
          )}
          {!loading && !error && hasNotifications && (
            <>
              <div className="notification-bell__dropdown-actions">
                <span className="notification-bell__status" aria-live="polite">
                  {unreadCount > 0 ? `${unreadCount} new` : 'Up to date'}
                </span>
                <div className="notification-bell__dropdown-buttons">
                  <button type="button" onClick={onRefresh} disabled={loading}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <button type="button" onClick={onMarkAllRead} disabled={unreadCount === 0}>
                    Mark all read
                  </button>
                </div>
              </div>
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={notification.read ? 'notification-item' : 'notification-item notification-item--unread'}
                >
                  <div>
                    <h5>{notification.title}</h5>
                    <p>{notification.detail}</p>
                  </div>
                  <footer>
                    <span className="notification-item__time">{notification.time}</span>
                    {!notification.read && (
                      <button type="button" onClick={() => onMarkAsRead(notification.id)}>
                        Mark read
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
