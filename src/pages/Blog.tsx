import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  TrendingUp,
  Shield,
  AlertTriangle,
  BookOpen,
  Scale,
  Building2,
  Users,
  ChevronRight,
  ExternalLink,
  Landmark,
  PoundSterling,
  BarChart3,
  Briefcase
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useSEO, injectStructuredData } from '../hooks/useSEO';
import {
  yearlyFCAData,
  MonthlyFinesChart,
  BreachCategoryChart,
  TopFirmsChart,
  YearOverYearChart,
} from '../components/YearlyArticleCharts';
import '../styles/blog.css';

interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  seoTitle: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: string;
  date: string;
  dateISO: string;
  icon: React.ReactNode;
  featured?: boolean;
  keywords: string[];
}

const blogArticles: BlogArticle[] = [
  {
    id: 'largest-fca-fines-history',
    slug: '20-biggest-fca-fines-of-all-time',
    title: '20 Biggest FCA Fines of All Time: Complete List & Analysis',
    seoTitle: '20 Biggest FCA Fines of All Time | Largest Financial Conduct Authority Penalties',
    excerpt: 'Complete list of the 20 largest FCA fines ever issued, from Barclays\' record £284 million penalty to Deutsche Bank\'s £227 million fine. Updated for 2025.',
    content: `
## The 20 Largest FCA Fines in History

The Financial Conduct Authority (FCA) has issued over £4.9 billion in fines since 2013. Here we analyse the 20 biggest FCA fines of all time, examining what went wrong and lessons for compliance teams.

## Top 20 FCA Fines - Complete List

### 1. Barclays Bank Plc - £284,432,000 (November 2015)
**The largest FCA fine ever issued.** Barclays was fined for failing to control business practices in its foreign exchange (FX) operations. Traders participated in improper G10 spot FX trading, sharing confidential information and attempting to manipulate currency rates.

**Key FCA Findings:**
- Failure to manage conflicts of interest
- Inadequate systems and controls over FX trading
- Improper sharing of confidential client information
- Attempted manipulation of FX benchmark rates

### 2. UBS AG - £233,814,000 (November 2014)
UBS received the second-largest FCA fine for significant failings in its FX business, including failure to properly manage conflicts of interest in treasury operations.

### 3. Deutsche Bank AG - £227,000,000 (January 2017)
Deutsche Bank was fined for serious anti-money laundering (AML) control failures related to a $10 billion Russian money laundering scheme through 'mirror trades'.

**AML Failures Identified:**
- Inadequate transaction monitoring
- Failure to investigate suspicious patterns
- Weak correspondent banking controls
- Poor oversight of high-risk business

### 4. Citibank N.A. - £225,575,000 (November 2014)
Part of the FX manipulation scandal, Citibank was fined for failures in its G10 spot FX trading business.

### 5. JP Morgan Chase Bank N.A. - £222,166,000 (November 2014)
JP Morgan received this fine as part of the coordinated FX manipulation enforcement action.

### 6. HSBC Bank Plc - £176,000,000 (December 2021)
HSBC was fined for significant failings in its anti-money laundering transaction monitoring systems affecting millions of customers over eight years.

### 7. Royal Bank of Scotland Plc - £217,000,000 (November 2014)
RBS was fined for FX trading failures and inadequate controls over its foreign exchange business.

### 8. Credit Suisse - £147,190,200 (2023)
Credit Suisse received multiple fines for various compliance failures including AML deficiencies.

### 9. Lloyds Banking Group - £117,000,000 (2015)
Fined for failures in handling PPI complaints fairly and treating customers appropriately.

### 10. Standard Chartered Bank - £102,163,200 (April 2019)
Standard Chartered was fined for AML control failures in its correspondent banking business.

### 11-20: Other Major FCA Fines

| Rank | Firm | Amount | Year | Reason |
|------|------|--------|------|--------|
| 11 | Coutts & Co | £8,750,000 | 2023 | AML failures |
| 12 | Santander UK | £107,793,300 | 2022 | AML systems failures |
| 13 | HSBC Bank | £63,946,800 | 2017 | AML failures |
| 14 | Bank of Scotland | £45,500,000 | 2019 | HBOS fraud failures |
| 15 | Barclays Bank | £72,069,400 | 2015 | Poor handling of financial crime |
| 16 | Nationwide | £44,000,000 | 2025 | Financial crime controls |
| 17 | Barclays | £39,300,000 | 2025 | AML - Stunt & Co |
| 18 | Goldman Sachs | £34,344,700 | 2020 | 1MDB failures |
| 19 | Aviva | £30,600,000 | 2016 | Non-advised sales |
| 20 | Merrill Lynch | £34,524,000 | 2017 | Reporting failures |

## Key Lessons from the Biggest FCA Fines

### 1. Anti-Money Laundering is Critical
AML failures account for 6 of the top 20 FCA fines. Firms must invest in:
- Robust transaction monitoring systems
- Adequate KYC and customer due diligence
- Suspicious activity reporting processes
- Regular AML training for staff

### 2. Market Conduct Matters
The FX scandal resulted in over £1.1 billion in fines to major banks. Key takeaways:
- Proper information barriers
- Surveillance of trading communications
- Clear policies on confidential information
- Strong first-line controls

### 3. Systems and Controls
Most large fines cite inadequate systems and controls. Investment in RegTech and compliance technology is essential.

## FCA Fines Statistics

- **Total FCA fines since 2013**: Over £4.9 billion
- **Average fine in top 20**: £156 million
- **Most common breach**: AML failures
- **Largest single fine**: £284 million (Barclays)
    `,
    category: 'FCA Fines List',
    readTime: '12 min read',
    date: 'January 2025',
    dateISO: '2025-01-15',
    icon: <Scale className="blog-card-icon" />,
    featured: true,
    keywords: ['biggest FCA fines', 'largest FCA fines', '20 biggest FCA fines', 'FCA fines list', 'top FCA fines', 'FCA fines of all time']
  },
  {
    id: 'fca-fines-2025',
    slug: 'fca-fines-2025-complete-list',
    title: 'FCA Fines 2025: Complete List of All Penalties This Year',
    seoTitle: 'FCA Fines 2025 | Complete List of Financial Conduct Authority Penalties',
    excerpt: 'Track all FCA fines issued in 2025. Updated list includes Nationwide £44m, Barclays £39m, and all enforcement actions. See total fines and trends.',
    content: `
## FCA Fines 2025 - Complete List

This page tracks all Financial Conduct Authority (FCA) fines issued in 2025. We update this list as new enforcement actions are announced.

## 2025 FCA Fines Summary

- **Total fines in 2025**: £179-186 million (to date)
- **Number of enforcement actions**: 12+
- **Largest fine**: £44 million (Nationwide)
- **Primary focus areas**: AML, financial crime controls

## Complete List of FCA Fines 2025

### Q1 2025 FCA Fines

#### Nationwide Building Society - £44,000,000 (January 2025)
**Reason**: Inadequate anti-financial crime systems and controls

The FCA fined Nationwide £44 million for significant failings in its financial crime controls between October 2016 and July 2021. Key issues included:
- Inadequate transaction monitoring
- Insufficient suspicious activity reporting
- Weak customer due diligence processes

#### Barclays Bank PLC - £39,300,000 (January 2025)
**Reason**: AML failures related to Stunt & Co client

Barclays was fined for serious failures in managing money laundering risks. The bank failed to:
- Conduct adequate enhanced due diligence
- Monitor transactions appropriately
- Respond to red flags

### Ongoing Investigations in 2025

The FCA has indicated increased enforcement activity in 2025, with investigations focusing on:
- Consumer Duty compliance
- Crypto asset firms
- Payment services providers
- Insurance intermediaries

## FCA Fines 2025 vs Previous Years

| Year | Total Fines | Number of Actions |
|------|-------------|-------------------|
| 2025 (YTD) | £179m+ | 12+ |
| 2024 | £176m | 27 |
| 2023 | £53m | 19 |
| 2022 | £215m | 24 |
| 2021 | £568m | 31 |

## 2025 Enforcement Trends

### 1. Focus on Financial Crime
The FCA continues to prioritise AML and financial crime enforcement, with several major fines already issued.

### 2. Consumer Duty Enforcement Beginning
2025 marks the first full year of Consumer Duty enforcement, with firms facing scrutiny over:
- Product governance
- Fair value assessments
- Customer communications
- Vulnerable customer treatment

### 3. Crypto and Digital Assets
Increased enforcement against unregistered crypto firms and those failing AML requirements.

## How to Avoid FCA Fines in 2025

1. **Review AML controls** - Ensure transaction monitoring is effective
2. **Implement Consumer Duty** - Complete gap analysis and remediation
3. **Enhance governance** - Clear accountability under SM&CR
4. **Invest in technology** - Modern compliance systems
5. **Train staff** - Regular, role-specific training
    `,
    category: 'FCA Fines 2025',
    readTime: '8 min read',
    date: 'January 2025',
    dateISO: '2025-01-18',
    icon: <PoundSterling className="blog-card-icon" />,
    featured: true,
    keywords: ['FCA fines 2025', 'FCA fines today', 'FCA fines this year', 'latest FCA fines', 'recent FCA fines', 'FCA enforcement 2025']
  },
  {
    id: 'fca-fines-database-guide',
    slug: 'fca-fines-database-how-to-search',
    title: 'FCA Fines Database: How to Search & Track All Penalties',
    seoTitle: 'FCA Fines Database | Search All Financial Conduct Authority Penalties',
    excerpt: 'Learn how to use the FCA fines database to search enforcement actions, track penalties by firm, and analyse regulatory trends from 2013-2025.',
    content: `
## FCA Fines Database Guide

Our FCA fines database provides comprehensive access to all Financial Conduct Authority penalties issued since 2013. This guide explains how to search and analyse FCA enforcement data.

## What is the FCA Fines Database?

The FCA fines database is a searchable collection of all enforcement actions taken by the Financial Conduct Authority. It includes:

- **Fine amounts** - Full penalty values in GBP
- **Firm details** - Names and categories of fined entities
- **Breach categories** - Types of regulatory failures
- **Date information** - When fines were issued
- **Final notice links** - Official FCA documentation

## How to Search the FCA Fines Database

### Search by Firm Name
Enter any firm name to find all FCA fines issued to that company. Examples:
- "Barclays" - Returns all Barclays fines
- "HSBC" - Shows HSBC enforcement actions
- "Lloyds" - Displays Lloyds Banking Group penalties

### Filter by Year
Select specific years to view FCA fines from that period:
- 2025, 2024, 2023... back to 2013
- Compare fines across different years
- Identify enforcement trends

### Filter by Breach Category
Find fines by type of regulatory failure:
- Anti-money laundering (AML)
- Market abuse
- Systems and controls
- Client money
- Treating customers fairly

### Filter by Amount
Search for fines within specific ranges:
- Over £100 million
- £10-100 million
- Under £10 million

## FCA Fines Database Statistics

### Total FCA Fines by Year

| Year | Total Amount | Number of Fines |
|------|-------------|-----------------|
| 2014 | £1.47 billion | 45 |
| 2015 | £905 million | 40 |
| 2016 | £22 million | 15 |
| 2017 | £229 million | 25 |
| 2018 | £60 million | 18 |
| 2019 | £392 million | 28 |
| 2020 | £189 million | 22 |
| 2021 | £568 million | 31 |
| 2022 | £215 million | 24 |
| 2023 | £53 million | 19 |
| 2024 | £176 million | 27 |
| 2025 | £179m+ | 12+ |

### FCA Fines by Breach Category

- **AML failures**: 25% of total fine value
- **Market abuse**: 20% of total fine value
- **Systems & controls**: 18% of total fine value
- **Client money**: 12% of total fine value
- **Conduct issues**: 25% of total fine value

## Using the FCA Fines Dashboard

Our interactive dashboard provides:

1. **Visual analytics** - Charts showing fine trends
2. **Export options** - Download data in CSV, Excel, PDF
3. **Comparison tools** - Year-on-year analysis
4. **Real-time updates** - Latest enforcement actions

## Official FCA Sources

The FCA publishes enforcement information through:
- Final Notices
- Decision Notices
- Warning Notices
- Annual Enforcement Report
    `,
    category: 'Database Guide',
    readTime: '10 min read',
    date: 'January 2025',
    dateISO: '2025-01-10',
    icon: <BookOpen className="blog-card-icon" />,
    featured: true,
    keywords: ['FCA fines database', 'FCA fines search', 'FCA enforcement database', 'FCA fines tracker', 'FCA penalty database']
  },
  {
    id: 'fca-aml-fines',
    slug: 'fca-aml-fines-anti-money-laundering',
    title: 'FCA AML Fines: Complete Guide to Anti-Money Laundering Penalties',
    seoTitle: 'FCA AML Fines | Anti-Money Laundering Penalties & Enforcement',
    excerpt: 'Comprehensive analysis of FCA AML fines totalling over £1.2 billion. Understand why anti-money laundering failures attract the largest FCA penalties.',
    content: `
## FCA AML Fines Overview

Anti-money laundering (AML) failures consistently attract the largest FCA fines. Since 2013, AML-related enforcement has totalled over £1.2 billion, representing approximately 25% of all FCA fines by value.

## Why AML Failures Attract Large FCA Fines

### Regulatory Priority
The FCA views AML compliance as fundamental. Failures indicate:
- Poor governance structures
- Inadequate resources
- Weak risk culture
- Systemic control issues

### International Pressure
The UK faces scrutiny from:
- Financial Action Task Force (FATF)
- International standards bodies
- US authorities (extraterritorial reach)

### Systemic Risk
Money laundering:
- Facilitates organised crime
- Enables terrorism financing
- Undermines market integrity
- Damages UK's reputation

## Largest FCA AML Fines

### 1. Deutsche Bank - £227,000,000 (2017)
Failed to maintain adequate AML controls regarding 'mirror trades' facilitating Russian money laundering.

### 2. HSBC - £176,000,000 (2021)
Significant failings in transaction monitoring systems affecting millions of customers.

### 3. Standard Chartered - £102,163,200 (2019)
AML control failures in correspondent banking business.

### 4. Santander UK - £107,793,300 (2022)
Serious and persistent gaps in AML controls.

### 5. Nationwide - £44,000,000 (2025)
Inadequate anti-financial crime systems and controls.

## Total FCA AML Fines by Year

| Year | AML Fines Total | % of All Fines |
|------|-----------------|----------------|
| 2017 | £290m | 90% |
| 2019 | £120m | 31% |
| 2021 | £264m | 46% |
| 2022 | £108m | 50% |
| 2023 | £8.7m | 16% |
| 2025 | £83m+ | 46%+ |

## Common AML Failures Leading to FCA Fines

### 1. Transaction Monitoring Deficiencies
- Inadequate automated systems
- Insufficient alert investigation
- Poor tuning and calibration
- Resource constraints

### 2. Customer Due Diligence Failures
- Incomplete KYC records
- Weak enhanced due diligence
- Failure to identify beneficial owners
- Poor ongoing monitoring

### 3. Suspicious Activity Reporting
- Late SAR submissions
- Inadequate internal escalation
- Poor quality reports
- Failure to act on red flags

### 4. Governance and Oversight
- Lack of board engagement
- Insufficient MLRO resources
- Poor risk assessment
- Inadequate policies

## How to Avoid FCA AML Fines

1. **Invest in technology** - Modern transaction monitoring
2. **Resource adequately** - Sufficient trained staff
3. **Regular risk assessment** - Keep pace with threats
4. **Board engagement** - Senior management oversight
5. **Independent testing** - Regular control reviews
    `,
    category: 'AML Fines',
    readTime: '11 min read',
    date: 'December 2024',
    dateISO: '2024-12-20',
    icon: <AlertTriangle className="blog-card-icon" />,
    keywords: ['FCA AML fines', 'anti-money laundering fines', 'AML fines UK', 'FCA money laundering fines', 'AML enforcement']
  },
  {
    id: 'fca-fines-banks',
    slug: 'fca-fines-banks-complete-list',
    title: 'FCA Fines to Banks: Complete List of Banking Sector Penalties',
    seoTitle: 'FCA Fines Banks | Complete List of Banking Sector Penalties',
    excerpt: 'Complete list of FCA fines issued to banks including Barclays, HSBC, Lloyds, NatWest, and more. Banking sector accounts for 65% of all FCA penalties.',
    content: `
## FCA Fines to Banks

The banking sector has historically attracted the largest share of FCA fines, accounting for approximately 65% of total penalties since 2013. This guide covers all major FCA fines to banks.

## FCA Fines by Bank - Major Institutions

### Barclays Bank FCA Fines
| Date | Amount | Reason |
|------|--------|--------|
| Nov 2015 | £284,432,000 | FX manipulation |
| Nov 2015 | £72,069,400 | Financial crime |
| Jan 2025 | £39,300,000 | AML - Stunt & Co |
| **Total** | **£395,801,400** | |

### HSBC Bank FCA Fines
| Date | Amount | Reason |
|------|--------|--------|
| Dec 2021 | £176,000,000 | AML failures |
| Sep 2017 | £63,946,800 | AML failures |
| Nov 2014 | £FX fine | FX manipulation |
| **Total** | **£240m+** | |

### Lloyds Banking Group FCA Fines
| Date | Amount | Reason |
|------|--------|--------|
| Jun 2015 | £117,000,000 | PPI complaints |
| Jun 2019 | £45,500,000 | HBOS fraud |
| Dec 2013 | £28,000,000 | Insurance sales |
| **Total** | **£190,500,000** | |

### NatWest/RBS FCA Fines
| Date | Amount | Reason |
|------|--------|--------|
| Nov 2014 | £217,000,000 | FX manipulation |
| Dec 2021 | £264,772,619 | AML failures |
| **Total** | **£481,772,619** | |

### Standard Chartered FCA Fines
| Date | Amount | Reason |
|------|--------|--------|
| Apr 2019 | £102,163,200 | AML failures |

### Santander UK FCA Fines
| Date | Amount | Reason |
|------|--------|--------|
| Dec 2022 | £107,793,300 | AML failures |

### Nationwide FCA Fines
| Date | Amount | Reason |
|------|--------|--------|
| Jan 2025 | £44,000,000 | Financial crime |

## Banking Sector Fine Breakdown

### By Sub-Sector
- **Investment Banking**: 45% of bank fines
- **Retail Banking**: 35% of bank fines
- **Private Banking**: 20% of bank fines

### By Breach Type
- **FX/Market Abuse**: £1.1 billion
- **AML Failures**: £800 million
- **Consumer Issues**: £300 million
- **Systems & Controls**: £200 million

## Why Banks Face Large FCA Fines

1. **Systemic importance** - Banks handle massive transaction volumes
2. **Regulatory focus** - High priority for FCA supervision
3. **Complex operations** - Multiple risk areas
4. **International exposure** - Cross-border activities

## Prevention Strategies for Banks

### Governance
- Clear accountability under SM&CR
- Board-level compliance oversight
- Independent risk functions

### Technology
- Automated surveillance systems
- Advanced transaction monitoring
- Real-time risk detection

### Culture
- Tone from the top
- Aligned incentives
- Speak-up culture
    `,
    category: 'Banking Fines',
    readTime: '10 min read',
    date: 'November 2024',
    dateISO: '2024-11-15',
    icon: <Building2 className="blog-card-icon" />,
    keywords: ['FCA fines banks', 'FCA fines Barclays', 'FCA fines HSBC', 'FCA fines Lloyds', 'FCA fines NatWest', 'banking fines UK']
  },
  {
    id: 'fca-enforcement-trends',
    slug: 'fca-enforcement-trends-2013-2025',
    title: 'FCA Enforcement Trends: Analysis of Fines 2013-2025',
    seoTitle: 'FCA Enforcement Trends | Fines Analysis 2013-2025',
    excerpt: 'Detailed analysis of FCA enforcement trends from 2013-2025. Track how total fines, average penalties, and regulatory focus areas have evolved.',
    content: `
## FCA Enforcement Trends 2013-2025

Since taking over from the FSA in 2013, the FCA has issued over £4.9 billion in fines. This analysis examines enforcement trends and patterns.

## Annual FCA Fines Summary

### FCA Fines by Year - Total Amounts

| Year | Total Fines | Actions | Avg Fine |
|------|-------------|---------|----------|
| 2014 | £1.47bn | 45 | £32.7m |
| 2015 | £905m | 40 | £22.6m |
| 2016 | £22m | 15 | £1.5m |
| 2017 | £229m | 25 | £9.2m |
| 2018 | £60m | 18 | £3.3m |
| 2019 | £392m | 28 | £14m |
| 2020 | £189m | 22 | £8.6m |
| 2021 | £568m | 31 | £18.3m |
| 2022 | £215m | 24 | £9m |
| 2023 | £53m | 19 | £2.8m |
| 2024 | £176m | 27 | £6.5m |
| 2025 | £179m+ | 12+ | £15m |

## Key Trend Analysis

### 1. Enforcement Cycles
FCA enforcement follows clear patterns:
- **2014-2015**: Post-FSA legacy issues, FX scandal
- **2016-2018**: Consolidation, lower volumes
- **2019-2021**: AML focus, major bank fines
- **2022-2025**: Consumer Duty, renewed enforcement

### 2. Average Fine Trends
- Peak average: £32.7m (2014)
- Lowest average: £1.5m (2016)
- Recent average: £10-15m
- Trend: Increasing again from 2023

### 3. Sector Shifts
- **2013-2017**: Banking dominated (75%)
- **2018-2021**: Insurance increase (35%)
- **2022-2025**: Broader distribution

### 4. Breach Category Trends
- **AML**: Consistent priority, largest fines
- **Market abuse**: Peaked 2014-2015
- **Consumer issues**: Increasing focus
- **Operational**: Emerging priority

## FCA Enforcement Priorities

### Current Focus Areas (2024-2025)
1. Anti-money laundering
2. Consumer Duty compliance
3. Operational resilience
4. Financial crime prevention
5. Crypto asset firms

### Emerging Areas
1. ESG and greenwashing
2. AI governance
3. Third-party risk
4. Cyber resilience

## Predictive Analysis

Based on trends, expect:
- Continued AML enforcement
- First Consumer Duty fines
- Increased crypto enforcement
- Individual accountability focus
- Data-driven investigations
    `,
    category: 'Trends Analysis',
    readTime: '9 min read',
    date: 'January 2025',
    dateISO: '2025-01-12',
    icon: <TrendingUp className="blog-card-icon" />,
    keywords: ['FCA enforcement trends', 'FCA fines history', 'FCA fines statistics', 'FCA fines data', 'FCA enforcement data']
  },
  {
    id: 'fca-final-notices',
    slug: 'fca-final-notices-explained',
    title: 'FCA Final Notices: Understanding Enforcement Decisions',
    seoTitle: 'FCA Final Notices | Understanding FCA Enforcement Decisions',
    excerpt: 'Complete guide to FCA final notices - what they are, what they contain, and how to find enforcement decisions for any firm.',
    content: `
## What are FCA Final Notices?

FCA final notices are official documents published when the Financial Conduct Authority concludes an enforcement action. They contain detailed information about regulatory breaches and resulting penalties.

## What Final Notices Contain

### Standard Sections
1. **Summary** - Overview of the case
2. **Facts and matters** - Detailed findings
3. **Failings** - Specific breaches identified
4. **Sanction** - Fine amount and rationale
5. **Procedural matters** - Settlement details

### Key Information
- Firm name and FRN
- Fine amount
- Breach period
- Regulatory provisions breached
- Aggravating/mitigating factors
- Settlement discount applied

## Types of FCA Notices

### Final Notice
Issued when enforcement is complete. Published on FCA website. Contains full details of failings and fine.

### Decision Notice
Issued before final notice if firm doesn't agree. Firm can refer to tribunal.

### Warning Notice
Initial notice of proposed action. Not usually published.

### Supervisory Notice
For non-disciplinary actions like requirements or restrictions.

## How to Find FCA Final Notices

### FCA Website
Search the FCA register and news section:
- Enforcement news stories
- Final notices database
- Regulatory decisions

### Our Dashboard
Use our FCA fines database to:
- Search by firm name
- Filter by year
- Link to original notices

## Reading a Final Notice

### Example: Major Bank AML Fine

**Penalty Calculation:**
- Starting figure based on revenue
- Adjusted for seriousness
- Settlement discount (30%)
- Final penalty amount

**Common Themes:**
- "Failed to take reasonable care"
- "Inadequate systems and controls"
- "Breach of Principle X"
- "Did not act with integrity"

## Using Final Notices for Compliance

### Learning from Others
Review final notices to:
- Identify common failures
- Understand FCA expectations
- Benchmark your controls
- Train staff on real cases

### Risk Assessment
Use enforcement data to:
- Prioritise compliance efforts
- Justify budget requests
- Update risk assessments
- Prepare for FCA visits
    `,
    category: 'Regulatory Guide',
    readTime: '8 min read',
    date: 'October 2024',
    dateISO: '2024-10-25',
    icon: <Landmark className="blog-card-icon" />,
    keywords: ['FCA final notices', 'FCA decision notices', 'FCA enforcement decisions', 'FCA warning notices', 'FCA regulatory decisions']
  },
  {
    id: 'senior-managers-regime-fines',
    slug: 'senior-managers-regime-fca-fines',
    title: 'Senior Managers Regime: Personal Liability & FCA Fines',
    seoTitle: 'Senior Managers Regime Fines | SM&CR Personal Liability',
    excerpt: 'How the Senior Managers & Certification Regime affects personal liability for FCA fines. Individual enforcement actions and accountability.',
    content: `
## Senior Managers Regime and FCA Fines

The Senior Managers and Certification Regime (SM&CR) has transformed individual accountability in financial services. Senior managers can now face personal FCA fines.

## SM&CR Overview

### Three Pillars
1. **Senior Managers Regime** - Individual accountability for senior roles
2. **Certification Regime** - Firm certification of key staff
3. **Conduct Rules** - Behavioral standards for all staff

### Key Features
- Statements of Responsibilities
- Duty of Responsibility
- Regulatory references
- Conduct rule breaches

## Individual FCA Fines Under SM&CR

### Statistics Since 2016
- **Individuals fined**: 45+
- **Total individual fines**: £18m+
- **Average fine**: £400,000
- **Prohibitions issued**: 120+

### Notable Individual Cases

**Case 1: Chief Compliance Officer - £76,000**
Failed to ensure adequate AML systems. Lesson: CCOs bear personal responsibility.

**Case 2: CEO - £642,000**
Failure to act with integrity, misleading FCA. Duty of candour paramount.

**Case 3: Head of Trading - £1.4m + prohibition**
Market manipulation. Conduct rules apply regardless of commercial pressure.

## The Duty of Responsibility

Senior managers can be held accountable if:
1. Firm breaches regulatory requirements
2. Breach occurs in their area of responsibility
3. They didn't take reasonable steps to prevent it

### "Reasonable Steps" Factors
- Nature and complexity of business
- Resources available
- Individual's knowledge and experience
- Actions taken to address known risks

## Protecting Yourself Under SM&CR

### Documentation
- Keep records of decisions
- Document oversight activities
- Maintain handover records
- Evidence of challenge

### Governance
- Clear delegation
- Regular MI review
- Escalation procedures
- Control testing

### Training
- Understand your responsibilities
- Know the conduct rules
- Regular refresher training
- Stay updated on enforcement

## Trends in Individual Enforcement

The FCA has signalled increased individual focus:
- More investigations of senior managers
- Greater use of prohibition powers
- Public censure of individuals
- Higher individual fines
    `,
    category: 'SM&CR',
    readTime: '10 min read',
    date: 'September 2024',
    dateISO: '2024-09-18',
    icon: <Users className="blog-card-icon" />,
    keywords: ['senior managers regime', 'SM&CR fines', 'individual FCA fines', 'personal liability FCA', 'senior manager accountability']
  }
];

