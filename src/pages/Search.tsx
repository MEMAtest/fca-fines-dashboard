/**
 * Search Page - Enforcement Search
 */

import { EnforcementSearch } from '../components/EnforcementSearch.js';
import { useSEO } from '../hooks/useSEO.js';

export function Search() {
  useSEO({
    title: 'Enforcement Search | Regulatory Fines',
    description: 'Search live global regulatory enforcement actions by firm, regulator, country, and enforcement theme across FCA, SEC, SEBI, ECB, DFSA, and other tracked regulators.',
    keywords: 'enforcement search, AML search, compliance search, regulatory fines search, firm enforcement lookup',
  });

  return <EnforcementSearch />;
}
