export interface CompetitorEntry {
  name: string;
  category: 'direct_overlap' | 'adjacent_platform';
  url: string;
  positioning: string;
  enforcementCoverage: string;
  notes: string;
}

export const COMPETITOR_MAP_LAST_REVIEWED = '2026-03-25';

export const COMPETITOR_MAP: CompetitorEntry[] = [
  {
    name: 'LSEG World-Check On Demand',
    category: 'direct_overlap',
    url: 'https://www.lseg.com/en/risk-intelligence/screening-solutions/world-check-kyc-screening/world-check-on-demand',
    positioning: 'API-first risk intelligence and screening dataset',
    enforcementCoverage: 'Enforcement actions are bundled with sanctions, PEPs, and adverse media',
    notes: 'Closest commercial overlap on structured screening data, but not a regulator-first public database.',
  },
  {
    name: 'LexisNexis WorldCompliance Data',
    category: 'direct_overlap',
    url: 'https://risk.lexisnexis.com/products/worldcompliance-data',
    positioning: 'Global AML and compliance reference data',
    enforcementCoverage: 'Includes enforcement exposure alongside sanctions and adverse media',
    notes: 'Broad screening dataset rather than a dedicated regulator enforcement archive.',
  },
  {
    name: 'LexisNexis Firco Global WatchList',
    category: 'direct_overlap',
    url: 'https://risk.lexisnexis.com/global/en/products/firco-global-watchlist',
    positioning: 'Watchlist and screening data for AML and fraud controls',
    enforcementCoverage: 'Enforcement profiles appear inside the wider watchlist product',
    notes: 'Strong enterprise overlap, but the user experience is screening-led rather than regulator-led.',
  },
  {
    name: 'ComplyAdvantage',
    category: 'direct_overlap',
    url: 'https://complyadvantage.com/',
    positioning: 'AML screening, monitoring, and adverse media platform',
    enforcementCoverage: 'Enforcement exposure is part of broader risk intelligence workflows',
    notes: 'Competes on compliance operations, not on transparent public-source regulator archives.',
  },
  {
    name: 'MLex',
    category: 'direct_overlap',
    url: 'https://www.mlex.com/',
    positioning: 'Specialist legal and regulatory intelligence service',
    enforcementCoverage: 'Tracks probes, decisions, and enforcement developments with editorial depth',
    notes: 'Closer on insight quality than on database structure.',
  },
  {
    name: 'CUBE',
    category: 'adjacent_platform',
    url: 'https://cube.global/solutions/',
    positioning: 'Regulatory intelligence and change management platform',
    enforcementCoverage: 'Adjacent rather than enforcement-database focused',
    notes: 'Useful benchmark for enterprise compliance workflows, not direct public enforcement comparables.',
  },
  {
    name: 'Regology',
    category: 'adjacent_platform',
    url: 'https://www.regology.com/platform/',
    positioning: 'Regulatory change monitoring and workflow automation',
    enforcementCoverage: 'Limited emphasis on historical public penalties',
    notes: 'More relevant as a workflow competitor than a data archive competitor.',
  },
  {
    name: 'Ascent Horizon',
    category: 'adjacent_platform',
    url: 'https://www.ascentregtech.com/rlm-platform/ascent-horizon/',
    positioning: 'Regulatory lifecycle and horizon-scanning platform',
    enforcementCoverage: 'Focused on rule change and obligation management',
    notes: 'Adjacent intelligence offering, not a direct fines database substitute.',
  },
  {
    name: 'OneTrust DataGuidance',
    category: 'adjacent_platform',
    url: 'https://www.onetrust.com/products/data-guidance/',
    positioning: 'Research and regulatory guidance platform',
    enforcementCoverage: 'Primarily research and monitoring rather than enforcement databases',
    notes: 'More useful as a content benchmark than as a like-for-like data competitor.',
  },
];