// Yearly Analysis Articles with professional regulatory perspective
interface YearlyArticle {
  year: number;
  slug: string;
  title: string;
  seoTitle: string;
  excerpt: string;
  executiveSummary: string;
  regulatoryContext: string;
  keyEnforcementThemes: string[];
  professionalInsight: string;
  lookingAhead: string;
  keywords: string[];
}

const yearlyArticles: YearlyArticle[] = [
  {
    year: 2025,
    slug: 'fca-fines-2025-annual-review',
    title: 'FCA Fines 2025: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2025 | Complete Annual Enforcement Analysis',
    excerpt: 'Professional analysis of FCA enforcement in 2025, including Nationwide £44m and Barclays £39m fines. Consumer Duty enforcement begins.',
    executiveSummary: `The Financial Conduct Authority entered 2025 with renewed enforcement vigour, signalling that the post-pandemic pause in major regulatory action has definitively ended. With total fines already exceeding £179 million in the first quarter, 2025 is on track to be a significant enforcement year.

The headline actions against Nationwide Building Society (£44 million) and Barclays Bank (£39.3 million) for financial crime control failures demonstrate the regulator's continued prioritisation of anti-money laundering compliance. Notably, both fines relate to conduct that occurred several years prior, reflecting the FCA's methodical approach to building evidence-based cases.`,
    regulatoryContext: `2025 marks the first full year of Consumer Duty enforcement. Having implemented the new Consumer Duty in July 2023, with the closed products extension in July 2024, the FCA now has substantial supervisory data to identify firms falling short of the higher standards expected.

The FCA's published Business Plan emphasises three strategic priorities: reducing and preventing serious harm, setting higher standards, and promoting competition and positive change. The early 2025 enforcement actions align precisely with the 'reducing harm' objective, particularly around financial crime facilitation.

From a regulatory architecture perspective, the FCA continues to operate alongside the Prudential Regulation Authority (PRA) under the post-financial crisis 'twin peaks' model. The coordination between regulators remains critical, particularly for dual-regulated firms.`,
    keyEnforcementThemes: [
      'Financial crime controls remain paramount - AML/CTF failures attract substantial penalties',
      'Consumer Duty first enforcement actions expected mid-2025',
      'Operational resilience requirements now fully in force',
      'Cryptoasset firm scrutiny intensifying',
      'Individual accountability under SM&CR increasingly applied'
    ],
    professionalInsight: `Having observed FCA enforcement patterns over multiple cycles, the early 2025 actions suggest a deliberate strategy to set expectations for the year ahead. The Nationwide and Barclays fines serve as clear signals to the industry that financial crime control deficiencies will be pursued vigorously.

For compliance professionals, the critical lesson is that transaction monitoring systems must be demonstrably effective - not merely present. The FCA's willingness to fine a building society with strong retail credentials demonstrates that reputation provides no shield against enforcement action.

The anticipated Consumer Duty enforcement will likely focus on price and value outcomes initially, where the FCA has clearest data through product governance disclosures. Firms should conduct robust fair value assessments and be prepared to evidence customer outcomes.`,
    lookingAhead: `The remainder of 2025 will likely see the first Consumer Duty enforcement actions, potentially in retail banking or insurance sectors. The FCA has indicated that it will take a proportionate approach, but firms demonstrating systemic failures to consider customer outcomes should expect robust regulatory response.

Cryptoasset enforcement will accelerate as the FCA's registration regime matures and firms fail to meet anti-money laundering requirements. The appointed representatives regime also remains under scrutiny following principal firm failures.`,
    keywords: ['FCA fines 2025', 'FCA enforcement 2025', 'Nationwide FCA fine', 'Barclays AML fine 2025', 'Consumer Duty enforcement', 'FCA annual review 2025']
  },
  {
    year: 2024,
    slug: 'fca-fines-2024-annual-review',
    title: 'FCA Fines 2024: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2024 | Complete Annual Enforcement Analysis',
    excerpt: 'Comprehensive review of FCA enforcement in 2024: £176m total fines, operational resilience focus, and TSB IT failure fine of £48.6m.',
    executiveSummary: `2024 represented a transitional year for FCA enforcement, with total fines of approximately £176 million across 27 enforcement actions. While this figure is lower than peak enforcement years, it reflects the FCA's strategic shift towards proactive supervision and early intervention rather than reliance on ex-post penalties.

The year's most significant enforcement action was the £48.65 million fine against TSB Bank for its 2018 IT migration failure. This case, which took over six years to conclude, illustrates the complexity of major enforcement investigations and the FCA's thorough approach to evidence gathering.`,
    regulatoryContext: `2024 marked the final year of Consumer Duty implementation, with the extension to closed products and services taking effect in July 2024. The FCA dedicated substantial supervisory resource to assessing firm readiness, with enforcement activity expected to follow in subsequent years for firms failing to meet the new standards.

Operational resilience requirements became increasingly prominent, with the FCA working alongside the PRA to assess firm compliance with the March 2022 policy statement. The TSB fine served as a powerful reminder of the consequences of operational failures affecting customer access to banking services.

The regulatory landscape also saw continued evolution of the cryptoasset framework, with the FCA maintaining its consumer warnings while processing registration applications under the MLR regime.`,
    keyEnforcementThemes: [
      'Operational resilience failures attract significant penalties',
      'IT system migrations require robust governance and testing',
      'Consumer Duty implementation assessment ongoing',
      'Data protection and cyber security remain priorities',
      'Continued focus on AML systems and controls'
    ],
    professionalInsight: `The TSB enforcement action provides crucial lessons for the industry. The £48.65 million fine reflected not only the IT migration failure itself, but fundamental governance weaknesses in project oversight. Boards must ensure they receive adequate management information on major technology programmes and maintain appropriate challenge of executive assurances.

From a regulatory relationship perspective, 2024 demonstrated the value of proactive engagement with supervisors. Firms that self-identified issues and presented credible remediation plans generally received more constructive regulatory engagement than those where problems were identified through supervision or complaints data.

The Consumer Duty implementation work revealed significant variance in firm approaches. Leading firms embedded customer outcomes into product governance from inception, while laggards treated compliance as a documentation exercise.`,
    lookingAhead: `2024 set the stage for more intensive Consumer Duty enforcement in 2025. The FCA accumulated substantial data through implementation reviews and will use this to identify outlier firms for closer scrutiny.

Operational resilience will remain a priority, particularly as firms increasingly rely on third-party technology providers. The FCA's interest in concentration risk in critical third parties will likely drive future supervisory and potentially enforcement action.`,
    keywords: ['FCA fines 2024', 'TSB FCA fine', 'FCA enforcement 2024', 'operational resilience FCA', 'IT migration failures', 'FCA annual review 2024']
  },
  {
    year: 2023,
    slug: 'fca-fines-2023-annual-review',
    title: 'FCA Fines 2023: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2023 | Complete Annual Enforcement Analysis',
    excerpt: 'Analysis of FCA enforcement in 2023: £53m total fines, Credit Suisse Archegos failures, and individual accountability focus.',
    executiveSummary: `2023 was characterised by relatively modest total fine values (approximately £53 million across 19 actions) but significant thematic importance. The FCA's enforcement actions reflected post-pandemic priorities: addressing risk management failures exposed by market volatility and pursuing individual accountability with renewed focus.

The Credit Suisse fine of £14.7 million for Archegos-related failures marked the UK regulatory conclusion to a global scandal that contributed to the firm's eventual demise. While modest compared to US penalties, the case demonstrated the FCA's willingness to pursue international institutions for UK-relevant conduct failures.`,
    regulatoryContext: `2023 was dominated by Consumer Duty implementation preparations. The July 2023 implementation deadline for open products consumed significant firm and regulatory resource, with the FCA conducting extensive supervisory engagement to assess readiness.

The collapse of Silicon Valley Bank UK and subsequent rescue by HSBC in March 2023 highlighted ongoing financial stability concerns, though resolution occurred without material losses to depositors. The episode reinforced the importance of robust liquidity management and prompted regulatory reflection on deposit concentration risks.

Cryptoasset regulation continued to evolve, with the FCA maintaining a cautious approach while the government developed the future regulatory framework through Treasury consultations.`,
    keyEnforcementThemes: [
      'Risk management failures from 2021 market volatility addressed',
      'Individual accountability increasingly pursued under SM&CR',
      'AML enforcement continued but at lower intensity',
      'Consumer Duty preparation dominated supervisory focus',
      'Smaller firms faced proportionate enforcement for specific breaches'
    ],
    professionalInsight: `The Credit Suisse enforcement action provides essential lessons on risk management governance. The firm's failures were fundamentally about inadequate limits, poor escalation, and insufficient board challenge - classic governance failures that transcend specific market events.

For risk professionals, the case reinforces that concentration limits exist for sound reasons and that exceptions require rigorous governance. The Archegos prime brokerage relationship involved total return swaps that masked the underlying position concentration, highlighting the importance of look-through analysis.

The relatively low total fine volume in 2023 should not be interpreted as reduced regulatory intensity. The FCA was actively investigating cases that would emerge in subsequent years while dedicating substantial resource to Consumer Duty implementation oversight.`,
    lookingAhead: `2023 positioned the industry for the Consumer Duty era. Firms that invested genuinely in understanding customer outcomes and embedding appropriate governance would be well-placed for the new regulatory environment. Those treating compliance as a documentation exercise would face increasing supervisory pressure and eventual enforcement risk.

The Credit Suisse collapse, while driven by multiple factors, served as a reminder that accumulated regulatory and risk management failures can prove existential for even systemically important institutions.`,
    keywords: ['FCA fines 2023', 'Credit Suisse FCA fine', 'Archegos FCA', 'FCA enforcement 2023', 'individual accountability FCA', 'FCA annual review 2023']
  },
  {
    year: 2022,
    slug: 'fca-fines-2022-annual-review',
    title: 'FCA Fines 2022: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2022 | Complete Annual Enforcement Analysis',
    excerpt: 'Comprehensive review of FCA enforcement in 2022: £215m total fines led by Santander £108m AML penalty. Audit quality focus emerges.',
    executiveSummary: `2022 saw FCA enforcement return to more typical levels following the pandemic-affected period, with total fines of approximately £215 million across 24 actions. The headline case was Santander UK's £107.8 million fine for serious and persistent AML control gaps - the largest AML fine since the NatWest criminal prosecution.

The year also marked increased attention to audit quality, with KPMG facing a £14.4 million fine for audit failures - reflecting coordinated regulatory focus alongside the Financial Reporting Council on audit standards in the financial services sector.`,
    regulatoryContext: `2022 represented the final preparatory phase before Consumer Duty implementation. The FCA published final rules in July 2022, giving firms until July 2023 for open products. This regulatory development represented the most significant conduct framework change since the Retail Distribution Review.

The Russia-Ukraine conflict prompted extensive sanctions compliance work across the industry. While no major FCA enforcement emerged directly from sanctions failures in 2022, the FCA issued clear expectations on controls and monitoring, with enforcement risk for firms failing to implement adequate procedures.

Operational resilience rules took effect in March 2022, requiring firms to identify important business services and set impact tolerances. The three-year transition period began, with firms required to demonstrate compliance by March 2025.`,
    keyEnforcementThemes: [
      'AML system failures attract record retail banking fine',
      'Audit quality receives coordinated regulatory attention',
      'PEP (Politically Exposed Persons) due diligence scrutinised',
      'Consumer credit firm enforcement continues',
      'Individual accountability cases progress through the system'
    ],
    professionalInsight: `The Santander fine warrants careful analysis by compliance professionals. The FCA identified that the bank opened over 49,000 business accounts without completing required AML checks - a systemic failure rather than isolated incidents. The penalty calculation reflected both the seriousness and the persistence of the failings.

For AML practitioners, the case demonstrates that transaction monitoring is necessary but not sufficient. Customer due diligence at onboarding forms the foundation of effective AML controls. When CDD is incomplete, subsequent monitoring operates with fundamental information gaps that undermine effectiveness.

The KPMG fine signals that auditors of financial services firms face regulatory accountability alongside their clients. This creates incentives for more robust audit challenge, which should ultimately strengthen control environments across the industry.`,
    lookingAhead: `2022 enforcement actions set the scene for continued AML focus in subsequent years. The FCA demonstrated willingness to pursue large retail institutions, not just wholesale or international banks. Firms should assume their AML controls will face supervisory scrutiny regardless of their business model.

The Consumer Duty implementation deadline created significant work for 2023, with firms needing to demonstrate genuine customer outcome focus rather than compliance box-ticking.`,
    keywords: ['FCA fines 2022', 'Santander FCA fine', 'AML fines 2022', 'KPMG FCA fine', 'FCA enforcement 2022', 'FCA annual review 2022']
  },
  {
    year: 2021,
    slug: 'fca-fines-2021-annual-review',
    title: 'FCA Fines 2021: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2021 | Complete Annual Enforcement Analysis',
    excerpt: 'Historic year: £568m total FCA fines including first criminal prosecution (NatWest £265m) and HSBC £176m AML fine.',
    executiveSummary: `2021 was a watershed year for FCA enforcement, with total fines reaching approximately £568 million - the highest since the FX scandal years of 2014-15. Two cases dominated: NatWest's criminal prosecution resulting in a £264.8 million fine (the first criminal conviction of a bank by the FCA), and HSBC's £176 million penalty for transaction monitoring failures.

These landmark cases demonstrated the FCA's willingness to use its full range of enforcement powers, including criminal prosecution for money laundering offences. The message to the industry was unambiguous: AML compliance failures carry existential risks.`,
    regulatoryContext: `2021 saw the UK financial services sector adjust to post-Brexit regulatory independence. The FCA assumed responsibilities previously held by EU authorities, including oversight of UK branches of EEA firms. This expanded remit increased supervisory demands on both firms and the regulator.

The FCA published its Transformation Programme, committing to become a more innovative, assertive, and adaptive regulator. The programme's emphasis on data-led supervision and proactive intervention signalled a shift from purely reactive enforcement.

The COVID-19 pandemic continued to affect regulatory priorities, with the FCA maintaining business interruption insurance investigation while also addressing emerging conduct risks in the retail investment market, particularly around high-risk investments and financial promotions.`,
    keyEnforcementThemes: [
      'Criminal prosecution used for first time against major bank',
      'Transaction monitoring systems face intensive scrutiny',
      'Cash deposit monitoring highlighted as critical control',
      'AML leadership and governance under spotlight',
      'Post-pandemic enforcement activity accelerates'
    ],
    professionalInsight: `The NatWest criminal prosecution represents a paradigm shift in UK AML enforcement. The case demonstrated that the FCA will use criminal powers where evidence supports charges, regardless of institutional size or reputation. The offence - failing to prevent money laundering through inadequate suspicious activity reporting - sets a precedent with significant implications for compliance frameworks.

The case facts are instructive: over £365 million in cash deposits through one customer account over five years, with obvious red flags that were not adequately investigated or reported. This was not a sophisticated scheme requiring advanced detection capabilities - it was basic AML failure.

The HSBC fine reinforced the transaction monitoring theme. The FCA found that systems were inadequate to monitor the volume and complexity of transactions, with over 40 million customers affected by the deficiencies over eight years. The remediation cost reportedly exceeded the fine amount.

For MLROs and compliance leaders, 2021 established that personal accountability accompanies institutional responsibility. Regulators expect to see documented evidence of appropriate challenge, resource requests, and escalation where necessary.`,
    lookingAhead: `The 2021 enforcement actions set a new baseline for AML expectations. Firms should assume that their transaction monitoring systems will face detailed supervisory review and that criminal prosecution remains available for serious failures.

The Consumer Duty consultation published in December 2021 signalled the next major regulatory development, with implementation expected to reshape conduct standards across retail financial services.`,
    keywords: ['FCA fines 2021', 'NatWest criminal prosecution', 'NatWest FCA fine', 'HSBC AML fine', 'FCA enforcement 2021', 'money laundering prosecution UK']
  },
  {
    year: 2020,
    slug: 'fca-fines-2020-annual-review',
    title: 'FCA Fines 2020: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2020 | Complete Annual Enforcement Analysis',
    excerpt: 'COVID-impacted year: £189m fines including Goldman Sachs 1MDB £34m and Commerzbank £38m AML penalties.',
    executiveSummary: `2020 was inevitably shaped by the COVID-19 pandemic, with total FCA fines of approximately £189 million across 22 enforcement actions. While lower than preceding years, enforcement continued for cases already in the pipeline, with notable actions against Goldman Sachs International (£34.3 million for 1MDB-related failures) and Commerzbank AG London (£37.8 million for AML deficiencies).

The pandemic prompted the FCA to prioritise operational continuity and consumer protection over enforcement activity, though the regulator maintained that firms remained accountable for conduct standards regardless of operational challenges.`,
    regulatoryContext: `The FCA's regulatory response to COVID-19 dominated 2020. The regulator provided extensive forbearance guidance across mortgage, consumer credit, and insurance markets, while simultaneously monitoring for firms exploiting the crisis or failing to treat customers fairly during financial difficulty.

The operational shift to remote working raised new conduct risks, particularly around market abuse surveillance and conflicts of interest in wholesale markets. The FCA issued specific guidance on expectations while acknowledging the practical challenges firms faced.

Brexit preparations continued alongside pandemic response, with firms required to maintain implementation plans despite resource constraints. The end of the transition period on 31 December 2020 marked the beginning of the UK's independent regulatory path.`,
    keyEnforcementThemes: [
      'International bribery and corruption enforcement (1MDB)',
      'AML controls at overseas branches of UK-supervised firms',
      'Pre-pandemic conduct failures continued through enforcement',
      'COVID-19 not accepted as excuse for compliance failures',
      'Remote working conduct risks emerge as supervisory focus'
    ],
    professionalInsight: `The Goldman Sachs 1MDB fine illustrates the extraterritorial reach of UK enforcement and the importance of subsidiary governance. The failures occurred primarily in Goldman's Asia-Pacific operations, but the FCA pursued the London-supervised entity for control failures that enabled the misconduct.

For firms with international operations, this case reinforces that UK regulated entities bear responsibility for control frameworks across their global operations. The FCA expects appropriate information flows, challenge mechanisms, and escalation procedures regardless of where business is conducted.

The Commerzbank case addressed AML controls in the London branch, finding material weaknesses in correspondent banking and customer due diligence. The FCA's ability to supervise overseas bank branches effectively remains a priority, particularly post-Brexit as new branch authorisations are processed.

The pandemic response demonstrated the FCA's capacity to adapt its supervisory approach while maintaining core expectations. Firms that used COVID-19 as an excuse for compliance failures found no regulatory sympathy.`,
    lookingAhead: `2020 established that pandemic conditions would not indefinitely pause enforcement. Cases under investigation continued to progress, with the major NatWest and HSBC AML actions emerging in 2021.

The FCA's 'Dear CEO' letters during 2020 signalled post-pandemic priorities, including operational resilience, financial crime controls, and treatment of customers in financial difficulty.`,
    keywords: ['FCA fines 2020', 'Goldman Sachs FCA fine', '1MDB UK', 'Commerzbank AML fine', 'COVID-19 FCA', 'FCA enforcement 2020']
  },
  {
    year: 2019,
    slug: 'fca-fines-2019-annual-review',
    title: 'FCA Fines 2019: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2019 | Complete Annual Enforcement Analysis',
    excerpt: 'Strong enforcement year: £392m total fines including Standard Chartered £102m AML and Bank of Scotland £45.5m HBOS fraud case.',
    executiveSummary: `2019 represented a return to robust enforcement levels with total fines of approximately £392 million across 28 actions. The year was marked by the Standard Chartered £102.2 million AML fine - one of the largest ever for correspondent banking failures - and the long-awaited conclusion of the HBOS fraud accountability cases against Bank of Scotland and Lloyds Bank (£45.5 million each).

The Senior Managers and Certification Regime (SM&CR) extended to solo-regulated firms in December 2019, significantly expanding the population of senior managers subject to enhanced accountability requirements.`,
    regulatoryContext: `2019 saw the FCA's enforcement approach mature following the structural reforms of preceding years. The Division of Enforcement increasingly focused on cases with clear consumer harm or market integrity implications, with a stated preference for intervention over investigation where possible.

The extension of SM&CR to approximately 47,000 solo-regulated firms represented the most significant expansion of individual accountability since the regime's introduction. The FCA invested substantially in guidance and engagement to support implementation.

The cryptoasset regulatory perimeter debate intensified, with the FCA assuming anti-money laundering supervision of cryptoasset firms from January 2020. The registration regime established high barriers that many firms subsequently failed to meet.`,
    keyEnforcementThemes: [
      'Correspondent banking AML controls face intensive scrutiny',
      'HBOS fraud accountability finally achieved',
      'SM&CR extension creates new individual accountability',
      'Customer due diligence standards reinforced',
      'Insurance sector enforcement activity increases'
    ],
    professionalInsight: `The Standard Chartered case provides a masterclass in correspondent banking AML requirements. The FCA found failures in customer risk assessment, transaction monitoring, and enhanced due diligence for higher-risk relationships. Critically, the bank failed to implement lessons from a 2012 enforcement action - demonstrating that repeat failures attract more severe penalties.

The HBOS fraud cases finally brought accountability for the Reading fraud scandal, where bank employees conspired with external parties to defraud business customers. The delay between conduct (2003-2007) and enforcement (2019) reflects the complexity of such cases but also raised questions about timely justice.

For compliance professionals, 2019 reinforced that correspondent banking remains a high-risk area requiring dedicated expertise and resources. The 'know your customer's customer' principle applies with particular force in this context.

The SM&CR extension required solo-regulated firms to implement governance frameworks appropriate to their size and complexity. The FCA's proportionate approach acknowledged that a small IFA firm requires different arrangements than a large wealth manager.`,
    lookingAhead: `2019 positioned the FCA for the challenges of 2020, though no one anticipated the pandemic's impact. The correspondent banking enforcement activity signalled continued focus on cross-border AML risks, while SM&CR extension promised future individual accountability cases.

The cryptoasset registration deadline of January 2020 set up inevitable enforcement action against firms operating without authorisation.`,
    keywords: ['FCA fines 2019', 'Standard Chartered FCA fine', 'HBOS fraud FCA', 'Bank of Scotland fine', 'SM&CR extension', 'correspondent banking AML']
  },
  {
    year: 2018,
    slug: 'fca-fines-2018-annual-review',
    title: 'FCA Fines 2018: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2018 | Complete Annual Enforcement Analysis',
    excerpt: 'Transitional year with £60m total fines. Tesco Bank £16.4m cyber attack fine sets precedent. SM&CR beds in.',
    executiveSummary: `2018 was a transitional year for FCA enforcement with relatively modest total fines of approximately £60 million across 18 actions. The most significant case was Tesco Bank's £16.4 million fine for failures in responding to a 2016 cyber attack that affected over 9,000 customers.

The year represented a strategic recalibration following the major FX and LIBOR enforcement programmes, with the FCA focusing on cultural change and proactive supervision rather than solely backward-looking punishment.`,
    regulatoryContext: `2018 saw MiFID II implementation consume significant industry and regulatory resource. The new transaction reporting requirements and best execution obligations required substantial systems investment, with the FCA prioritising implementation support over enforcement during the bedding-in period.

The Senior Managers and Certification Regime continued its staged rollout, with smaller deposit-takers brought into scope. The regime's effectiveness in driving individual accountability was beginning to be tested through enforcement investigations.

The FCA's Business Plan for 2018/19 emphasised 'transforming culture in financial services' - a recognition that compliance alone is insufficient without underlying behavioural change. This philosophical shift influenced both supervisory approach and enforcement prioritisation.`,
    keyEnforcementThemes: [
      'Cyber security emerges as enforcement area',
      'MiFID II implementation prioritised over enforcement',
      'Cultural change emphasis in regulatory approach',
      'Consumer credit firm enforcement continues',
      'Individual accountability investigations progress'
    ],
    professionalInsight: `The Tesco Bank case established important precedents for cyber security expectations. The FCA found that the bank failed to exercise due skill, care and diligence in protecting customers from foreseeable risks. Critically, vulnerabilities in the debit card system had been identified internally but not adequately addressed.

For technology and operational risk professionals, this case reinforced that known vulnerabilities create regulatory as well as operational risk. Boards must understand their firm's security posture and ensure adequate investment in remediation.

The relatively quiet enforcement year should not be misinterpreted as reduced regulatory intensity. The FCA was actively investigating cases that would emerge in subsequent years - including the major AML cases against HSBC and NatWest.

The MiFID II implementation experience demonstrated the FCA's capacity for pragmatic enforcement discretion. Firms making genuine efforts to comply received supervisory support rather than enforcement action, while those taking inadequate steps faced increased scrutiny.`,
    lookingAhead: `2018 positioned the industry for accelerating enforcement in subsequent years. The FCA's transformation programme was beginning to deliver enhanced data capabilities that would inform more targeted supervision and enforcement.

The cyber security precedent set by Tesco Bank would prove increasingly relevant as digital banking expanded and threat landscapes evolved.`,
    keywords: ['FCA fines 2018', 'Tesco Bank cyber attack fine', 'FCA enforcement 2018', 'MiFID II implementation', 'cyber security FCA', 'FCA annual review 2018']
  },
  {
    year: 2017,
    slug: 'fca-fines-2017-annual-review',
    title: 'FCA Fines 2017: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2017 | Complete Annual Enforcement Analysis',
    excerpt: 'Landmark year: Deutsche Bank £163m Russian mirror trades AML fine dominates. Total fines £229m across 25 actions.',
    executiveSummary: `2017 was dominated by the Deutsche Bank AG enforcement action, with a £163 million fine for failures in AML controls related to Russian 'mirror trades' - a scheme that moved approximately $10 billion out of Russia using simultaneous buy and sell transactions in equities. This case remains one of the most significant AML enforcement actions globally.

Total fines reached approximately £229 million across 25 actions, with AML failures accounting for the majority of the value. The year marked a shift from the FX/benchmark manipulation cases that dominated 2014-15 towards financial crime enforcement.`,
    regulatoryContext: `2017 saw increasing international coordination on AML enforcement, with the Deutsche Bank case reflecting parallel investigations in the US and Germany. The UK's position as a global financial centre creates particular exposure to cross-border money laundering, making effective controls essential.

The FCA published its first Annual Perimeter Report, reflecting increased focus on ensuring firms operate within the regulatory perimeter and that unregulated activities do not create harm.

The Senior Managers and Certification Regime implementation continued, with 'extended scope' firms preparing for December 2018 requirements. The regime's emphasis on clear accountability was influencing both firm governance and the FCA's enforcement targeting.`,
    keyEnforcementThemes: [
      'Russian money laundering through mirror trades exposed',
      'AML controls at major international banks scrutinised',
      'Transaction reporting failures attract penalties',
      'Individual accountability increasingly emphasised',
      'Consumer protection enforcement continues'
    ],
    professionalInsight: `The Deutsche Bank case warrants detailed analysis by every AML professional. The mirror trades scheme was relatively simple: clients in Moscow would buy Russian equities for roubles, while related clients in London would simultaneously sell the same securities for dollars. The net effect was capital flight from Russia through ostensibly legitimate transactions.

The FCA found that Deutsche Bank failed to identify and adequately investigate suspicious trading patterns, failed to maintain adequate AML policies, and failed to provide adequate training. These are fundamental failings - not sophisticated regulatory arbitrage.

For compliance leaders, the case demonstrates that correspondent banking and trading activities require integrated AML oversight. The scheme operated across multiple business lines and jurisdictions, requiring holistic monitoring that apparently did not exist.

The £163 million fine, while substantial, represented a fraction of the volumes transacted. This ratio - punishment to proceeds - remains a challenge for effective deterrence in financial crime cases.`,
    lookingAhead: `2017 established AML enforcement as a strategic priority that would continue through subsequent years. The Deutsche Bank case demonstrated the FCA's capacity to pursue complex international schemes, even where the conduct occurred primarily outside the UK.

The transaction reporting theme would evolve as MiFID II approached, with new requirements creating both compliance challenges and enforcement opportunities.`,
    keywords: ['FCA fines 2017', 'Deutsche Bank FCA fine', 'Russian mirror trades', 'AML enforcement UK', 'FCA enforcement 2017', 'money laundering fine']
  },
  {
    year: 2016,
    slug: 'fca-fines-2016-annual-review',
    title: 'FCA Fines 2016: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2016 | Complete Annual Enforcement Analysis',
    excerpt: 'Quietest enforcement year: £22m total fines. Post-FX scandal consolidation. Consumer protection focus emerges.',
    executiveSummary: `2016 was the quietest enforcement year since the FCA's establishment, with total fines of approximately £22 million across just 15 actions. This dramatic reduction from the £905 million of 2015 reflected the conclusion of the major FX and benchmark manipulation cases rather than reduced regulatory intensity.

The year marked a transitional period as the FCA recalibrated its enforcement approach, with increased emphasis on proactive supervision and early intervention alongside traditional enforcement activity.`,
    regulatoryContext: `The FCA's Mission document, published in 2016, articulated the regulator's core purpose and approach. This strategic clarity influenced both supervisory priorities and enforcement targeting, with explicit recognition that enforcement is one of many regulatory tools rather than the primary intervention.

The Senior Managers and Certification Regime took effect for major banks in March 2016, creating the foundation for individual accountability that would increasingly feature in enforcement cases.

Brexit referendum implications began to be assessed, though the regulatory impact would only emerge in subsequent years. The FCA maintained its European and international engagement while preparing for potential structural changes.`,
    keyEnforcementThemes: [
      'Post-FX scandal enforcement consolidation',
      'Consumer protection cases predominate',
      'Insurance sector conduct issues addressed',
      'SM&CR implementation for large banks begins',
      'Regulatory strategy recalibration evident'
    ],
    professionalInsight: `The 2016 enforcement lull provides useful perspective on the FCA's strategic approach. The regulator explicitly chose to invest in cultural change and proactive supervision rather than pursue lower-impact enforcement cases that would consume resource without materially improving outcomes.

For compliance professionals, this period demonstrated that enforcement statistics alone are an inadequate measure of regulatory intensity. The FCA was actively investigating cases that would emerge in subsequent years while also strengthening its supervisory capabilities.

The SM&CR implementation for large banks in March 2016 created new individual accountability mechanisms that would gradually transform governance practices. Senior managers could no longer claim ignorance of failings within their responsibilities.

The insurance sector cases - particularly Aviva's £8.2 million fine for non-advised annuity sales - signalled that consumer protection would increasingly feature in enforcement activity. The 'treating customers fairly' principle was being operationalised through specific conduct expectations.`,
    lookingAhead: `2016 set the stage for resumed major enforcement in 2017, particularly the Deutsche Bank AML case. The FCA's investment in financial crime expertise and systems would deliver significant cases in subsequent years.

The SM&CR bedding-in period would eventually produce individual accountability cases, though the regime's effectiveness would take time to demonstrate through enforcement.`,
    keywords: ['FCA fines 2016', 'FCA enforcement 2016', 'SM&CR implementation', 'Aviva FCA fine', 'FCA annual review 2016', 'consumer protection FCA']
  },
  {
    year: 2015,
    slug: 'fca-fines-2015-annual-review',
    title: 'FCA Fines 2015: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2015 | Complete Annual Enforcement Analysis',
    excerpt: 'Record year: £905m total fines. Barclays £284m FX manipulation fine - largest ever. PPI enforcement intensifies.',
    executiveSummary: `2015 delivered the second-highest annual fine total in FCA history (approximately £905 million across 40 actions), driven by the continuation and conclusion of FX manipulation cases. The year culminated in November with Barclays Bank receiving the largest ever FCA fine at £284.4 million for FX benchmark manipulation.

Alongside wholesale market enforcement, 2015 saw significant retail conduct cases, including Lloyds Banking Group's £117 million fine for PPI complaint handling failures - demonstrating the FCA's breadth across both institutional and consumer-facing misconduct.`,
    regulatoryContext: `2015 represented the peak of the post-financial crisis wholesale market enforcement programme. The FX cases followed the LIBOR and EURIBOR manipulation cases of previous years, establishing clear expectations for benchmark and trading conduct across financial markets.

The FCA's approach to early settlement discounts remained critical to case resolution, with most major cases concluding through Stage 1 settlements (30% discount) rather than contested proceedings. This efficiency enabled the processing of multiple complex cases within resource constraints.

Preparation for the Senior Managers and Certification Regime intensified, with implementation scheduled for March 2016 for major banks. The regime promised to transform individual accountability by creating clear responsibility maps and evidential standards.`,
    keyEnforcementThemes: [
      'FX manipulation enforcement concludes at Barclays',
      'PPI complaint handling failures attract major fines',
      'Financial crime controls scrutinised',
      'Individual accountability increasingly emphasised',
      'Settlement efficiency enables case throughput'
    ],
    professionalInsight: `The Barclays FX fine merits detailed analysis for its scale and scope. The bank failed for six years (2008-2014) to adequately control its FX operations, with traders sharing confidential client information and attempting to manipulate benchmark rates. The £284.4 million penalty reflected the seriousness and duration of the failings.

Critical to the case was evidence of cultural failures alongside control weaknesses. Traders operated in an environment where misconduct was normalised, with inadequate surveillance and challenge from compliance functions. The FCA's focus on 'tone from the top' and behavioural standards derived directly from such cases.

The Lloyds PPI case demonstrated that retail banking conduct remained a priority alongside wholesale enforcement. The £117 million fine addressed how the bank handled PPI complaints, finding systematic failures to investigate complaints properly and offer fair redress. Consumer outcomes matter as much as market integrity.

For compliance leaders, 2015 reinforced that major enforcement reflects accumulated failures over extended periods. Effective controls require sustained attention and investment, not episodic responses to regulatory attention.`,
    lookingAhead: `2015 marked the end of the FX manipulation enforcement cycle, with subsequent years showing dramatically lower total fines as the pipeline cleared. The FCA's attention would shift towards AML and financial crime cases while also building capacity for new challenges.

The PPI enforcement signalled that retail conduct would remain a priority even as the redress scheme matured towards eventual conclusion.`,
    keywords: ['FCA fines 2015', 'Barclays FX fine', 'largest FCA fine', 'FX manipulation', 'Lloyds PPI fine', 'FCA enforcement 2015']
  },
  {
    year: 2014,
    slug: 'fca-fines-2014-annual-review',
    title: 'FCA Fines 2014: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2014 | Complete Annual Enforcement Analysis',
    excerpt: 'Historic peak: £1.47bn total fines - FCA record. Coordinated FX enforcement against five major banks. Industry transformation begins.',
    executiveSummary: `2014 established the all-time record for FCA annual fines at approximately £1.47 billion across 45 enforcement actions. The November 2014 coordinated enforcement against five major banks for FX manipulation (UBS, Citibank, JP Morgan, RBS, and HSBC) resulted in combined fines exceeding £1.1 billion - an unprecedented regulatory action.

This extraordinary enforcement year reflected the culmination of the FCA's market integrity programme and fundamentally reshaped expectations for conduct standards in wholesale markets.`,
    regulatoryContext: `The FCA's coordinated FX enforcement demonstrated international regulatory cooperation at its most effective. Working alongside US, Swiss, and other authorities, the FCA achieved simultaneous announcements that maximised impact and prevented arbitrage between jurisdictions.

The enforcement programme was enabled by the whistleblower intelligence and internal investigations that followed the LIBOR cases. Banks discovered FX conduct issues through enhanced surveillance and self-reported to regulators, receiving credit for cooperation.

Fair and Effective Markets Review preparations began, eventually producing recommendations that would reshape wholesale market conduct expectations. The FCA's role as conduct regulator for wholesale markets was firmly established.`,
    keyEnforcementThemes: [
      'Coordinated international FX enforcement achieves record fines',
      'Five major banks sanctioned simultaneously',
      'Trader chat room misconduct exposed globally',
      'Benchmark manipulation penalties continue from LIBOR',
      'Settlement cooperation reduces individual penalties'
    ],
    professionalInsight: `The November 2014 FX enforcement actions represent a watershed moment in financial regulation. The simultaneous announcement against UBS (£233.8m), Citibank (£225.6m), JP Morgan (£222.2m), RBS (£217m), and HSBC (£216.4m) demonstrated that no institution is too large for regulatory accountability.

The cases revealed fundamental failures in trader supervision and compliance oversight. Traders used chat rooms with names like 'The Cartel' and 'The Bandits' Club' to share confidential client information and coordinate trading activity. These communications provided compelling evidence of intentional misconduct.

For compliance professionals, the FX cases reinforce that surveillance must extend to all communication channels and that unusual patterns require investigation. The 'I didn't know' defence is unavailable when information was flowing through monitored systems.

The settlement process was critical to achieving case resolution. Banks received 30% discounts for Stage 1 settlement, making early cooperation economically rational. The FCA's enforcement model relies on this settlement efficiency to manage caseload.

From a governance perspective, boards faced fundamental questions about control effectiveness. How could such widespread misconduct occur undetected? The answers drove significant investment in surveillance technology and compliance resources across the industry.`,
    lookingAhead: `2014 set expectations that would influence the industry for years. The message was clear: wholesale market misconduct attracts severe consequences, and international coordination makes regulatory arbitrage ineffective.

The Barclays FX case remained outstanding, eventually settling in 2015 for the record £284.4 million fine. The FCA's enforcement pipeline remained substantial even after the November announcements.`,
    keywords: ['FCA fines 2014', 'FX manipulation fines', 'UBS FCA fine', 'Citibank FCA fine', 'JP Morgan FCA fine', 'RBS FCA fine', 'record FCA fines']
  },
  {
    year: 2013,
    slug: 'fca-fines-2013-annual-review',
    title: 'FCA Fines 2013: Annual Enforcement Review & Analysis',
    seoTitle: 'FCA Fines 2013 | Complete Annual Enforcement Analysis',
    excerpt: 'FCA established April 2013. £474m total fines including JPMorgan £138m London Whale and Rabobank £105m LIBOR cases.',
    executiveSummary: `2013 marked the establishment of the Financial Conduct Authority on 1 April 2013, succeeding the Financial Services Authority. Total fines reached approximately £474 million across 35 actions, demonstrating immediate enforcement capability in the new regulatory structure.

The year was characterised by two major cases: JPMorgan's £137.6 million fine for the 'London Whale' trading losses, and Rabobank's £105 million LIBOR manipulation penalty. Both cases reflected the FCA's inheritance of complex investigations from the FSA and its capacity to bring them to successful conclusion.`,
    regulatoryContext: `The FCA's creation implemented the recommendations of the Financial Services Act 2012, separating conduct regulation from prudential supervision (which went to the PRA for deposit-takers and major insurers). This 'twin peaks' model aimed to address the perceived failures of the FSA's integrated approach.

The new regulator inherited the FSA's enforcement caseload, including the advanced LIBOR investigations and the JPMorgan inquiry. The FCA committed to maintaining enforcement intensity while developing its distinctive approach to conduct regulation.

The regulatory philosophy emphasised judgment-based supervision and early intervention, with enforcement as one of multiple tools for achieving better outcomes. However, the scale of inherited cases meant that traditional enforcement activity remained prominent in the FCA's first year.`,
    keyEnforcementThemes: [
      'FCA established and immediately demonstrates enforcement capability',
      'London Whale case addresses risk management failures',
      'LIBOR manipulation enforcement continues from FSA',
      'Consumer protection cases prosecuted alongside wholesale',
      'New regulatory structure beds in during active enforcement'
    ],
    professionalInsight: `The JPMorgan London Whale case provides essential lessons in risk governance. The bank's Chief Investment Office built a derivatives position that ultimately generated over $6 billion in losses. The FCA's £137.6 million fine addressed failures in risk management, governance, and market conduct.

Critical to the case was the failure of multiple control layers. Risk limits were breached and subsequently amended rather than enforced. Valuation marks were adjusted to reduce apparent losses. Senior management received inadequate information about the position's size and risk. Each failing enabled subsequent failures in a cascade that proved catastrophic.

For risk professionals, the case demonstrates that limits without consequences are not controls. Governance frameworks must include meaningful challenge and consequences for breach, regardless of the business unit's profitability or strategic importance.

The Rabobank LIBOR case continued the FSA's enforcement programme, demonstrating continuity through the regulatory transition. The £105 million fine addressed trader manipulation of benchmark submissions over an extended period.

The FCA's first year established that the new regulator would maintain robust enforcement while developing its distinctive approach. The combination of inherited cases and new investigations demonstrated both capability and capacity.`,
    lookingAhead: `2013 set the foundation for the FCA's enforcement identity. The FX manipulation investigations were underway, positioning 2014 for record enforcement. The new regulator had demonstrated capability; the following years would establish whether this translated into lasting industry change.

The regulatory emphasis on cultural change would evolve from rhetoric to operational reality through SM&CR development and implementation.`,
    keywords: ['FCA fines 2013', 'FCA established', 'JPMorgan London Whale', 'Rabobank LIBOR fine', 'FCA enforcement 2013', 'FCA first year']
  },
];

