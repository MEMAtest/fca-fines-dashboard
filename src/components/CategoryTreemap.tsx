import { ResponsiveContainer, Treemap } from 'recharts';

interface CategoryTreemapProps {
  data: Array<{ name: string; size: number; count: number }>;
  year: number;
}

const COLORS = ['#10b981', '#0ea5e9', '#f97316', '#f43f5e', '#a855f7', '#eab308'];

export function CategoryTreemap({ data, year }: CategoryTreemapProps) {
  const formatted = data.map((item, index) => ({ ...item, fill: COLORS[index % COLORS.length] }));
  const title = year === 0 ? 'Top concerns across all years' : `Top ${year} concern areas`;

  return (
    <div className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Top categories</p>
          <h3>{title}</h3>
        </div>
      </div>
      {formatted.length === 0 ? (
        <p className="status">No breach categories surfaced for this selection yet.</p>
      ) : (
        <div className="treemap">
          <ResponsiveContainer width="100%" height={260}>
            <Treemap
              data={formatted}
              dataKey="size"
              stroke="#0f172a"
              content={({ root, depth, x, y, width, height, index }) => {
                if (depth === 1) {
                  return (
                    <g>
                      <rect x={x} y={y} width={width} height={height} fill={formatted[index].fill} opacity={0.85} />
                      <text x={x + 8} y={y + 24} fill="#0f172a" fontSize={14} fontWeight={600}>
                        {root.children?.[index]?.data?.name}
                      </text>
                      <text x={x + 8} y={y + 44} fill="#0f172a" fontSize={12}>
                        £{Math.round((root.children?.[index]?.data?.size ?? 0) / 1_000_000)}m • {root.children?.[index]?.data?.count}{' '}
                        fines
                      </text>
                    </g>
                  );
                }
                return null;
              }}
            />
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
