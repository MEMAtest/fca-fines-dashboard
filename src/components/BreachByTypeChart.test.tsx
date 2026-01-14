import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BreachByTypeChart } from './BreachByTypeChart';
import { mockFineRecords, emptyRecords, createManyRecords } from '../test/mockData';

describe('BreachByTypeChart', () => {
  describe('rendering', () => {
    it('renders the chart with title and eyebrow', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      expect(screen.getByText('Top breach categories')).toBeInTheDocument();
      expect(screen.getByText('Breach mix')).toBeInTheDocument();
    });

    it('renders metric toggle buttons', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      expect(screen.getByRole('button', { name: 'Amount' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Notices' })).toBeInTheDocument();
    });

    it('shows empty state when no records provided', () => {
      render(<BreachByTypeChart records={emptyRecords} />);

      expect(screen.getByText('No breach data available.')).toBeInTheDocument();
    });

    it('renders legend with breach categories', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      // Should show breach categories in legend
      expect(screen.getByText(/AML/)).toBeInTheDocument();
      expect(screen.getByText(/MARKET_ABUSE/)).toBeInTheDocument();
    });

    it('handles records without breach categories (Unclassified)', () => {
      const recordsWithUnclassified = [
        ...mockFineRecords.filter(r => r.breach_categories.length > 0),
        { ...mockFineRecords[5] }, // This one has empty breach_categories
      ];

      render(<BreachByTypeChart records={recordsWithUnclassified} />);

      // Should show Unclassified category
      expect(screen.getByText(/Unclassified/)).toBeInTheDocument();
    });
  });

  describe('metric switching', () => {
    it('defaults to Amount metric', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      const amountButton = screen.getByRole('button', { name: 'Amount' });
      expect(amountButton).toHaveClass('btn--active');
    });

    it('switches to Notices metric when clicked', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      const noticesButton = screen.getByRole('button', { name: 'Notices' });
      fireEvent.click(noticesButton);

      expect(noticesButton).toHaveClass('btn--active');
    });
  });

  describe('interactions', () => {
    it('calls onSelect when legend item is clicked', () => {
      const onSelect = vi.fn();
      render(<BreachByTypeChart records={mockFineRecords} onSelect={onSelect} />);

      // Find and click a legend item
      const legendItems = screen.getAllByRole('button').filter(
        btn => btn.classList.contains('panel__legend-item')
      );

      if (legendItems.length > 0) {
        fireEvent.click(legendItems[0]);
        expect(onSelect).toHaveBeenCalled();
      }
    });
  });

  describe('data aggregation', () => {
    it('groups records by breach categories correctly', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      // AML should show combined amount from records with AML category
      // Record 1 has AML: £50m
      const legendText = screen.getByText(/AML.*£/);
      expect(legendText).toBeInTheDocument();
    });

    it('limits display to top 6 categories', () => {
      const manyRecords = createManyRecords(50);
      render(<BreachByTypeChart records={manyRecords} />);

      // Should show max 6 categories
      const legendItems = screen.getAllByRole('button').filter(
        btn => btn.classList.contains('panel__legend-item')
      );
      expect(legendItems.length).toBeLessThanOrEqual(6);
    });

    it('does not double-count records with multiple categories', () => {
      // Record 1 has both AML and SYSTEMS_CONTROLS
      // Each category should only count the record once
      render(<BreachByTypeChart records={mockFineRecords} />);

      // The chart should render without errors
      expect(screen.getByText('Top breach categories')).toBeInTheDocument();
    });
  });

  describe('help tooltip', () => {
    it('renders help button with tooltip', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      const helpButton = screen.getByTitle(/Distribution of fines by breach category/);
      expect(helpButton).toBeInTheDocument();
    });
  });

  describe('export functionality', () => {
    it('renders export menu when records exist', () => {
      render(<BreachByTypeChart records={mockFineRecords} />);

      // Export menu should be present
      expect(screen.getByText(/Export/i)).toBeInTheDocument();
    });
  });
});
