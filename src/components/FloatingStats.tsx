/**
 * FloatingStats - Data labels positioned around the globe
 *
 * Two visual styles matching reference design:
 * - "inside" labels: teal text on dark semi-transparent backgrounds (inside globe container)
 * - "outside" labels: white cards with drop shadows (overlapping globe container edge)
 */

import { motion } from 'framer-motion';

export interface FloatingStat {
  label: string;
  value: string;
  sublabel?: string;
  /** CSS positioning within globe-container */
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  /** Visual variant */
  variant: 'inside' | 'outside';
  /** Optional size */
  size?: 'sm' | 'md' | 'lg';
}

interface FloatingStatsProps {
  stats: FloatingStat[];
}

export function FloatingStats({ stats }: FloatingStatsProps) {
  return (
    <>
      {stats.map((stat, i) => (
        <motion.div
          key={i}
          className={`floating-stat floating-stat--${stat.variant} floating-stat--${stat.size || 'md'}`}
          initial={{ opacity: 0, scale: 0.9, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
          style={{
            position: 'absolute',
            top: stat.top,
            right: stat.right,
            bottom: stat.bottom,
            left: stat.left,
          }}
        >
          <div className="floating-stat__value">{stat.value}</div>
          <div className="floating-stat__label">{stat.label}</div>
          {stat.sublabel && (
            <div className="floating-stat__sublabel">{stat.sublabel}</div>
          )}
        </motion.div>
      ))}
    </>
  );
}
