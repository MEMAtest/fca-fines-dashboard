import { motion } from 'framer-motion';
import { useState } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { Modal } from '../components/Modal';
import '../styles/blog.css';

interface BlogArticle {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: string;
  date: string;
  icon: React.ReactNode;
  featured?: boolean;
}

const blogArticles: BlogArticle[] = [
  {
    id: 'largest-fca-fines-history',
    title: 'The Largest FCA Fines in History: A Comprehensive Analysis',
    excerpt: 'Explore the most significant financial penalties ever issued by the FCA, from Barclays\' £284 million fine to landmark enforcement actions that shaped regulatory standards.',
    content: `
## Overview

The Financial Conduct Authority (FCA) has issued billions of pounds in fines since its establishment in 2013. These penalties reflect the regulator's commitment to maintaining market integrity and protecting consumers.

## Top 10 Largest FCA Fines

### 1. Barclays Bank Plc - £284,432,000 (2015)
The largest FCA fine in history was issued to Barclays for failing to control business practices in its foreign exchange operations. The bank's traders had participated in improper G10 spot FX trading, including inappropriate sharing of confidential information and attempts to manipulate currency rates.

**Key Violations:**
- Failure to manage conflicts of interest
- Inadequate systems and controls
- Participation in improper sharing of confidential client information

### 2. Deutsche Bank AG - £227,000,000 (2017)
Deutsche Bank received this substantial fine for serious anti-money laundering control failures in relation to a $10 billion money laundering scheme involving Russian customers.

**Key Issues:**
- Inadequate AML controls
- Failure to properly oversee 'mirror trades'
- Lack of suspicious activity monitoring

### 3. UBS AG - £233,814,000 (2014)
UBS was fined for significant failings in its FX business and for failing to properly manage conflicts of interest in its treasury operations.

### 4. HSBC Holdings Plc - £176,000,000 (2021)
HSBC received this fine for significant failings in its anti-money laundering systems affecting millions of customers over eight years.

### 5. Standard Chartered Bank - £102,163,200 (2019)
This fine related to failures in AML controls in its correspondent banking business in the UK.

## Lessons for Compliance Teams

These landmark fines highlight several critical areas:

1. **Robust AML Systems**: Investment in automated monitoring and suspicious activity detection
2. **Conflict of Interest Management**: Clear policies and enforcement mechanisms
3. **Staff Training**: Regular, comprehensive compliance training programs
4. **Senior Management Accountability**: Under the Senior Managers Regime (SMR)
5. **Documentation**: Maintaining detailed records of compliance activities

## Impact on Industry

These fines have led to:
- Increased compliance budgets across the industry
- Enhanced regulatory technology adoption
- Greater focus on culture and conduct
- More proactive engagement with regulators
    `,
    category: 'Case Studies',
    readTime: '8 min read',
    date: 'January 2025',
    icon: <Scale className="blog-card-icon" />,
    featured: true
  },
  {
    id: 'understanding-breach-categories',
    title: 'Understanding FCA Breach Categories: A Complete Guide',
    excerpt: 'A detailed breakdown of all breach categories used by the FCA in enforcement actions, helping firms understand regulatory priorities and risk areas.',
    content: `
## Introduction

The FCA categorises breaches into distinct types, each reflecting different regulatory concerns and risk areas. Understanding these categories is essential for compliance teams to prioritise their efforts effectively.

## Major Breach Categories

### 1. Anti-Money Laundering (AML) Failures

AML breaches consistently attract the highest penalties. Key requirements include:

- Customer Due Diligence (CDD)
- Enhanced Due Diligence for high-risk customers
- Suspicious Activity Reporting (SARs)
- Staff training and awareness
- Risk assessment frameworks

**Average Fine**: £45 million
**Frequency**: Accounts for 25% of total fine value

### 2. Market Abuse and Manipulation

Market abuse encompasses:

- Insider dealing
- Unlawful disclosure of inside information
- Market manipulation
- Benchmark manipulation (LIBOR, FX)

**Average Fine**: £28 million
**Recent Trends**: Increased focus on algorithmic trading surveillance

### 3. Systems and Controls Failures

This broad category includes:

- Inadequate governance frameworks
- Poor risk management
- IT system failures
- Operational resilience shortfalls

**Key Areas of Focus**:
- Outsourcing arrangements
- Cybersecurity measures
- Business continuity planning

### 4. Client Money and Asset Safeguarding

Firms must protect client assets through:

- Proper segregation of client money
- Accurate record-keeping
- Regular reconciliations
- Adequate oversight

### 5. Treating Customers Fairly (TCF)

TCF breaches involve:

- Mis-selling products
- Inadequate disclosure
- Unfair contract terms
- Poor complaints handling

**Sector Impact**: Particularly prevalent in retail banking and insurance

### 6. Financial Crime (Non-AML)

This includes:

- Fraud failures
- Sanctions breaches
- Bribery and corruption
- Tax evasion facilitation

## Risk Matrix by Sector

| Sector | Top Risk Category | Second Risk |
|--------|------------------|-------------|
| Banking | AML | Systems & Controls |
| Insurance | TCF | Financial Crime |
| Asset Management | Market Abuse | Client Assets |
| Wealth Management | AML | TCF |

## Emerging Trends

Recent enforcement patterns show increased focus on:

1. **Operational Resilience**: Following increased digitalisation
2. **ESG-related disclosures**: Greenwashing concerns
3. **Consumer Duty compliance**: New rules from 2023
4. **Crypto asset activities**: Emerging regulatory framework
    `,
    category: 'Regulatory Guidance',
    readTime: '10 min read',
    date: 'December 2024',
    icon: <BookOpen className="blog-card-icon" />
  },
  {
    id: 'year-on-year-trends',
    title: 'FCA Enforcement Trends: Year-on-Year Analysis 2013-2025',
    excerpt: 'Analyse how FCA enforcement has evolved over the years, including fine volumes, average penalties, and shifting regulatory priorities.',
    content: `
## Executive Summary

Since its formation in 2013, the FCA has issued over £4.9 billion in fines across more than 300 enforcement actions. This analysis examines the patterns and trends that have emerged.

## Annual Fine Volumes

### 2013-2015: Establishment Phase
- Total fines: £1.4 billion
- Average fine: £18 million
- Focus: Legacy issues from FSA, LIBOR scandal aftermath

### 2016-2018: Consolidation Period
- Total fines: £892 million
- Average fine: £12 million
- Focus: FX manipulation, AML failures, conduct issues

### 2019-2021: Pandemic Impact
- Total fines: £568 million
- Average fine: £15 million
- Notable: COVID-19 affected investigation timelines

### 2022-2025: Renewed Vigour
- Total fines: £1.8 billion
- Average fine: £22 million
- Focus: AML, operational resilience, consumer protection

## Key Observations

### 1. Cyclical Patterns
Enforcement activity tends to follow economic cycles, with increased scrutiny during and after financial stress periods.

### 2. Increasing Sophistication
Recent fines show greater use of:
- Data analytics in investigations
- Cross-border cooperation
- Behavioural analysis

### 3. Sector Shifts
- **2013-2017**: Banking dominance (75% of fines)
- **2018-2021**: Insurance sector increase (35% of fines)
- **2022-Present**: Broader distribution across sectors

### 4. Settlement Trends
- Early settlement discount (30%) widely utilised
- Average time to resolution: 3.2 years
- Contested cases declining

## Predictive Analysis

Based on current trends, we anticipate:

1. **Increased AML Enforcement**: Continued regulatory priority
2. **Consumer Duty Focus**: New regime driving enforcement
3. **Technology-Related Actions**: Cyber, AI, and digital asset focus
4. **ESG Scrutiny**: Climate and sustainability disclosures
5. **Operational Resilience**: Third-party risk management

## Quarterly Breakdown (2024-2025)

| Quarter | Total Fines | Number of Actions |
|---------|------------|-------------------|
| Q1 2024 | £156m | 8 |
| Q2 2024 | £243m | 12 |
| Q3 2024 | £189m | 9 |
| Q4 2024 | £312m | 15 |
| Q1 2025 | £178m | 7 |
    `,
    category: 'Analysis',
    readTime: '12 min read',
    date: 'January 2025',
    icon: <TrendingUp className="blog-card-icon" />,
    featured: true
  },
  {
    id: 'compliance-best-practices',
    title: 'Building a Robust Compliance Framework: Lessons from FCA Fines',
    excerpt: 'Practical guidance on establishing effective compliance controls based on common failures identified in FCA enforcement actions.',
    content: `
## Introduction

Every FCA fine tells a story of compliance failure. By studying these failures, firms can strengthen their own frameworks and avoid similar pitfalls.

## The Three Lines of Defence

### First Line: Business Operations
- Embedding compliance in daily activities
- Clear policies and procedures
- Staff accountability and training

### Second Line: Risk and Compliance Functions
- Independent oversight
- Policy development and monitoring
- Risk assessment and reporting

### Third Line: Internal Audit
- Independent assurance
- Effectiveness testing
- Recommendations for improvement

## Common Failure Points

### 1. Inadequate Risk Assessment
**Problem**: Many fined firms failed to properly assess and document risks.

**Solution**:
- Conduct regular, comprehensive risk assessments
- Document methodology and findings
- Update assessments when circumstances change
- Link assessments to control activities

### 2. Poor Governance and Oversight
**Problem**: Senior management often lacked visibility of key risks.

**Solution**:
- Clear escalation procedures
- Regular MI and reporting
- Board-level compliance engagement
- Defined accountabilities under SMR

### 3. Inadequate Systems and Controls
**Problem**: Manual processes and outdated systems create control gaps.

**Solution**:
- Invest in RegTech solutions
- Automate where possible
- Regular system testing
- Third-party vendor oversight

### 4. Insufficient Training
**Problem**: Staff unaware of compliance requirements.

**Solution**:
- Role-specific training programmes
- Regular refresher courses
- Competency assessments
- Culture and conduct training

### 5. Weak Monitoring and Testing
**Problem**: Controls not regularly tested for effectiveness.

**Solution**:
- Continuous monitoring programmes
- Regular compliance testing
- Independent reviews
- Prompt remediation of issues

## Implementation Roadmap

### Phase 1: Assessment (Months 1-3)
- Gap analysis against regulatory requirements
- Risk assessment refresh
- Resource evaluation

### Phase 2: Design (Months 4-6)
- Policy and procedure updates
- Control framework enhancement
- Technology requirements

### Phase 3: Implementation (Months 7-12)
- System implementations
- Training rollout
- Control activation

### Phase 4: Embed (Ongoing)
- Continuous improvement
- Regular testing
- Culture reinforcement

## Key Performance Indicators

Track compliance effectiveness through:

1. **Control Failure Rate**: % of control tests failed
2. **Issue Resolution Time**: Days to close compliance issues
3. **Training Completion**: % of staff trained
4. **Breach Incidents**: Number and severity
5. **Regulatory Findings**: External examination results
    `,
    category: 'Best Practices',
    readTime: '15 min read',
    date: 'November 2024',
    icon: <Shield className="blog-card-icon" />
  },
  {
    id: 'aml-enforcement-deep-dive',
    title: 'AML Enforcement: Why Anti-Money Laundering Failures Dominate FCA Fines',
    excerpt: 'An in-depth analysis of anti-money laundering enforcement actions, examining why AML failures account for the largest share of FCA penalties.',
    content: `
## The AML Enforcement Landscape

Anti-money laundering failures consistently account for the largest fines issued by the FCA. Since 2013, AML-related enforcement has totalled over £1.2 billion, representing approximately 25% of all fines by value.

## Why AML Failures Attract Large Fines

### 1. Systemic Risk Implications
Money laundering:
- Facilitates organised crime
- Enables terrorism financing
- Undermines market integrity
- Damages the UK's reputation as a financial centre

### 2. Regulatory Priority
The FCA views AML compliance as a fundamental obligation. Failures suggest:
- Poor governance
- Inadequate resources
- Weak risk culture
- Systemic control issues

### 3. International Pressure
The UK faces scrutiny from:
- Financial Action Task Force (FATF)
- EU AML directives
- US authorities (extraterritorial reach)
- International standards bodies

## Landmark AML Cases

### Deutsche Bank (£227m - 2017)
**Background**: Failed to maintain adequate AML controls regarding 'mirror trades' that facilitated money laundering from Russia.

**Key Failures**:
- Inadequate monitoring of suspicious patterns
- Failure to investigate red flags
- Weak correspondent banking controls

### Standard Chartered (£102m - 2019)
**Background**: Correspondent banking AML control failures over several years.

**Key Failures**:
- Insufficient due diligence on respondent banks
- Inadequate transaction monitoring
- Poor risk assessment

### HSBC (£64m - 2017)
**Background**: Transaction monitoring failures affecting millions of customers.

**Key Failures**:
- IT system deficiencies
- Inadequate alert investigation
- Resource constraints

## AML Compliance Framework

### Customer Due Diligence

**Standard CDD**:
- Identity verification
- Beneficial ownership identification
- Purpose of relationship understanding

**Enhanced Due Diligence**:
- High-risk customers
- PEPs and their associates
- High-risk jurisdictions
- Complex structures

### Transaction Monitoring

**Key Requirements**:
- Risk-based approach
- Automated screening systems
- Manual review processes
- Regular tuning and calibration

### Suspicious Activity Reporting

**Obligations**:
- Timely SAR submission
- Quality over quantity
- Internal escalation procedures
- Record retention

## Emerging AML Challenges

### 1. Cryptocurrency and Digital Assets
- New money laundering typologies
- Evolving regulatory framework
- Technology solutions needed

### 2. Trade-Based Money Laundering
- Complex to detect
- Requires specialised expertise
- Cross-border coordination needed

### 3. Professional Enablers
- Accountants, lawyers, estate agents
- Gatekeeper responsibilities
- Enhanced scrutiny expected

## Practical Recommendations

1. **Invest in Technology**: Modern transaction monitoring and screening
2. **Resource Adequately**: Sufficient trained staff for alert review
3. **Regular Risk Assessment**: Keep pace with evolving threats
4. **Senior Management Engagement**: Board-level AML oversight
5. **External Validation**: Independent reviews and testing
    `,
    category: 'Deep Dive',
    readTime: '14 min read',
    date: 'October 2024',
    icon: <AlertTriangle className="blog-card-icon" />
  },
  {
    id: 'sector-analysis-banking',
    title: 'Banking Sector Fines: Patterns and Prevention Strategies',
    excerpt: 'A focused analysis of enforcement actions against banks, revealing sector-specific risks and tailored compliance strategies.',
    content: `
## Banking Sector Overview

The banking sector has historically attracted the largest share of FCA fines, accounting for approximately 65% of total penalties issued since 2013. This reflects both the sector's systemic importance and its exposure to a wide range of regulatory requirements.

## Fine Distribution by Banking Sub-Sector

### Retail Banking
- **Share of Banking Fines**: 35%
- **Primary Issues**: TCF, complaints handling, product governance
- **Average Fine**: £8.5 million

### Investment Banking
- **Share of Banking Fines**: 45%
- **Primary Issues**: Market abuse, conflicts of interest, AML
- **Average Fine**: £65 million

### Private Banking/Wealth Management
- **Share of Banking Fines**: 20%
- **Primary Issues**: AML, suitability, client assets
- **Average Fine**: £12 million

## Key Risk Areas for Banks

### 1. Foreign Exchange Operations
The FX scandal resulted in combined fines exceeding £1.1 billion to major banks. Key issues included:
- Improper information sharing
- Benchmark manipulation
- Failure to manage conflicts

### 2. Payment Protection Insurance (PPI)
The PPI scandal led to:
- Billions in customer redress
- Regulatory fines for poor handling
- Lasting reputational damage

### 3. Interest Rate Benchmark Manipulation
LIBOR and other benchmark manipulation cases demonstrated:
- Inadequate controls over submissions
- Conflicts of interest
- Cultural and governance failures

### 4. Anti-Money Laundering
Banks remain primary targets for AML enforcement due to:
- Volume of transactions
- International exposure
- Correspondent banking risks

## Case Study: Lloyds Banking Group

**Background**: Multiple enforcement actions totalling over £200 million

**Key Actions**:
1. **PPI complaints handling (£117m)**: Failure to handle complaints fairly
2. **HBOS Reading fraud (£45m)**: Failure to alert regulators appropriately
3. **Insurance sales practices (£28m)**: Mis-selling to retail customers

**Lessons**:
- Importance of complaints data analysis
- Whistleblowing and escalation procedures
- Sales incentive design

## Prevention Strategies

### Governance and Culture
- Clear tone from the top
- Aligned incentive structures
- Independent challenge mechanisms
- Regular culture assessments

### Risk Management
- Comprehensive risk identification
- Robust assessment methodologies
- Clear risk appetite statements
- Effective escalation procedures

### Technology Investment
- Automated monitoring systems
- Data analytics capabilities
- Integrated risk platforms
- Real-time surveillance

### Training and Competence
- Role-specific programmes
- Regular refreshers
- Competency assessments
- Certification requirements

## Regulatory Engagement

### Proactive Approach
- Early notification of issues
- Open dialogue with supervisors
- Active participation in consultations
- Self-assessment and reporting

### Cooperation Benefits
- Settlement discounts (up to 30%)
- Reduced publicity
- Better regulatory relationships
- Faster resolution
    `,
    category: 'Sector Analysis',
    readTime: '11 min read',
    date: 'September 2024',
    icon: <Building2 className="blog-card-icon" />
  },
  {
    id: 'senior-managers-regime',
    title: 'The Senior Managers Regime: Personal Accountability and FCA Enforcement',
    excerpt: 'Understanding how the Senior Managers & Certification Regime has changed individual accountability and what this means for enforcement.',
    content: `
## Introduction to SM&CR

The Senior Managers and Certification Regime (SM&CR) represents a fundamental shift in how the FCA approaches individual accountability. Since its introduction for banks in 2016 and extension to all regulated firms in 2019, the regime has transformed enforcement patterns.

## The Three Pillars of SM&CR

### 1. Senior Managers Regime
Applies to individuals holding senior management functions (SMFs):
- Clear allocation of responsibilities
- Statements of Responsibilities
- Duty of Responsibility
- Regulatory references

### 2. Certification Regime
Applies to staff who could cause significant harm:
- Annual certification by firms
- Fit and proper assessments
- Criminal records checks
- Regulatory references

### 3. Conduct Rules
Apply to all regulated firms' staff:
- Five Individual Conduct Rules
- Four additional Senior Manager Conduct Rules
- Training and awareness requirements

## Individual Enforcement Actions

### Statistics Since SM&CR Introduction
- **Number of individuals fined**: 45+
- **Total individual fines**: £18 million+
- **Average individual fine**: £400,000
- **Prohibitions issued**: 120+

### Notable Individual Cases

**Case 1: Chief Compliance Officer**
- **Fine**: £76,000
- **Issue**: Failure to ensure adequate AML systems
- **Lesson**: CCOs bear personal responsibility for control effectiveness

**Case 2: CEO of Insurance Firm**
- **Fine**: £642,000
- **Issue**: Failure to act with integrity, misleading FCA
- **Lesson**: Duty of candour to regulators is paramount

**Case 3: Head of Trading**
- **Fine**: £1.4 million + prohibition
- **Issue**: Market manipulation
- **Lesson**: Conduct rules apply regardless of commercial pressures

## The Duty of Responsibility

Under SM&CR, senior managers can be held accountable if:
1. A firm breaches regulatory requirements
2. The breach occurs in an area for which they are responsible
3. They did not take reasonable steps to prevent the breach

### What Constitutes "Reasonable Steps"?

The FCA considers:
- Nature and complexity of the business
- Resources available
- Knowledge and experience of the individual
- Actions taken to address known risks
- Reliance on others and quality of oversight

## Practical Implications

### For Senior Managers
1. **Document decisions and rationale**
2. **Ensure clear delegation and oversight**
3. **Regular review of control effectiveness**
4. **Escalate significant issues promptly**
5. **Maintain current Statements of Responsibilities**

### For Firms
1. **Clear allocation of responsibilities**
2. **No gaps or ambiguity**
3. **Adequate resources for oversight**
4. **Regular SM&CR training**
5. **Robust handover processes**

## Emerging Trends

### Increased Individual Focus
The FCA has signalled increased focus on individual accountability, including:
- More investigations of senior managers
- Greater use of prohibition powers
- Public censure of individuals

### Extended Scope
Consider potential extensions to:
- Non-executive directors
- More certification functions
- Group-wide accountability

## Defence Strategies

### Building a Strong Defence
1. **Evidence of reasonable steps taken**
2. **Documentation of decision-making**
3. **Demonstration of good governance**
4. **Records of oversight activities**
5. **Evidence of appropriate challenge**
    `,
    category: 'Regulatory Framework',
    readTime: '13 min read',
    date: 'August 2024',
    icon: <Users className="blog-card-icon" />
  },
  {
    id: 'future-enforcement-priorities',
    title: 'FCA Enforcement Priorities for 2025 and Beyond',
    excerpt: 'Forward-looking analysis of where the FCA is likely to focus enforcement efforts, based on regulatory signals and industry trends.',
    content: `
## FCA Strategic Direction

The FCA has outlined clear priorities for the coming years, providing insight into where enforcement resources will be focused.

## Priority Areas for 2025-2027

### 1. Consumer Duty Compliance

The Consumer Duty represents the most significant regulatory change in years. Enforcement will focus on:

**Products and Services**
- Suitability for target market
- Fair value assessments
- Distribution strategies

**Price and Value**
- Evidence of fair pricing
- Comparison with alternatives
- Value for money analysis

**Consumer Understanding**
- Clear communications
- Appropriate disclosure
- Comprehension testing

**Consumer Support**
- Accessible services
- Timely issue resolution
- Vulnerable customer treatment

### 2. Financial Crime and AML

Continued priority on:
- Transaction monitoring effectiveness
- Sanctions compliance
- Fraud prevention
- Crypto asset AML

### 3. Operational Resilience

New rules requiring:
- Impact tolerance setting
- Third-party oversight
- Scenario testing
- Incident response

### 4. ESG and Sustainability

Growing focus on:
- Greenwashing prevention
- Climate risk disclosures
- Sustainability labelling
- Investment suitability

### 5. Digital Markets

Emerging enforcement themes:
- Algorithm fairness
- AI governance
- Digital asset regulation
- Data protection

## Sector-Specific Priorities

### Retail Banking
- Overdraft pricing
- Savings rate transparency
- Fraud reimbursement

### Insurance
- Claims handling
- Product value
- Underwriting fairness

### Asset Management
- Value assessments
- Stewardship
- Performance fees

### Consumer Credit
- Affordability assessments
- Persistent debt
- High-cost lending

## Signals from Recent Speeches

### FCA Chair Priorities
- "We will hold firms and individuals to account"
- "Consumer Duty is not optional"
- "Financial crime remains our top priority"

### Enforcement Director Messages
- Increased use of data analytics
- Focus on systemic issues
- Individual accountability emphasis

## Preparing for Future Enforcement

### Immediate Actions
1. Consumer Duty implementation review
2. Operational resilience testing
3. AML control enhancement
4. ESG disclosure preparation

### Medium-Term Planning
1. Technology investment
2. Governance enhancement
3. Culture transformation
4. Resource allocation

### Long-Term Strategy
1. Regulatory horizon scanning
2. Proactive risk management
3. Continuous improvement
4. Stakeholder engagement

## Risk Assessment Framework

| Priority Area | Likelihood | Impact | Overall Risk |
|--------------|------------|--------|--------------|
| Consumer Duty | High | High | Critical |
| AML | High | High | Critical |
| Operational Resilience | Medium | High | High |
| ESG | Medium | Medium | Medium |
| Digital Markets | Low | High | Medium |

## Conclusion

Firms that proactively address these priority areas will be better positioned to avoid enforcement action and maintain positive regulatory relationships.
    `,
    category: 'Future Outlook',
    readTime: '11 min read',
    date: 'January 2025',
    icon: <TrendingUp className="blog-card-icon" />,
    featured: true
  }
];

