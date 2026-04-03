/**
 * CountryModal - Detailed view of regulator coverage for a country
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, TrendingUp } from 'lucide-react';
import { getRegulatorsForCountry, type CountryRegulatorInfo } from '../data/countryRegulatorMapping.js';
import { fetchUnifiedStats } from '../api.js';
import { formatAmount } from '../hooks/useHomepageStats.js';
import { useNavigate } from 'react-router-dom';
import '../styles/country-modal.css';

interface RegulatorFines {
  total: number;
  average: number;
  maxFine: number;
}

interface CountryModalProps {
  countryCode: string | null;
  onClose: () => void;
}

export function CountryModal({ countryCode, onClose }: CountryModalProps) {
  const navigate = useNavigate();
  const countryInfo = countryCode ? getRegulatorsForCountry(countryCode) : null;
  const [finesByRegulator, setFinesByRegulator] = useState<Map<string, RegulatorFines>>(new Map());

  // Fetch fine amounts from unified stats API
  useEffect(() => {
    let cancelled = false;

    fetchUnifiedStats()
      .then(data => {
        if (cancelled) return;
        const map = new Map<string, RegulatorFines>();
        data.byRegulator.forEach(r => {
          map.set(r.regulator, {
            total: r.total,
            average: r.average,
            maxFine: r.maxFine,
          });
        });
        setFinesByRegulator(map);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Failed to fetch unified stats for modal:', err);
      });

    return () => { cancelled = true; };
  }, []);

  // Close on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (countryCode) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [countryCode, onClose]);

  if (!countryInfo) return null;

  const totalRecords = countryInfo.totalRecords;

  const handleViewRegulator = (regulatorCode: string) => {
    // FCA uses the main dashboard; all others use the regulator hub
    if (regulatorCode === 'FCA') {
      navigate('/dashboard');
    } else {
      navigate(`/regulators/${regulatorCode.toLowerCase()}`);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {countryCode && (
        <>
          {/* Backdrop */}
          <motion.div
            key="country-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="modal-backdrop"
          />

          {/* Modal centering container — must be motion.div for AnimatePresence exit */}
          <motion.div
            key="country-modal"
            className="country-modal-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="country-modal"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="country-modal__header">
                <div>
                  <h2 className="country-modal__title">{countryInfo.countryName}</h2>
                  <p className="country-modal__subtitle">{countryInfo.region} Region</p>
                </div>
                <button
                  onClick={onClose}
                  className="country-modal__close"
                  aria-label="Close modal"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Stats */}
              <div className="country-modal__stats">
                <div className="stat-card">
                  <span className="stat-card__label">Regulators</span>
                  <span className="stat-card__value">{countryInfo.regulators.length}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-card__label">Total Records</span>
                  <span className="stat-card__value">{totalRecords.toLocaleString()}</span>
                </div>
              </div>

              {/* Regulators */}
              <div className="country-modal__regulators">
                <h3>Financial Regulators</h3>
                <div className="regulator-cards">
                  {countryInfo.regulators.map((reg: CountryRegulatorInfo) => {
                    const fines = finesByRegulator.get(reg.code);
                    return (
                      <div key={reg.code} className="regulator-card">
                        <div className="regulator-card__header">
                          <span className="regulator-card__code">{reg.code}</span>
                          <span className="regulator-card__count">
                            {reg.count.toLocaleString()} records
                          </span>
                        </div>
                        <p className="regulator-card__name">{reg.fullName}</p>
                        {fines && fines.total > 0 && (
                          <div className="regulator-card__fines">
                            <div className="regulator-card__fine-item">
                              <span className="regulator-card__fine-label">Total Fines</span>
                              <span className="regulator-card__fine-value">
                                {formatAmount(fines.total)}
                              </span>
                            </div>
                            <div className="regulator-card__fine-item">
                              <span className="regulator-card__fine-label">Largest Fine</span>
                              <span className="regulator-card__fine-value">
                                {formatAmount(fines.maxFine)}
                              </span>
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => handleViewRegulator(reg.code)}
                          className="regulator-card__link"
                        >
                          View enforcement data <ExternalLink size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer CTA */}
              <div className="country-modal__footer">
                <button
                  onClick={() => handleViewRegulator(countryInfo.regulators[0].code)}
                  className="btn btn--primary"
                >
                  <TrendingUp size={18} />
                  View All {countryInfo.countryName} Data
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
