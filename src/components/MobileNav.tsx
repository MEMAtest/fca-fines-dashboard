import { BarChart3, Filter, GitCompare, Download, Bell, Share2, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  action?: () => void;
  badge?: number;
  badgeLabel?: string;
  disabled?: boolean;
};

interface MobileNavProps {
  onDashboard?: () => void;
  onFilters?: () => void;
  onCompare?: () => void;
  onExport?: () => void;
  onNotifications?: () => void;
  onShare?: () => void;
  filterCount?: number;
  pendingNotifications?: number;
  compareEnabled?: boolean;
  exportEnabled?: boolean;
  shareEnabled?: boolean;
}

export function MobileNav({
  onDashboard,
  onFilters,
  onCompare,
  onExport,
  onNotifications,
  onShare,
  filterCount = 0,
  pendingNotifications = 0,
  compareEnabled = true,
  exportEnabled = true,
  shareEnabled = true,
}: MobileNavProps) {
  const [active, setActive] = useState('dashboard');
  const navItems = useMemo<NavItem[]>(
    () => [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3, action: onDashboard },
      { id: 'filters', label: 'Filters', icon: Filter, action: onFilters, badge: filterCount, badgeLabel: 'filters active' },
      { id: 'compare', label: 'Compare', icon: GitCompare, action: onCompare, disabled: !compareEnabled },
      { id: 'export', label: 'Export', icon: Download, action: onExport, disabled: !exportEnabled },
      { id: 'share', label: 'Share', icon: Share2, action: onShare, disabled: !shareEnabled },
      {
        id: 'alerts',
        label: 'Alerts',
        icon: Bell,
        action: onNotifications,
        badge: pendingNotifications,
        badgeLabel: 'alerts pending',
      },
    ],
    [
      onDashboard,
      onFilters,
      onCompare,
      onExport,
      onNotifications,
      onShare,
      filterCount,
      pendingNotifications,
      compareEnabled,
      exportEnabled,
      shareEnabled,
    ]
  );

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.badge ? `${item.label} (${item.badge} ${item.badgeLabel})` : item.label}
          className={`mobile-nav__item ${active === item.id ? 'mobile-nav__item--active' : ''} ${
            item.disabled ? 'mobile-nav__item--disabled' : ''
          }`}
          disabled={item.disabled}
          aria-disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            setActive(item.id);
            item.action?.();
          }}
          aria-current={active === item.id ? 'page' : undefined}
        >
          <span className="mobile-nav__icon-wrapper">
            <item.icon size={18} />
            {item.badge ? (
              <span className="mobile-nav__badge" aria-live="polite">
                {item.badge}
              </span>
            ) : null}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
