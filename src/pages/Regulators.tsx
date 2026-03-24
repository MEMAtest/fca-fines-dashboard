import { Link } from 'react-router-dom';
import { PUBLIC_REGULATOR_NAV_ITEMS } from '../data/regulatorCoverage';
import { useSEO } from '../hooks/useSEO';

export function Regulators() {
  useSEO({
    title: 'Regulatory Enforcement by Country | FCA Fines Database',
    description: 'Browse enforcement actions and fines from financial regulators across Europe including FCA, BaFin, AMF, CNMV, and CBI.',
  });

  return (
    <div className="regulators-index">
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1.5rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '1rem' }}>Financial Regulators</h1>
        <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '3rem' }}>
          Browse enforcement actions by regulator
        </p>

        <div
          className="regulator-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1.5rem',
            marginTop: '2rem'
          }}
        >
          {PUBLIC_REGULATOR_NAV_ITEMS.map((regulator) => (
            <Link
              key={regulator.code}
              to={regulator.overviewPath}
              className="regulator-card"
              style={{
                display: 'block',
                padding: '1.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 0.2s',
                backgroundColor: 'white',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{regulator.flag}</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.25rem', color: '#111827' }}>
                {regulator.code}
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                {regulator.fullName}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                {regulator.count.toLocaleString()} enforcement actions
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
