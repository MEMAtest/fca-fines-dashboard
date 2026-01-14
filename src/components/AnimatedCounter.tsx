import { useEffect, useRef } from 'react';
import { motion, useSpring, useInView, useTransform } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function AnimatedCounter({
  value,
  label,
  prefix = '',
  suffix = '',
  decimals = 0,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  // Create spring animation for the counter
  const spring = useSpring(0, {
    damping: 50,
    stiffness: 100,
  });

  // Transform the spring value to display value
  const display = useTransform(spring, (current) => {
    return prefix + current.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
  });

  useEffect(() => {
    if (isInView) {
      spring.set(value);
    }
  }, [isInView, value, spring]);

  return (
    <div ref={ref} className="animated-counter">
      <motion.span
        className="counter__value"
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}
      >
        {display}
      </motion.span>
      <motion.span
        className="counter__label"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {label}
      </motion.span>
    </div>
  );
}
