/**
 * Search Page - Natural Language Search
 * Phase 6A: Full-text search across all enforcement actions
 */

import { NaturalLanguageSearch } from '../components/NaturalLanguageSearch.js';
import { useSEO } from '../hooks/useSEO.js';

export function Search() {
  useSEO({
    title: 'Search Enforcement Actions | Natural Language Search',
    description: 'Search across live global regulatory enforcement actions from FCA, SEC, SEBI, ECB, DFSA, and other tracked regulators using natural language queries.',
    keywords: 'enforcement search, AML search, compliance search, regulatory fines search, natural language search',
  });

  return <NaturalLanguageSearch />;
}
