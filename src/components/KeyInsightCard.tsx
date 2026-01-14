import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface KeyInsightCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  index?: number;
}

export function KeyInsightCard({ icon, title, description, index = 0 }: KeyInsightCardProps) {
  return (
    <motion.div
      className="insight-card"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
      whileHover={{ y: -8, scale: 1.02 }}
    >
      <div className="insight-icon-wrapper">
        {icon}
      </div>
      <h3 className="insight-title">{title}</h3>
      <p className="insight-description">{description}</p>
    </motion.div>
  );
}
