import { motion } from 'framer-motion';

const finesData = [
  { year: '2013', amount: 475 },
  { year: '2014', amount: 1420 },
  { year: '2015', amount: 905 },
  { year: '2016', amount: 458 },
  { year: '2017', amount: 332 },
  { year: '2018', amount: 391 },
  { year: '2019', amount: 391 },
  { year: '2020', amount: 113 },
  { year: '2021', amount: 173 },
  { year: '2022', amount: 116 },
  { year: '2023', amount: 216 },
  { year: '2024', amount: 167 },
  { year: '2025', amount: 44 },
];

export function TotalAmountChart() {
  const maxAmount = Math.max(...finesData.map(d => d.amount));
  const width = 700;
  const height = 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = finesData.map((d, i) => {
    const x = padding.left + (i / (finesData.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.amount / maxAmount) * chartHeight;
    return { x, y, ...d };
  });

  const linePath = points
    .map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.y)
    .join(' ');

  const areaPath = linePath + ' L ' + points[points.length - 1].x + ' ' + (height - padding.bottom) + ' L ' + padding.left + ' ' + (height - padding.bottom) + ' Z';

  return (
    <div className="chart-container">
      <svg width="100%" height={height} viewBox={'0 0 ' + width + ' ' + height}>
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0FA294" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>

          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(15, 162, 148, 0.3)" />
            <stop offset="100%" stopColor="rgba(99, 102, 241, 0.05)" />
          </linearGradient>
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

        <motion.path
          d={areaPath}
          fill="url(#areaGradient)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        />

        <motion.path
          d={linePath}
          stroke="url(#lineGradient)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
        />

        {points.map((point, i) => (
          <motion.g key={i}>
            <motion.circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#0FA294"
              stroke="#FFFFFF"
              strokeWidth="2"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.05, duration: 0.3 }}
            />
            <title>{'£' + point.amount + 'm (' + point.year + ')'}</title>
          </motion.g>
        ))}

        {points.map((point, i) => (
          <text
            key={i}
            x={point.x}
            y={height - padding.bottom + 25}
            textAnchor="middle"
            fontSize="12"
            fill="#6B7280"
          >
            {point.year}
          </text>
        ))}

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
          Year
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
          Total Fines (£m)
        </text>
      </svg>

      <div className="chart-summary">
        <p><strong>Total fines from 2013-2025:</strong> £4,896,495,901</p>
        <p><strong>Peak year:</strong> 2014 with £1.42 billion in fines</p>
      </div>
    </div>
  );
}
