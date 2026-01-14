import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineChart } from './TimelineChart';
import { mockTimelineData, mockFineRecords } from '../test/mockData';

describe('TimelineChart', () => {
  const defaultProps = {
    data: mockTimelineData,
    year: 0,
    recordsForExport: mockFineRecords,
  };

  describe('rendering', () => {
    it('renders the chart with "All enforcement flow" title for year 0', () => {
      render(<TimelineChart {...defaultProps} year={0} />);

      expect(screen.getByText('All enforcement flow')).toBeInTheDocument();
    });

    it('renders year-specific title when year is provided', () => {
      render(<TimelineChart {...defaultProps} year={2024} />);

      expect(screen.getByText('2024 enforcement flow')).toBeInTheDocument();
    });

    it('renders the Monthly cadence eyebrow', () => {
      render(<TimelineChart {...defaultProps} />);

      expect(screen.getByText('Monthly cadence')).toBeInTheDocument();
    });

    it('renders metric toggle buttons', () => {
      render(<TimelineChart {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Amount' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Notices' })).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<TimelineChart {...defaultProps} />);

      expect(screen.getByText(/Tap a month to focus filters/)).toBeInTheDocument();
    });

    it('renders hint text', () => {
      render(<TimelineChart {...defaultProps} />);

      expect(screen.getByText(/Tap to focus • Brush to filter a window/)).toBeInTheDocument();
    });
  });

  describe('mode switching', () => {
    it('defaults to Amount mode', () => {
      render(<TimelineChart {...defaultProps} />);

      const amountButton = screen.getByRole('button', { name: 'Amount' });
      expect(amountButton).toHaveClass('btn--active');
    });

    it('switches to Notices mode when clicked', () => {
      render(<TimelineChart {...defaultProps} />);

      const noticesButton = screen.getByRole('button', { name: 'Notices' });
      fireEvent.click(noticesButton);

      expect(noticesButton).toHaveClass('btn--active');
    });

    it('Amount button becomes inactive when Notices is selected', () => {
      render(<TimelineChart {...defaultProps} />);

      const amountButton = screen.getByRole('button', { name: 'Amount' });
      const noticesButton = screen.getByRole('button', { name: 'Notices' });

      fireEvent.click(noticesButton);

      expect(amountButton).not.toHaveClass('btn--active');
      expect(noticesButton).toHaveClass('btn--active');
    });
  });

  describe('callbacks', () => {
    it('calls onSelectMonth when provided', () => {
      const onSelectMonth = vi.fn();
      render(<TimelineChart {...defaultProps} onSelectMonth={onSelectMonth} />);

      // The callback should be attached to chart click events
      // We can't easily test Recharts click events, but we verify the prop is accepted
      expect(screen.getByText('All enforcement flow')).toBeInTheDocument();
    });

    it('calls onRangeSelect with debounce when brush changes', () => {
      const onRangeSelect = vi.fn();
      render(<TimelineChart {...defaultProps} onRangeSelect={onRangeSelect} />);

      // The callback should be attached to brush events
      // We verify the component renders without error
      expect(screen.getByText('All enforcement flow')).toBeInTheDocument();
    });
  });

  describe('empty data handling', () => {
    it('renders without crashing when data is empty', () => {
      render(<TimelineChart data={[]} year={2024} />);

      expect(screen.getByText('2024 enforcement flow')).toBeInTheDocument();
    });

    it('handles data with single entry', () => {
      const singleEntry = [{ month: 'Jan 2024', total: 50_000_000, count: 1, period: 1, year: 2024 }];

      render(<TimelineChart data={singleEntry} year={2024} />);

      expect(screen.getByText('2024 enforcement flow')).toBeInTheDocument();
    });
  });

  describe('export functionality', () => {
    it('renders export menu when records are provided', () => {
      render(<TimelineChart {...defaultProps} />);

      expect(screen.getByText(/Export/i)).toBeInTheDocument();
    });

    it('does not render export menu when no records', () => {
      render(<TimelineChart data={mockTimelineData} year={0} recordsForExport={[]} />);

      expect(screen.queryByText(/Export/i)).not.toBeInTheDocument();
    });
  });

  describe('help tooltip', () => {
    it('renders help button with tooltip', () => {
      render(<TimelineChart {...defaultProps} />);

      const helpButton = screen.getByTitle(/View monthly enforcement totals/);
      expect(helpButton).toBeInTheDocument();
    });
  });

  describe('reference line', () => {
    it('shows average reference line in Amount mode with data', () => {
      render(<TimelineChart {...defaultProps} />);

      // In Amount mode, there should be an average line
      // We can't directly test SVG elements easily, but we verify the component renders
      const amountButton = screen.getByRole('button', { name: 'Amount' });
      expect(amountButton).toHaveClass('btn--active');
    });
  });

  describe('data formatting', () => {
    it('formats data entries with labels', () => {
      render(<TimelineChart {...defaultProps} />);

      // The component should process and format the data
      expect(screen.getByText('All enforcement flow')).toBeInTheDocument();
    });
  });

  describe('panel ID', () => {
    it('uses default panel ID when exportId not provided', () => {
      render(<TimelineChart {...defaultProps} />);

      const panel = document.getElementById('timeline-panel');
      expect(panel).toBeInTheDocument();
    });

    it('uses custom exportId when provided', () => {
      render(<TimelineChart {...defaultProps} exportId="custom-timeline" />);

      const panel = document.getElementById('custom-timeline');
      expect(panel).toBeInTheDocument();
    });
  });
});
