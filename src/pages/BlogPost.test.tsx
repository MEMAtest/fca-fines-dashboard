import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BlogPost } from './BlogPost';

vi.mock('../hooks/useSEO.js', () => ({
  useSEO: vi.fn(),
  injectStructuredData: vi.fn(() => () => undefined),
}));

vi.mock('../components/YearlyArticleCharts.js', () => ({
  yearlyFCAData: {},
  MonthlyFinesChart: () => <div data-testid="monthly-fines-chart" />,
  BreachCategoryChart: () => <div data-testid="breach-category-chart" />,
  TopFirmsChart: () => <div data-testid="top-firms-chart" />,
  YearOverYearChart: () => <div data-testid="year-over-year-chart" />,
}));

vi.mock('../components/MainArticleCharts.js', () => {
  const MockChart = () => <div data-testid="mock-chart" />;
  return {
    Top20FinesChart: MockChart,
    Top20BreachTypesChart: MockChart,
    AMLFinesChart: MockChart,
    AMLTrendChart: MockChart,
    BankFinesComparisonChart: MockChart,
    AllYearsEnforcementChart: MockChart,
    FinalNoticesBreakdownChart: MockChart,
    SMCREnforcementChart: MockChart,
    Fines2025MonthlyChart: MockChart,
    Fines2025BreachChart: MockChart,
    CumulativeFinesChart: MockChart,
    Q1_2026_EnforcementChart: MockChart,
    Enforcement2026BreakdownChart: MockChart,
    InsuranceFinesChart: MockChart,
    InsuranceBreachChart: MockChart,
    InsuranceTrendChart: MockChart,
    Jan2026EnforcementChart: MockChart,
    HistoricalJanuaryChart: MockChart,
    EnforcementTrendOutlookChart: MockChart,
    EnforcementPriorityChart: MockChart,
    HistoricalFebruaryChart: MockChart,
    Feb2026ThemesChart: MockChart,
    IndividualVsFirmChart: MockChart,
    TopIndividualFinesChart: MockChart,
    IndividualActionTypesChart: MockChart,
  };
});

function renderBlogPost(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/blog/${slug}`]}>
      <Routes>
        <Route path="/blog/:slug" element={<BlogPost />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BlogPost', () => {
  it('renders structured regulator analysis for non-FCA guides', () => {
    renderBlogPost('bafin-fines-enforcement-guide');

    expect(screen.getByRole('heading', { name: /Federal Financial Supervisory Authority/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Official Sources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compliance Takeaways' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /BaFin measures and sanctions/i })).toHaveAttribute(
      'href',
      'https://www.bafin.de/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html',
    );
    expect(screen.getByRole('link', { name: /BaFin regulator hub/i })).toHaveAttribute(
      'href',
      '/regulators/bafin',
    );
    expect(screen.getByRole('button', { name: /Open Regulator Hub/i })).toBeInTheDocument();
  });

  it('keeps the FCA regulator guide on the legacy markdown path', () => {
    renderBlogPost('fca-fines-enforcement-guide');

    expect(
      screen.getByRole('heading', {
        name: /Financial Conduct Authority \(FCA\) Fines & Enforcement Guide/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Why the FCA Article Stays in Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Explore FCA Fines Dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Regulator Hub/i })).not.toBeInTheDocument();
  });
});
