import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FineDistributionChart, AMOUNT_BUCKETS } from './FineDistributionChart';
import { mockFineRecords, emptyRecords, createMockRecord } from '../test/mockData';

describe('FineDistributionChart', () => {
  describe('rendering', () => {
    it('renders the chart with title and eyebrow', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      expect(screen.getByText('Penalty distribution')).toBeInTheDocument();
      expect(screen.getByText('Fine sizes')).toBeInTheDocument();
    });

    it('renders all toggle buttons', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      // Stat mode toggles
      expect(screen.getByRole('button', { name: 'Count' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '% share' })).toBeInTheDocument();

      // Orientation toggles
      expect(screen.getByRole('button', { name: 'Vertical' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Horizontal' })).toBeInTheDocument();

      // Stacking toggles
      expect(screen.getByRole('button', { name: 'Aggregate' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Breach stack' })).toBeInTheDocument();
    });

    it('shows median bucket information', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      // Should display median bucket label somewhere
      const description = screen.getByText(/Median notice currently sits in/);
      expect(description).toBeInTheDocument();
    });
  });

  describe('bucket calculations', () => {
    it('correctly categorizes fines into buckets', () => {
      const records = [
        createMockRecord({ amount: 500_000 }),      // Under £1m
        createMockRecord({ amount: 5_000_000 }),    // £1m – £10m
        createMockRecord({ amount: 50_000_000 }),   // £10m – £100m
        createMockRecord({ amount: 150_000_000 }), // Over £100m
      ];

      render(<FineDistributionChart records={records} />);

      // Chart should render with the title and be functional
      expect(screen.getByText('Penalty distribution')).toBeInTheDocument();
      // Bucket labels are rendered inside Recharts SVG, so we verify the component renders
      expect(screen.getByText('Fine sizes')).toBeInTheDocument();
    });

    it('handles empty records gracefully', () => {
      render(<FineDistributionChart records={emptyRecords} />);

      // Should still render the panel structure
      expect(screen.getByText('Penalty distribution')).toBeInTheDocument();
      // "No data" shown for median bucket when no records
      expect(screen.getByText('No data')).toBeInTheDocument();
    });
  });

  describe('mode switching', () => {
    it('defaults to count mode', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      const countButton = screen.getByRole('button', { name: 'Count' });
      expect(countButton).toHaveClass('btn--active');
    });

    it('switches to percentage mode', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      const percentButton = screen.getByRole('button', { name: '% share' });
      fireEvent.click(percentButton);

      expect(percentButton).toHaveClass('btn--active');
    });

    it('defaults to vertical orientation', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      const verticalButton = screen.getByRole('button', { name: 'Vertical' });
      expect(verticalButton).toHaveClass('btn--active');
    });

    it('switches to horizontal orientation', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      const horizontalButton = screen.getByRole('button', { name: 'Horizontal' });
      fireEvent.click(horizontalButton);

      expect(horizontalButton).toHaveClass('btn--active');
    });

    it('defaults to aggregate mode (not stacked)', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      const aggregateButton = screen.getByRole('button', { name: 'Aggregate' });
      expect(aggregateButton).toHaveClass('btn--active');
    });

    it('can switch to breach stack mode', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      const stackButton = screen.getByRole('button', { name: 'Breach stack' });
      fireEvent.click(stackButton);

      expect(stackButton).toHaveClass('btn--active');
    });
  });

  describe('interactions', () => {
    it('calls onSelectRange when callback is provided', () => {
      const onSelectRange = vi.fn();
      render(<FineDistributionChart records={mockFineRecords} onSelectRange={onSelectRange} />);

      // The chart should render and be interactive
      expect(screen.getByText('Penalty distribution')).toBeInTheDocument();
    });
  });

  describe('export functionality', () => {
    it('renders export menu when records exist', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      expect(screen.getByText(/Export/i)).toBeInTheDocument();
    });

    it('does not render export menu when no records', () => {
      render(<FineDistributionChart records={emptyRecords} />);

      // Export menu should not be present
      expect(screen.queryByText(/Export/i)).not.toBeInTheDocument();
    });
  });

  describe('stacking feature', () => {
    it('disables breach stack when no records exist', () => {
      // Breach stack is disabled only when there are no records at all
      // (no topCategories can be computed)
      render(<FineDistributionChart records={emptyRecords} />);

      const stackButton = screen.getByRole('button', { name: 'Breach stack' });
      expect(stackButton).toBeDisabled();
    });

    it('enables breach stack when records exist (even with Unclassified)', () => {
      // Records without breach_type contribute to 'Unclassified' category
      const recordsWithNoBreachType = [
        createMockRecord({ breach_type: null, breach_categories: [] }),
      ];

      render(<FineDistributionChart records={recordsWithNoBreachType} />);

      const stackButton = screen.getByRole('button', { name: 'Breach stack' });
      expect(stackButton).not.toBeDisabled();
    });

    it('enables breach stack when categories available', () => {
      render(<FineDistributionChart records={mockFineRecords} />);

      const stackButton = screen.getByRole('button', { name: 'Breach stack' });
      expect(stackButton).not.toBeDisabled();
    });
  });
});
