/**
 * Search Page - Natural Language Search
 * Phase 6A: Full-text search across all enforcement actions
 */

import { NaturalLanguageSearch } from '../components/NaturalLanguageSearch';
import { useSEO } from '../hooks/useSEO';

export function Search() {
  useSEO({
    title: 'Search Enforcement Actions | Natural Language Search',
    description: 'Search across regulatory enforcement actions from FCA, BaFin, AMF, CNMV, CBI, SFC, AFM, and DNB using natural language queries.',
    keywords: 'enforcement search, AML search, compliance search, regulatory fines search, natural language search',
  });

  return <NaturalLanguageSearch />;
}
