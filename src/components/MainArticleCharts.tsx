import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
  Area,
} from 'recharts';
import { yearlyFCAData } from './YearlyArticleCharts';

// Color palette matching the main site theme
const COLORS = ['#0FA294', '#6366F1', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981', '#F97316', '#06B6D4'];

// Format currency for display
const formatCurrency = (value: number): string => {
  if (value >= 1_000_000_000) {
    return `£${(value / 1_000_000_000).toFixed(2)}bn`;
  }
  if (value >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1)}m`;
  }
  if (value >= 1_000) {
    return `£${(value / 1_000).toFixed(0)}k`;
  }
  return `£${value.toFixed(0)}`;
};

// Data for Top 20 Biggest FCA Fines
const top20FinesData = [
  { firm: 'Barclays Bank Plc', amount: 284_432_000, year: 2015, breach: 'FX Manipulation' },
  { firm: 'UBS AG', amount: 233_814_000, year: 2014, breach: 'FX Manipulation' },
  { firm: 'Deutsche Bank AG', amount: 227_000_000, year: 2017, breach: 'AML - Mirror Trades' },
  { firm: 'Citibank N.A.', amount: 225_575_000, year: 2014, breach: 'FX Manipulation' },
  { firm: 'JP Morgan Chase', amount: 222_166_000, year: 2014, breach: 'FX Manipulation' },
  { firm: 'RBS Plc', amount: 217_000_000, year: 2014, breach: 'FX Manipulation' },
  { firm: 'HSBC Bank Plc', amount: 176_000_000, year: 2021, breach: 'AML Failures' },
  { firm: 'Credit Suisse', amount: 147_190_200, year: 2023, breach: 'Compliance Failures' },
  { firm: 'Lloyds Banking', amount: 117_000_000, year: 2015, breach: 'PPI Failures' },
  { firm: 'Santander UK', amount: 107_793_300, year: 2022, breach: 'AML Systems' },
  { firm: 'Standard Chartered', amount: 102_163_200, year: 2019, breach: 'AML' },
  { firm: 'Barclays Bank', amount: 72_069_400, year: 2015, breach: 'Financial Crime' },
  { firm: 'HSBC Bank', amount: 63_946_800, year: 2017, breach: 'AML' },
  { firm: 'Bank of Scotland', amount: 45_500_000, year: 2019, breach: 'HBOS Fraud' },
  { firm: 'Nationwide', amount: 44_000_000, year: 2025, breach: 'Financial Crime' },
  { firm: 'Barclays Bank', amount: 39_300_000, year: 2025, breach: 'AML' },
  { firm: 'Commerzbank', amount: 37_805_400, year: 2020, breach: 'AML' },
  { firm: 'Merrill Lynch', amount: 34_524_000, year: 2017, breach: 'Reporting' },
  { firm: 'Goldman Sachs', amount: 34_344_700, year: 2020, breach: '1MDB' },
  { firm: 'Aviva Insurance', amount: 30_600_000, year: 2016, breach: 'Non-advised Sales' },
];

// Top 20 FCA Fines Horizontal Bar Chart
export function Top20FinesChart() {
  const chartData = top20FinesData.map((item, index) => ({
    ...item,
    rank: index + 1,
    shortFirm: item.firm.length > 18 ? item.firm.substring(0, 18) + '...' : item.firm,
  }));

  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">Top 20 Largest FCA Fines of All Time</h4>
      <ResponsiveContainer width="100%" height={500}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="shortFirm"
            tick={{ fill: '#6B7280', fontSize: 10 }}
            width={110}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, _name: string, props: any) => [
              formatCurrency(value),
              `${props.payload.breach} (${props.payload.year})`
            ]}
          />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total: £2.01bn in top 20 fines alone | FX manipulation cases dominate with £1.1bn+ in penalties
      </p>
    </div>
  );
}

// Breakdown by breach type for Top 20
const breachTypeData = [
  { category: 'FX Manipulation', amount: 1_182_987_000, count: 6 },
  { category: 'AML/Financial Crime', amount: 683_998_700, count: 9 },
  { category: 'Consumer/PPI', amount: 147_600_000, count: 2 },
  { category: 'Other', amount: 34_524_000, count: 3 },
];

export function Top20BreachTypesChart() {
  const total = breachTypeData.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">Top 20 Fines by Breach Category</h4>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={breachTypeData}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
            labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
          >
            {breachTypeData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, _name: string, props: any) => [
              formatCurrency(value),
              `${props.payload.count} fines`
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span style={{ color: '#6B7280', fontSize: '12px' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total: {formatCurrency(total)} | FX manipulation represents 59% of top 20 fines
      </p>
    </div>
  );
}

// AML-specific fines data
const amlFinesData = [
  { firm: 'NatWest Group', amount: 264_772_619, year: 2021 },
  { firm: 'Deutsche Bank AG', amount: 163_076_224, year: 2017 },
  { firm: 'HSBC Bank Plc', amount: 176_000_000, year: 2021 },
  { firm: 'Santander UK', amount: 107_793_300, year: 2022 },
  { firm: 'Standard Chartered', amount: 102_163_200, year: 2019 },
  { firm: 'HSBC Bank', amount: 63_946_800, year: 2017 },
  { firm: 'Nationwide', amount: 44_000_000, year: 2025 },
  { firm: 'Barclays Bank', amount: 39_300_000, year: 2025 },
  { firm: 'Commerzbank AG', amount: 37_805_400, year: 2020 },
  { firm: 'Goldman Sachs', amount: 34_344_700, year: 2020 },
];

export function AMLFinesChart() {
  const chartData = amlFinesData.map((item) => ({
    ...item,
    shortFirm: item.firm.length > 16 ? item.firm.substring(0, 16) + '...' : item.firm,
  }));

  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">Largest AML-Related FCA Fines</h4>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="shortFirm"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={110}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, _name: string, props: any) => [
              formatCurrency(value),
              props.payload.year
            ]}
          />
          <Bar dataKey="amount" fill="#EC4899" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total AML fines shown: £1.03bn | NatWest received the largest criminal AML fine in UK history
      </p>
    </div>
  );
}

// AML fines by year trend
const amlTrendData = [
  { year: '2017', amount: 227_023_024 },
  { year: '2018', amount: 8_400_000 },
  { year: '2019', amount: 115_413_200 },
  { year: '2020', amount: 72_150_100 },
  { year: '2021', amount: 440_772_619 },
  { year: '2022', amount: 125_793_300 },
  { year: '2023', amount: 23_469_020 },
  { year: '2024', amount: 38_000_000 },
  { year: '2025', amount: 127_300_000 },
];

export function AMLTrendChart() {
  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">AML Enforcement Trend (2017-2025)</h4>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={amlTrendData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="year" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number) => [formatCurrency(value), 'AML Fines']}
          />
          <Area
            type="monotone"
            dataKey="amount"
            fill="rgba(236, 72, 153, 0.2)"
            stroke="#EC4899"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="amount"
            stroke="#EC4899"
            strokeWidth={3}
            dot={{ fill: '#EC4899', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        2021 saw record AML enforcement with NatWest criminal prosecution | 2025 continues strong focus
      </p>
    </div>
  );
}

// Bank fines data
const bankFinesData = [
  { bank: 'Barclays', total: 395_801_400, fines: 4 },
  { bank: 'HSBC', total: 239_946_800, fines: 2 },
  { bank: 'RBS/NatWest', total: 481_772_619, fines: 2 },
  { bank: 'UBS', total: 233_814_000, fines: 1 },
  { bank: 'Deutsche Bank', total: 227_000_000, fines: 1 },
  { bank: 'Citibank', total: 225_575_000, fines: 1 },
  { bank: 'JP Morgan', total: 222_166_000, fines: 1 },
  { bank: 'Lloyds Banking', total: 162_500_000, fines: 2 },
];

export function BankFinesComparisonChart() {
  const chartData = bankFinesData.map(item => ({
    ...item,
    avgFine: item.total / item.fines,
  }));

  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">FCA Fines by Major Bank</h4>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="bank"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string, props: any) => {
              if (name === 'total') return [formatCurrency(value), `Total (${props.payload.fines} fines)`];
              return [formatCurrency(value), 'Value'];
            }}
          />
          <Bar dataKey="total" fill="#6366F1" radius={[0, 4, 4, 0]} name="total" />
        </BarChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total bank fines: £2.19bn | RBS/NatWest group leads due to FX and AML penalties
      </p>
    </div>
  );
}

// All years enforcement trend
export function AllYearsEnforcementChart() {
  const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const data = years.map(year => ({
    year: year.toString(),
    amount: yearlyFCAData[year]?.totalAmount || 0,
    count: yearlyFCAData[year]?.totalFines || 0,
    avgFine: yearlyFCAData[year]?.avgFine || 0,
  }));

  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">FCA Enforcement Activity: 2013-2025</h4>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="year" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={70}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'amount') return [formatCurrency(value), 'Total Fines'];
              if (name === 'avgFine') return [formatCurrency(value), 'Average Fine'];
              return [value, 'Actions'];
            }}
          />
          <Legend />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="amount"
            fill="rgba(15, 162, 148, 0.2)"
            stroke="#0FA294"
            strokeWidth={2}
            name="Total Fines"
          />
          <Bar
            yAxisId="right"
            dataKey="count"
            fill="#6366F1"
            radius={[4, 4, 0, 0]}
            name="Actions"
            opacity={0.8}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Area: Annual fine totals | Bars: Number of enforcement actions | 2014-2015 FX scandal peak | 2021 record AML enforcement
      </p>
    </div>
  );
}

// Final Notices breakdown
const finalNoticesData = [
  { type: 'Financial Penalties', count: 285, percentage: 85 },
  { type: 'Public Censure', count: 32, percentage: 10 },
  { type: 'Prohibition Orders', count: 15, percentage: 5 },
];

export function FinalNoticesBreakdownChart() {
  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">FCA Final Notices by Outcome Type</h4>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={finalNoticesData}
            dataKey="count"
            nameKey="type"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            label={({ type, percentage }) => `${type} (${percentage}%)`}
            labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
          >
            {finalNoticesData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number) => [value, 'Notices']}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span style={{ color: '#6B7280', fontSize: '12px' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Based on 2013-2025 enforcement data | Financial penalties most common outcome
      </p>
    </div>
  );
}

// SM&CR related fines
const smcrFinesData = [
  { year: '2018', individuals: 5, firms: 2, totalAmount: 8_200_000 },
  { year: '2019', individuals: 12, firms: 4, totalAmount: 15_600_000 },
  { year: '2020', individuals: 8, firms: 3, totalAmount: 12_400_000 },
  { year: '2021', individuals: 15, firms: 5, totalAmount: 28_700_000 },
  { year: '2022', individuals: 11, firms: 4, totalAmount: 18_300_000 },
  { year: '2023', individuals: 9, firms: 3, totalAmount: 11_500_000 },
  { year: '2024', individuals: 14, firms: 6, totalAmount: 22_100_000 },
  { year: '2025', individuals: 4, firms: 2, totalAmount: 9_800_000 },
];

export function SMCREnforcementChart() {
  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">SM&CR Enforcement Activity (2018-2025)</h4>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={smcrFinesData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="year" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={40}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'totalAmount') return [formatCurrency(value), 'Total Fines'];
              if (name === 'individuals') return [value, 'Individuals'];
              return [value, 'Firms'];
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="individuals" fill="#0FA294" radius={[4, 4, 0, 0]} name="Individuals" />
          <Bar yAxisId="left" dataKey="firms" fill="#6366F1" radius={[4, 4, 0, 0]} name="Firms" />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="totalAmount"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={{ fill: '#F59E0B' }}
            name="Total Fines"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Bars: Actions against individuals and firms | Line: Total fine amounts | SM&CR enables individual accountability
      </p>
    </div>
  );
}

// 2025 specific charts (wrapper using yearly data)
export function Fines2025MonthlyChart() {
  const data = yearlyFCAData[2025]?.monthlyData || [];
  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">2025 Enforcement Activity by Month</h4>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={65}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'amount') return [formatCurrency(value), 'Fine Amount'];
              return [value, 'Actions'];
            }}
          />
          <Bar yAxisId="left" dataKey="amount" fill="#0FA294" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1' }} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Bar: Fine amounts | Line: Number of actions | Updated as new enforcement actions announced
      </p>
    </div>
  );
}

export function Fines2025BreachChart() {
  const data = yearlyFCAData[2025]?.breachData || [];
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">2025 Fines by Breach Category</h4>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            label={({ category, percent }) => `${category.split('/')[0]} (${(percent * 100).toFixed(0)}%)`}
            labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number) => [formatCurrency(value), 'Total Fines']}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span style={{ color: '#6B7280', fontSize: '12px' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total YTD: {formatCurrency(total)} | Financial crime/AML dominates 2025 enforcement
      </p>
    </div>
  );
}

// Cumulative FCA fines chart for database guide
export function CumulativeFinesChart() {
  const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  let cumulative = 0;
  const data = years.map(year => {
    cumulative += yearlyFCAData[year]?.totalAmount || 0;
    return {
      year: year.toString(),
      annual: yearlyFCAData[year]?.totalAmount || 0,
      cumulative,
    };
  });

  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">Cumulative FCA Fines: 2013-2025</h4>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="year" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'cumulative') return [formatCurrency(value), 'Cumulative Total'];
              return [formatCurrency(value), 'Annual Fines'];
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="cumulative"
            fill="rgba(15, 162, 148, 0.3)"
            stroke="#0FA294"
            strokeWidth={2}
            name="Cumulative Total"
          />
          <Bar dataKey="annual" fill="#6366F1" radius={[4, 4, 0, 0]} name="Annual Fines" opacity={0.7} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total fines since FCA establishment: {formatCurrency(cumulative)} | Data current to January 2025
      </p>
    </div>
  );
}

// ─── March 2026 Monthly Roundup Charts ─────────────────────────────────────────

// Q1 2026 enforcement tracker - monthly breakdown
const q1_2026_Data = [
  { month: 'Jan', fines: 2_520_000, actions: 5, firms: 0, individuals: 5 },
  { month: 'Feb', fines: 0, actions: 0, firms: 0, individuals: 0 },
  { month: 'Mar', fines: 0, actions: 0, firms: 0, individuals: 0 },
];

export function Q1_2026_EnforcementChart() {
  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">Q1 2026 Enforcement Activity by Month</h4>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={q1_2026_Data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={65}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'fines') return [formatCurrency(value), 'Total Fines'];
              if (name === 'individuals') return [value, 'Individuals'];
              if (name === 'firms') return [value, 'Firms'];
              return [value, 'Total Actions'];
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="fines" fill="#0FA294" radius={[4, 4, 0, 0]} name="Total Fines" />
          <Line yAxisId="right" type="monotone" dataKey="actions" stroke="#6366F1" strokeWidth={3} dot={{ fill: '#6366F1', strokeWidth: 2 }} name="Total Actions" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Updated as new enforcement actions are announced | January 2026: 5 individual actions totalling £2.52m
      </p>
    </div>
  );
}

// 2026 enforcement breakdown by action type (individuals vs firms)
const enforcement2026TypeData = [
  { category: 'Individual Financial Penalties', count: 3, amount: 2_160_000 },
  { category: 'Prohibition Orders', count: 2, amount: 360_000 },
  { category: 'Firm Penalties', count: 0, amount: 0 },
  { category: 'Criminal Prosecutions', count: 0, amount: 0 },
];

export function Enforcement2026BreakdownChart() {
  const activeData = enforcement2026TypeData.filter(d => d.count > 0);
  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">2026 Enforcement Actions by Type</h4>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={activeData.length > 0 ? activeData : [{ category: 'No data yet', count: 1, amount: 0 }]}
            dataKey="count"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            label={({ category, count }) => `${category} (${count})`}
            labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
          >
            {(activeData.length > 0 ? activeData : [{ category: 'No data', count: 1, amount: 0 }]).map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, _name: string, props: any) => [
              `${value} actions`,
              formatCurrency(props.payload.amount)
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span style={{ color: '#6B7280', fontSize: '12px' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        2026 YTD: 100% of enforcement actions target individuals | Updated as new actions announced
      </p>
    </div>
  );
}

// ─── Insurance Sector Charts ────────────────────────────────────────────────────

// Top insurance company fines
const insuranceFinesData = [
  { firm: 'Aviva Insurance', amount: 30_600_000, year: 2016, breach: 'Non-advised Sales' },
  { firm: 'Prudential', amount: 23_875_000, year: 2013, breach: 'AML Failures' },
  { firm: 'RSA Insurance', amount: 5_600_000, year: 2014, breach: 'Financial Reporting' },
  { firm: 'Stonebridge Int.', amount: 8_015_000, year: 2014, breach: 'PPI Mis-selling' },
  { firm: 'Homeserve', amount: 30_647_400, year: 2014, breach: 'Mis-selling & Complaints' },
  { firm: "Lloyd's of London", amount: 18_000_000, year: 2013, breach: 'Conduct Standards' },
  { firm: 'Swinton Group', amount: 7_380_000, year: 2013, breach: 'Mis-selling' },
  { firm: 'Liberty Mutual', amount: 5_300_000, year: 2018, breach: 'Claims Handling' },
  { firm: 'Ageas Insurance', amount: 3_500_000, year: 2015, breach: 'Claims Delays' },
  { firm: 'Zurich Insurance', amount: 2_275_000, year: 2014, breach: 'Data Security' },
];

export function InsuranceFinesChart() {
  const chartData = insuranceFinesData
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      shortFirm: item.firm.length > 16 ? item.firm.substring(0, 16) + '...' : item.firm,
    }));

  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">Largest FCA Fines Against Insurance Companies</h4>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="shortFirm"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={110}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, _name: string, props: any) => [
              formatCurrency(value),
              `${props.payload.breach} (${props.payload.year})`
            ]}
          />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total insurance sector fines shown: £135m+ | Mis-selling and AML failures dominate
      </p>
    </div>
  );
}

// Insurance fines by breach category
const insuranceBreachData = [
  { category: 'Mis-selling / Product', amount: 76_642_400, count: 4 },
  { category: 'AML / Financial Crime', amount: 23_875_000, count: 1 },
  { category: 'Conduct Standards', amount: 18_000_000, count: 1 },
  { category: 'Claims Handling', amount: 8_800_000, count: 2 },
  { category: 'Financial Reporting', amount: 5_600_000, count: 1 },
  { category: 'Data / Systems', amount: 2_275_000, count: 1 },
];

export function InsuranceBreachChart() {
  const total = insuranceBreachData.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">Insurance Fines by Breach Category</h4>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={insuranceBreachData}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={95}
            innerRadius={55}
            label={({ category, percent }) => `${category.split('/')[0].trim()} (${(percent * 100).toFixed(0)}%)`}
            labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
          >
            {insuranceBreachData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, _name: string, props: any) => [
              formatCurrency(value),
              `${props.payload.count} fines`
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span style={{ color: '#6B7280', fontSize: '12px' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Total: {formatCurrency(total)} | Mis-selling accounts for 57% of insurance sector fines
      </p>
    </div>
  );
}

// Insurance enforcement trend over years
const insuranceTrendData = [
  { year: '2013', amount: 49_255_000, count: 8 },
  { year: '2014', amount: 21_490_000, count: 12 },
  { year: '2015', amount: 7_100_000, count: 6 },
  { year: '2016', amount: 32_400_000, count: 5 },
  { year: '2017', amount: 4_200_000, count: 3 },
  { year: '2018', amount: 8_900_000, count: 4 },
  { year: '2019', amount: 3_600_000, count: 3 },
  { year: '2020', amount: 2_100_000, count: 2 },
  { year: '2021', amount: 5_400_000, count: 4 },
  { year: '2022', amount: 6_800_000, count: 3 },
  { year: '2023', amount: 12_300_000, count: 5 },
  { year: '2024', amount: 8_700_000, count: 4 },
  { year: '2025', amount: 4_200_000, count: 2 },
];

export function InsuranceTrendChart() {
  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">Insurance Sector Enforcement Trend (2013-2025)</h4>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={insuranceTrendData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="year" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={65}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'amount') return [formatCurrency(value), 'Total Fines'];
              return [value, 'Actions'];
            }}
          />
          <Legend />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="amount"
            fill="rgba(99, 102, 241, 0.2)"
            stroke="#6366F1"
            strokeWidth={2}
            name="Total Fines"
          />
          <Bar
            yAxisId="right"
            dataKey="count"
            fill="#0FA294"
            radius={[4, 4, 0, 0]}
            name="Actions"
            opacity={0.8}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">
        Area: Annual fine totals | Bars: Number of actions | 2013-2014 saw peak insurance enforcement activity
      </p>
    </div>
  );
}
