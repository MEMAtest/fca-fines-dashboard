/**
 * Search Page - Enforcement Search
 */

import { EnforcementExplorer } from '../components/EnforcementExplorer.js';
import { ProductWorkspaceShell } from '../components/ProductWorkspaceShell.js';
import { useSEO } from '../hooks/useSEO.js';

export function Search() {
  useSEO({
    title: 'Enforcement Explorer | Regulatory Evidence',
    description: 'Search live global regulatory enforcement actions by firm, regulator, country, and enforcement theme across FCA, SEC, SEBI, ECB, DFSA, and other tracked regulators.',
    keywords: 'enforcement search, AML search, compliance search, regulatory fines search, firm enforcement lookup',
    canonicalPath: '/search',
    ogTitle: 'Enforcement Search — RegActions',
    ogDescription: 'Search across 30+ global regulators and thousands of enforcement actions. Filter by firm, regulator, country, year, and fine amount.',
    ogType: 'website',
    ogImage: 'https://regactions.com/og-image.png',
  });

  return <ProductWorkspaceShell scope="search" title="Enforcement"><EnforcementExplorer /></ProductWorkspaceShell>;
}