// Helper function to format currency
const formatYearlyCurrency = (amount: number): string => {
  if (amount >= 1_000_000_000) {
    return `£${(amount / 1_000_000_000).toFixed(2)}bn`;
  }
  if (amount >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(0)}m`;
  }
  return `£${(amount / 1_000).toFixed(0)}k`;
};

// Generate Article structured data for SEO
function generateArticleSchema(article: BlogArticle) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.seoTitle,
    "description": article.excerpt,
    "datePublished": article.dateISO,
    "dateModified": article.dateISO,
    "author": {
      "@type": "Organization",
      "name": "MEMA Consultants",
      "url": "https://memaconsultants.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "FCA Fines Dashboard",
      "logo": {
        "@type": "ImageObject",
        "url": "https://fcafines.memaconsultants.com/mema-logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://fcafines.memaconsultants.com/blog/${article.slug}`
    },
    "keywords": article.keywords.join(", "),
    "articleSection": article.category,
    "wordCount": article.content.split(/\s+/).length
  };
}

// Generate BlogPosting list schema
function generateBlogListSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "FCA Fines Insights & Analysis",
    "description": "Expert analysis of FCA fines, enforcement trends, and compliance guidance",
    "url": "https://fcafines.memaconsultants.com/blog",
    "publisher": {
      "@type": "Organization",
      "name": "MEMA Consultants"
    },
    "blogPost": blogArticles.map(article => ({
      "@type": "BlogPosting",
      "headline": article.title,
      "description": article.excerpt,
      "datePublished": article.dateISO,
      "url": `https://fcafines.memaconsultants.com/blog/${article.slug}`,
      "author": {
        "@type": "Organization",
        "name": "MEMA Consultants"
      }
    }))
  };
}

