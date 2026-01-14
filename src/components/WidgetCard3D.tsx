import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface WidgetCard3DProps {
  label: string;
  value?: string;
  trend?: string;
  chart?: ReactNode;
  index: number;
  onClick?: () => void;
}

export function WidgetCard3D({
  label,
  value,
  trend,
  chart,
  index,
  onClick,
}: WidgetCard3DProps) {
  return (
    <motion.div
      className="widget-card-3d"
      style={{
        // @ts-ignore - CSS custom property
        '--card-index': index,
        cursor: onClick ? 'pointer' : 'default',
      }}
      initial={{ opacity: 0, y: 50, rotateX: -20 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.15, duration: 0.6 }}
      onClick={onClick}
      whileTap={{ scale: onClick ? 0.98 : 1 }}
    >
      <div className="widget-inner">
        <div className="widget-header">
          <span className="widget-label">{label}</span>
        </div>

        {value && (
          <div className="widget-value">
            {value}
            {trend && <span className="trend">{trend}</span>}
          </div>
        )}

        {chart && <div className="widget-chart">{chart}</div>}
      </div>

      {/* 3D edge glow effect */}
      <div className="widget-glow"></div>
    </motion.div>
  );
}

// Mini chart placeholders
export function MiniSparkline() {
  return (
    <svg className="mini-sparkline" width="100%" height="60" viewBox="0 0 200 60">
      <path
        d="M 10 50 Q 40 45 70 30 T 130 25 T 190 15"
        stroke="url(#sparklineGradient)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="sparklineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0FA294" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function MiniBarChart() {
  const bars = [
    { height: 30, color: '#0FA294' },
    { height: 45, color: '#17C3B2' },
    { height: 25, color: '#6366F1' },
    { height: 50, color: '#0FA294' },
    { height: 35, color: '#4F46E5' },
  ];

  return (
    <svg className="mini-bar-chart" width="100%" height="60" viewBox="0 0 150 60">
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={i * 30 + 5}
          y={60 - bar.height}
          width="20"
          height={bar.height}
          fill={bar.color}
          rx="2"
          opacity="0.8"
        />
      ))}
      <text x="5" y="55" fontSize="8" fill="#6B7280">21</text>
      <text x="35" y="55" fontSize="8" fill="#6B7280">22</text>
      <text x="65" y="55" fontSize="8" fill="#6B7280">23</text>
      <text x="95" y="55" fontSize="8" fill="#6B7280">24</text>
      <text x="125" y="55" fontSize="8" fill="#6B7280">25</text>
    </svg>
  );
}