export function Blog() {
  const navigate = useNavigate();
  const [selectedArticle, setSelectedArticle] = useState<BlogArticle | null>(null);

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
            <span>Back to Home</span>
          </Link>
          <nav className="blog-nav">
            <Link to="/dashboard" className="blog-nav-link">Dashboard</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="blog-hero">
        <motion.div
          className="blog-hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1>FCA Fines Insights</h1>
          <p className="blog-hero-subtitle">
            In-depth analysis, case studies, and expert guidance on FCA enforcement actions
          </p>
        </motion.div>
      </section>

      {/* Featured Articles */}
      <section className="blog-section">
        <div className="blog-section-header">
          <h2>Featured Articles</h2>
          <p>Essential reading for compliance professionals</p>
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
            >
              <div className="blog-card-header">
                <span className="blog-card-category">{article.category}</span>
                <span className="blog-card-featured-badge">Featured</span>
              </div>
              <div className="blog-card-icon-wrapper">
                {article.icon}
              </div>
              <h3 className="blog-card-title">{article.title}</h3>
              <p className="blog-card-excerpt">{article.excerpt}</p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  {article.date}
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <button className="blog-card-cta">
                Read Article
                <ChevronRight size={16} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>

      {/* All Articles */}
      <section className="blog-section blog-section--alt">
        <div className="blog-section-header">
          <h2>All Articles</h2>
          <p>Comprehensive coverage of FCA enforcement and compliance</p>
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
            >
              <div className="blog-card-header">
                <span className="blog-card-category">{article.category}</span>
              </div>
              <div className="blog-card-icon-wrapper">
                {article.icon}
              </div>
              <h3 className="blog-card-title">{article.title}</h3>
              <p className="blog-card-excerpt">{article.excerpt}</p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  {article.date}
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <button className="blog-card-cta">
                Read Article
                <ChevronRight size={16} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="blog-cta-section">
        <div className="blog-cta-content">
          <h2>Explore the Full Dashboard</h2>
          <p>
            Dive deeper into FCA enforcement data with our interactive analytics platform.
            Filter by year, category, firm, and more.
          </p>
          <button className="blog-cta-button" onClick={() => navigate('/dashboard')}>
            Open Dashboard
            <ExternalLink size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="blog-footer">
        <div className="blog-footer-content">
          <div className="blog-footer-brand">
            <p className="blog-footer-logo">FCA Fines Dashboard</p>
            <p className="blog-footer-tagline">Powered by MEMA Consultants</p>
          </div>
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
          <div className="blog-article-modal">
            <div className="blog-article-modal-header">
              <span className="blog-card-category">{selectedArticle.category}</span>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  {selectedArticle.date}
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {selectedArticle.readTime}
                </span>
              </div>
            </div>
            <div
              className="blog-article-content"
              dangerouslySetInnerHTML={{
                __html: selectedArticle.content
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/^\- (.+)$/gm, '<li>$1</li>')
                  .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
                  .replace(/\n\n/g, '</p><p>')
                  .replace(/\|(.+)\|/g, (match) => {
                    const cells = match.split('|').filter(Boolean).map(cell => cell.trim());
                    return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
                  })
              }}
            />
            <div className="blog-article-modal-footer">
              <button
                className="blog-cta-button"
                onClick={() => {
                  setSelectedArticle(null);
                  navigate('/dashboard');
                }}
              >
                Explore Dashboard Data
                <ExternalLink size={18} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
