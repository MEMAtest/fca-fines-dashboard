export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <div className="hero skeleton" style={{ height: 220, marginBottom: 32 }} />
      <div className="filters skeleton" style={{ height: 160, marginBottom: 32 }} />
      <div className="grid">
        {[...Array(3)].map((_, index) => (
          <div key={`skeleton-${index}`} className="panel skeleton" style={{ height: 300 }} />
        ))}
      </div>
    </div>
  );
}
