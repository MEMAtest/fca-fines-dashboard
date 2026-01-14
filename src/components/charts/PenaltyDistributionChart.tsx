import { motion } from 'framer-motion';

const distributionData = [
  { sector: 'Market Abuse', amount: 1872, color: '#0FA294' },
  { sector: 'Conduct', amount: 1234, color: '#17C3B2' },
  { sector: 'Governance', amount: 876, color: '#6366F1' },
  { sector: 'Financial Crime', amount: 654, color: '#818CF8' },
  { sector: 'Client Assets', amount: 421, color: '#4F46E5' },
  { sector: 'Other', amount: 189, color: '#7C3AED' },
];

export function PenaltyDistributionChart() {
  const maxAmount = Math.max(...distributionData.map(d => d.amount));
  const width = 700;
  const height = 450;
  const padding = { top: 40, right: 40, bottom: 100, left: 100 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const barWidth = chartWidth / distributionData.length;
  const barPadding = barWidth * 0.2;

  return (
    <div className="chart-container">
      <svg width="100%" height={height} viewBox={'0 0 ' + width + ' ' + height}>
        <defs>
          {distributionData.map((d, i) => (
            <linearGradient key={i} id={'barGradient' + i} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={d.color} stopOpacity="0.9" />
              <stop offset="100%" stopColor={d.color} stopOpacity="0.6" />
            </linearGradient>
          ))}
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartHeight - ratio * chartHeight;
          return (
            <line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="rgba(15, 162, 148, 0.1)"
              strokeWidth="1"
            />
          );
        })}

        {distributionData.map((d, i) => {
          const barHeight = (d.amount / maxAmount) * chartHeight;
          const x = padding.left + i * barWidth + barPadding / 2;
          const y = padding.top + chartHeight - barHeight;

          return (
            <motion.g key={i}>
              <motion.rect
                x={x}
                y={y}
                width={barWidth - barPadding}
                height={barHeight}
                fill={'url(#barGradient' + i + ')'}
                rx="8"
                initial={{ scaleY: 0, originY: 1 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: 'easeOut' }}
                style={{ transformOrigin: '0 ' + (height - padding.bottom) + 'px' }}
              />

              <motion.text
                x={x + (barWidth - barPadding) / 2}
                y={y - 10}
                textAnchor="middle"
                fontSize="13"
                fill="#1F2937"
                fontWeight="600"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                {'£' + d.amount + 'm'}
              </motion.text>

              <text
                x={x + (barWidth - barPadding) / 2}
                y={height - padding.bottom + 20}
                textAnchor="end"
                fontSize="12"
                fill="#6B7280"
                transform={'rotate(-45 ' + (x + (barWidth - barPadding) / 2) + ' ' + (height - padding.bottom + 20) + ')'}
              >
                {d.sector}
              </text>

              <title>{'£' + d.amount + 'm - ' + d.sector}</title>
            </motion.g>
          );
        })}

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartHeight - ratio * chartHeight;
          const value = Math.round(ratio * maxAmount);
          return (
            <text
              key={ratio}
              x={padding.left - 15}
              y={y + 5}
              textAnchor="end"
              fontSize="12"
              fill="#6B7280"
            >
              {'£' + value + 'm'}
            </text>
          );
        })}

        <text
          x={width / 2}
          y={height - 10}
          textAnchor="middle"
          fontSize="14"
          fill="#1F2937"
          fontWeight="600"
        >
          Breach Type
        </text>

        <text
          x={20}
          y={height / 2}
          textAnchor="middle"
          fontSize="14"
          fill="#1F2937"
          fontWeight="600"
          transform={'rotate(-90 20 ' + (height / 2) + ')'}
        >
          Penalty Amount (£m)
        </text>
      </svg>

      <div className="chart-summary">
        <p><strong>Most penalized:</strong> Market Abuse with £1.87 billion in fines</p>
        <p><strong>Total sectors:</strong> 6 major breach categories tracked</p>
      </div>
    </div>
  );
}
