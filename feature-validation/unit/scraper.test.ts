import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';

// Import functions from scraper (would need to export them)
function parseDate(text: string): Date | null {
  if (!text) return null;
  const cleaned = text.replace(/(st|nd|rd|th)/gi, '').replace(/\./g, '/');
  const parts = cleaned.split(/[\/-]/).map((part) => part.trim());
  if (parts.length !== 3) return null;
  let [day, month, year] = parts;
  let yearNum = Number(year);
  if (Number.isNaN(yearNum)) return null;
  if (yearNum < 100) yearNum += 2000;
  let monthNum = Number(month);
  if (Number.isNaN(monthNum)) {
    const monthMap: Record<string, number> = {
      january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
      april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
      august: 8, aug: 8, september: 9, sep: 9, october: 10, oct: 10,
      november: 11, nov: 11, december: 12, dec: 12,
    };
    monthNum = monthMap[month.toLowerCase()] || 0;
  }
  const dayNum = Number(day);
  if (
    !Number.isInteger(dayNum) ||
    !Number.isInteger(monthNum) ||
    !Number.isInteger(yearNum) ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return null;
  }
  const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getUTCFullYear() !== yearNum ||
    date.getUTCMonth() !== monthNum - 1 ||
    date.getUTCDate() !== dayNum
  ) {
    return null;
  }
  return date;
}

function parseCurrency(text: string): number {
  if (!text) return 0;
  let multiplier = 1;
  if (/billion|bn/i.test(text)) multiplier = 1_000_000_000;
  else if (/million|m/i.test(text)) multiplier = 1_000_000;
  else if (/thousand|k/i.test(text)) multiplier = 1_000;
  const cleaned = text.replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  const computed = value * multiplier;
  const maxValue = 9_000_000_000_000_000;
  if (computed >= maxValue) return 0;
  return computed;
}

function hashRecord(firm: string, amount: number, dateKey: string): string {
  return crypto.createHash('sha256').update(`${firm}|${amount}|${dateKey}`).digest('hex');
}

function generateReference(firm: string, date: Date, amount: number): string {
  const slug = firm.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'FIRM';
  return `FCA-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}-${slug}-${Math.round(amount / 1000)}`;
}

describe('parseDate', () => {
  it('parses standard DD/MM/YYYY format', () => {
    const result = parseDate('24/03/2026');
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-03-24T00:00:00.000Z');
  });

  it('parses with ordinal suffixes', () => {
    const result = parseDate('24th/03/2026');
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-03-24T00:00:00.000Z');
  });

  it('parses month names', () => {
    const result = parseDate('24/March/2026');
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-03-24T00:00:00.000Z');
  });

  it('handles 2-digit years', () => {
    const result = parseDate('24/03/26');
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-03-24T00:00:00.000Z');
  });

  it('returns null for invalid input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('invalid')).toBeNull();
    expect(parseDate('32/13/2026')).toBeNull();
    expect(parseDate('abc/def/ghi')).toBeNull();
  });

  it('returns null for malformed date strings', () => {
    expect(parseDate('2026')).toBeNull();
    expect(parseDate('24-03')).toBeNull();
  });

  it('handles leap years correctly', () => {
    const feb29 = parseDate('29/02/2024');
    expect(feb29).not.toBeNull();
    expect(feb29!.getUTCDate()).toBe(29);
  });
});

describe('parseCurrency', () => {
  it('parses plain numbers', () => {
    expect(parseCurrency('12993700')).toBe(12993700);
    expect(parseCurrency('338000')).toBe(338000);
  });

  it('parses with currency symbols', () => {
    expect(parseCurrency('£12,993,700')).toBe(12993700);
    expect(parseCurrency('$338,000')).toBe(338000);
  });

  it('handles million suffix', () => {
    expect(parseCurrency('£12.99M')).toBe(12990000);
    expect(parseCurrency('13 million')).toBe(13000000);
  });

  it('handles thousand suffix', () => {
    expect(parseCurrency('£338K')).toBe(338000);
    expect(parseCurrency('500 thousand')).toBe(500000);
  });

  it('handles billion suffix', () => {
    expect(parseCurrency('1.5bn')).toBe(1500000000);
    expect(parseCurrency('2 billion')).toBe(2000000000);
  });

  it('returns 0 for invalid input', () => {
    expect(parseCurrency('')).toBe(0);
    expect(parseCurrency('invalid')).toBe(0);
    expect(parseCurrency('abc')).toBe(0);
  });

  it('rejects amounts over max value', () => {
    expect(parseCurrency('10000000000000000')).toBe(0);
  });

  it('handles decimals', () => {
    expect(parseCurrency('12.99')).toBe(12.99);
    expect(parseCurrency('£12.99M')).toBe(12990000);
  });
});

describe('hashRecord', () => {
  it('generates consistent SHA256 hash', () => {
    const hash1 = hashRecord('Test Firm', 100000, '2026-03-24');
    const hash2 = hashRecord('Test Firm', 100000, '2026-03-24');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates different hashes for different inputs', () => {
    const hash1 = hashRecord('Firm A', 100000, '2026-03-24');
    const hash2 = hashRecord('Firm B', 100000, '2026-03-24');
    const hash3 = hashRecord('Firm A', 200000, '2026-03-24');
    const hash4 = hashRecord('Firm A', 100000, '2026-03-25');

    const hashes = new Set([hash1, hash2, hash3, hash4]);
    expect(hashes.size).toBe(4);
  });
});

describe('generateReference', () => {
  it('generates valid reference format', () => {
    const date = new Date('2026-03-24T00:00:00.000Z');
    const ref = generateReference('Dinosaur Merchant Bank Limited', date, 338000);
    expect(ref).toMatch(/^FCA-\d{8}-[A-Z]{1,6}-\d+$/);
  });

  it('includes date components', () => {
    const date = new Date('2026-03-24T00:00:00.000Z');
    const ref = generateReference('Test Firm', date, 100000);
    expect(ref).toContain('FCA-20260324');
  });

  it('truncates firm name to 6 chars', () => {
    const date = new Date('2026-03-24T00:00:00.000Z');
    const ref = generateReference('VeryLongFirmNameHere', date, 100000);
    const parts = ref.split('-');
    expect(parts[2].length).toBeLessThanOrEqual(6);
  });

  it('handles empty firm name', () => {
    const date = new Date('2026-03-24T00:00:00.000Z');
    const ref = generateReference('', date, 100000);
    expect(ref).toContain('-FIRM-');
  });

  it('rounds amount to thousands', () => {
    const date = new Date('2026-03-24T00:00:00.000Z');
    const ref = generateReference('Test', date, 338000);
    expect(ref).toContain('-338');
  });
});