export function Blog() {
  const navigate = useNavigate();
  const [selectedArticle, setSelectedArticle] = useState<BlogArticle | null>(null);
  const [selectedYearlyArticle, setSelectedYearlyArticle] = useState<YearlyArticle | null>(null);

  // SEO for blog listing page
  useSEO({
    title: 'FCA Fines Blog | Expert Analysis & Insights on Financial Conduct Authority Penalties',
    description: 'Expert analysis of FCA fines, biggest penalties, enforcement trends, and compliance guidance. Covering the 20 largest FCA fines, AML enforcement, banking sector penalties, and 2025 fines.',
    keywords: 'FCA fines blog, FCA fines analysis, FCA enforcement insights, biggest FCA fines, FCA fines 2025, FCA AML fines, FCA compliance guide',
    canonicalPath: '/blog',
    ogType: 'blog'
  });

  // Inject blog list structured data
  useEffect(() => {
    const cleanup = injectStructuredData(generateBlogListSchema());
    return cleanup;
  }, []);

  // Update structured data when article is selected
  useEffect(() => {
    if (selectedArticle) {
      document.title = selectedArticle.seoTitle;
      const cleanup = injectStructuredData(generateArticleSchema(selectedArticle));
      return cleanup;
    }
  }, [selectedArticle]);

  const featuredArticles = blogArticles.filter(article => article.featured);
  const regularArticles = blogArticles.filter(article => !article.featured);

  const handleArticleClick = (article: BlogArticle) => {
    setSelectedArticle(article);
  };

  return (
    <div className="blog-page">
      {/* Header */}
      <header className="blog-header">
        <div className="blog-header-content">
          <Link to="/" className="blog-back-link">
            <ArrowLeft size={20} />
            <span>FCA Fines Home</span>
          </Link>
          <nav className="blog-nav" aria-label="Blog navigation">
            <Link to="/dashboard" className="blog-nav-link">FCA Fines Dashboard</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section - SEO optimized */}
      <section className="blog-hero">
        <motion.div
          className="blog-hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1>FCA Fines: Expert Analysis & Insights</h1>
          <p className="blog-hero-subtitle">
            Comprehensive guides to Financial Conduct Authority fines, enforcement trends,
            and compliance best practices. Updated for 2025.
          </p>
          <p className="blog-hero-stats">
            Tracking <strong>£4.9+ billion</strong> in FCA fines since 2013
          </p>
        </motion.div>
      </section>

      {/* Featured Articles */}
      <section className="blog-section" aria-labelledby="featured-heading">
        <div className="blog-section-header">
          <h2 id="featured-heading">Featured: Biggest FCA Fines & 2025 Updates</h2>
          <p>Essential reading on the largest Financial Conduct Authority penalties</p>
        </div>

        <div className="blog-featured-grid">
          {featuredArticles.map((article, index) => (
            <motion.article
              key={article.id}
              className="blog-card blog-card--featured"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              onClick={() => handleArticleClick(article)}
              itemScope
              itemType="https://schema.org/Article"
            >
              <div className="blog-card-header">
                <span className="blog-card-category" itemProp="articleSection">{article.category}</span>
                <span className="blog-card-featured-badge">Featured</span>
              </div>
              <div className="blog-card-icon-wrapper">
                {article.icon}
              </div>
              <h3 className="blog-card-title" itemProp="headline">{article.title}</h3>
              <p className="blog-card-excerpt" itemProp="description">{article.excerpt}</p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={article.dateISO} itemProp="datePublished">{article.date}</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <button className="blog-card-cta" aria-label={`Read article: ${article.title}`}>
                Read Article
                <ChevronRight size={16} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>

      {/* All Articles */}
      <section className="blog-section blog-section--alt" aria-labelledby="all-articles-heading">
        <div className="blog-section-header">
          <h2 id="all-articles-heading">All FCA Fines Articles</h2>
          <p>Complete coverage of FCA enforcement, AML fines, banking penalties, and compliance</p>
        </div>

        <div className="blog-grid">
          {regularArticles.map((article, index) => (
            <motion.article
              key={article.id}
              className="blog-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              onClick={() => handleArticleClick(article)}
              itemScope
              itemType="https://schema.org/Article"
            >
              <div className="blog-card-header">
                <span className="blog-card-category" itemProp="articleSection">{article.category}</span>
              </div>
              <div className="blog-card-icon-wrapper">
                {article.icon}
              </div>
              <h3 className="blog-card-title" itemProp="headline">{article.title}</h3>
              <p className="blog-card-excerpt" itemProp="description">{article.excerpt}</p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={article.dateISO} itemProp="datePublished">{article.date}</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <button className="blog-card-cta" aria-label={`Read article: ${article.title}`}>
                Read Article
                <ChevronRight size={16} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Yearly Analysis Section */}
      <section className="yearly-analysis-section" aria-labelledby="yearly-heading">
        <div className="blog-section-header">
          <h2 id="yearly-heading">FCA Fines by Year: Professional Analysis 2013-2025</h2>
          <p>In-depth regulatory analysis with data visualisations for each enforcement year</p>
        </div>

        <div className="yearly-analysis-grid">
          {yearlyArticles.map((article, index) => {
            const yearData = yearlyFCAData[article.year];
            return (
              <motion.div
                key={article.year}
                className="yearly-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                onClick={() => setSelectedYearlyArticle(article)}
              >
                <h3 className="yearly-card-year">{article.year}</h3>
                <div className="yearly-card-stats">
                  <div className="yearly-card-stat">
                    <div className="yearly-card-stat-value">{formatYearlyCurrency(yearData?.totalAmount || 0)}</div>
                    <div className="yearly-card-stat-label">Total Fines</div>
                  </div>
                  <div className="yearly-card-stat">
                    <div className="yearly-card-stat-value">{yearData?.totalFines || 0}</div>
                    <div className="yearly-card-stat-label">Actions</div>
                  </div>
                </div>
                <p className="yearly-card-highlight">
                  Largest: {yearData?.largestFine.firm.split(' ').slice(0, 3).join(' ')} - {formatYearlyCurrency(yearData?.largestFine.amount || 0)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* SEO Content Section */}
      <section className="blog-seo-section">
        <div className="blog-seo-content">
          <h2>About the FCA Fines Database</h2>
          <p>
            Our <strong>FCA fines database</strong> is the most comprehensive resource for tracking
            Financial Conduct Authority enforcement actions. Since the FCA was established in 2013,
            it has issued over <strong>£4.9 billion in fines</strong> to financial services firms
            and individuals.
          </p>
          <p>
            Use our <Link to="/dashboard">interactive FCA fines dashboard</Link> to search all penalties,
            filter by year, firm, or breach category, and export data for compliance reporting.
          </p>

          <h3>Most Searched FCA Fines Topics</h3>
          <ul className="blog-seo-links">
            <li><strong>Biggest FCA fines</strong> - The 20 largest penalties ever issued</li>
            <li><strong>FCA fines 2025</strong> - This year's enforcement actions</li>
            <li><strong>FCA AML fines</strong> - Anti-money laundering penalties</li>
            <li><strong>FCA fines to banks</strong> - Banking sector enforcement</li>
            <li><strong>FCA final notices</strong> - Official enforcement decisions</li>
          </ul>
        </div>
      </section>

      {/* CTA Section */}
      <section className="blog-cta-section">
        <div className="blog-cta-content">
          <h2>Search the Complete FCA Fines Database</h2>
          <p>
            Access our interactive dashboard to search all FCA fines from 2013-2025.
            Filter by firm, year, amount, and breach category.
          </p>
          <button className="blog-cta-button" onClick={() => navigate('/dashboard')}>
            Open FCA Fines Dashboard
            <ExternalLink size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="blog-footer">
        <div className="blog-footer-content">
          <div className="blog-footer-brand">
            <p className="blog-footer-logo">FCA Fines Dashboard</p>
            <p className="blog-footer-tagline">The definitive FCA fines database | Powered by MEMA Consultants</p>
          </div>
          <nav className="blog-footer-nav" aria-label="Footer navigation">
            <Link to="/">Home</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/blog">Blog</Link>
          </nav>
          <p className="blog-footer-copyright">
            © {new Date().getFullYear()} MEMA Consultants · All rights reserved
          </p>
        </div>
      </footer>

      {/* Article Modal */}
      {selectedArticle && (
        <Modal
          isOpen={!!selectedArticle}
          onClose={() => setSelectedArticle(null)}
          title={selectedArticle.title}
        >
          <article className="blog-article-modal" itemScope itemType="https://schema.org/Article">
            <div className="blog-article-modal-header">
              <span className="blog-card-category">{selectedArticle.category}</span>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={selectedArticle.dateISO}>{selectedArticle.date}</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {selectedArticle.readTime}
                </span>
              </div>
            </div>
            <div
              className="blog-article-content"
              itemProp="articleBody"
              dangerouslySetInnerHTML={{
                __html: selectedArticle.content
                  // Convert markdown tables to HTML tables
                  .replace(/(\|.+\|\n)+/g, (tableBlock) => {
                    const rows = tableBlock.trim().split('\n');
                    let html = '<table><thead>';
                    let inBody = false;
                    rows.forEach((row, index) => {
                      // Skip separator rows (|---|---|)
                      if (/^\|[\s\-:]+\|$/.test(row.replace(/\|/g, '|').replace(/[^|\-:\s]/g, ''))) {
                        html += '</thead><tbody>';
                        inBody = true;
                        return;
                      }
                      const cells = row.split('|').filter(Boolean).map(cell => cell.trim());
                      const cellTag = !inBody ? 'th' : 'td';
                      html += `<tr>${cells.map(cell => `<${cellTag}>${cell}</${cellTag}>`).join('')}</tr>`;
                    });
                    html += inBody ? '</tbody></table>' : '</thead></table>';
                    return html;
                  })
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/^\- (.+)$/gm, '<li>$1</li>')
                  .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
                  .replace(/\n\n/g, '</p><p>')
              }}
            />
            <div className="blog-article-modal-footer">
              <p className="blog-article-keywords">
                <strong>Related searches:</strong> {selectedArticle.keywords.join(', ')}
              </p>
              <button
                className="blog-cta-button"
                onClick={() => {
                  setSelectedArticle(null);
                  navigate('/dashboard');
                }}
              >
                Explore FCA Fines Dashboard
                <ExternalLink size={18} />
              </button>
            </div>
          </article>
        </Modal>
      )}

      {/* Yearly Analysis Article Modal */}
      {selectedYearlyArticle && (
        <Modal
          isOpen={!!selectedYearlyArticle}
          onClose={() => setSelectedYearlyArticle(null)}
          title={selectedYearlyArticle.title}
        >
          <article className="blog-article-modal" itemScope itemType="https://schema.org/Article">
            <div className="blog-article-modal-header">
              <span className="blog-card-category">
                <BarChart3 size={14} style={{ marginRight: '0.375rem' }} />
                Annual Analysis
              </span>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time>{selectedYearlyArticle.year} Review</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  15 min read
                </span>
              </div>
            </div>

            <div className="blog-article-content" itemProp="articleBody">
              {/* Stats Summary */}
              {yearlyFCAData[selectedYearlyArticle.year] && (
                <div className="stats-summary-row">
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {formatYearlyCurrency(yearlyFCAData[selectedYearlyArticle.year].totalAmount)}
                    </div>
                    <div className="stats-summary-label">Total Fines</div>
                  </div>
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {yearlyFCAData[selectedYearlyArticle.year].totalFines}
                    </div>
                    <div className="stats-summary-label">Actions</div>
                  </div>
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {formatYearlyCurrency(yearlyFCAData[selectedYearlyArticle.year].avgFine)}
                    </div>
                    <div className="stats-summary-label">Average Fine</div>
                  </div>
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {formatYearlyCurrency(yearlyFCAData[selectedYearlyArticle.year].largestFine.amount)}
                    </div>
                    <div className="stats-summary-label">Largest Fine</div>
                  </div>
                </div>
              )}

              <h2>Executive Summary</h2>
              {selectedYearlyArticle.executiveSummary.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}

              {/* Monthly Enforcement Chart */}
              {yearlyFCAData[selectedYearlyArticle.year] && (
                <MonthlyFinesChart
                  data={yearlyFCAData[selectedYearlyArticle.year].monthlyData}
                  year={selectedYearlyArticle.year}
                />
              )}

              <h2>Regulatory Context</h2>
              {selectedYearlyArticle.regulatoryContext.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}

              {/* Key Insights Box */}
              <div className="article-key-insights">
                <h4>Key Enforcement Themes - {selectedYearlyArticle.year}</h4>
                <ul>
                  {selectedYearlyArticle.keyEnforcementThemes.map((theme, i) => (
                    <li key={i}>{theme}</li>
                  ))}
                </ul>
              </div>

              {/* Breach Category and Top Firms Charts */}
              {yearlyFCAData[selectedYearlyArticle.year] && (
                <div className="yearly-charts-grid">
                  <BreachCategoryChart
                    data={yearlyFCAData[selectedYearlyArticle.year].breachData}
                    year={selectedYearlyArticle.year}
                  />
                  <TopFirmsChart
                    data={yearlyFCAData[selectedYearlyArticle.year].topFirms}
                    year={selectedYearlyArticle.year}
                  />
                </div>
              )}

              {/* Professional Insight Box */}
              <div className="professional-analysis">
                <h4>
                  <Briefcase size={18} />
                  Professional Analysis
                </h4>
                {selectedYearlyArticle.professionalInsight.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              <h2>Looking Ahead</h2>
              {selectedYearlyArticle.lookingAhead.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}

              {/* Year Comparison Chart */}
              {selectedYearlyArticle.year >= 2015 && (
                <YearOverYearChart
                  years={[2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].filter(y => y <= selectedYearlyArticle.year)}
                />
              )}
            </div>

            <div className="blog-article-modal-footer">
              <p className="blog-article-keywords">
                <strong>Related searches:</strong> {selectedYearlyArticle.keywords.join(', ')}
              </p>
              <button
                className="blog-cta-button"
                onClick={() => {
                  setSelectedYearlyArticle(null);
                  navigate('/dashboard');
                }}
              >
                Explore FCA Fines Dashboard
                <ExternalLink size={18} />
              </button>
            </div>
          </article>
        </Modal>
      )}
    </div>
  );
}
