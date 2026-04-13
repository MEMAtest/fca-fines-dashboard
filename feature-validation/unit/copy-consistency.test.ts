/**
 * Unit Tests: Global Messaging Copy Consistency
 * Validates all text strings use correct global positioning language
 * FAIL-LOUD: All assertions must pass, no silent failures
 */

import { describe, it, expect } from 'vitest';
import { REGULATOR_COUNT, SITE_NAME } from '../../src/constants/site';

describe('Site Constants - Single Source of Truth', () => {
  it('REGULATOR_COUNT must be exactly "34+"', () => {
    expect(REGULATOR_COUNT).toBe('34+');
  });

  it('SITE_NAME must be "RegActions"', () => {
    expect(SITE_NAME).toBe('RegActions');
  });

  it('Constants must be strings, not undefined', () => {
    expect(typeof REGULATOR_COUNT).toBe('string');
    expect(typeof SITE_NAME).toBe('string');
    expect(REGULATOR_COUNT).toBeTruthy();
    expect(SITE_NAME).toBeTruthy();
  });
});

describe('FCA-Centric Language Detection', () => {
  const FORBIDDEN_PHRASES = [
    'flagship FCA',
    'FCA benchmark',
    'in the FCA style',
    'FCA fines database',
    'FCA enforcement benchmark',
    'lighter than the flagship',
    'alongside the flagship FCA',
  ];

  const SOURCE_FILES = [
    '../../src/components/GlobeHero.tsx',
    '../../src/pages/Blog.tsx',
    '../../src/pages/Features.tsx',
    '../../src/data/regulatorBlogs.ts',
  ];

  FORBIDDEN_PHRASES.forEach((phrase) => {
    it(`MUST NOT contain forbidden phrase: "${phrase}"`, async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      for (const file of SOURCE_FILES) {
        const filePath = path.resolve(__dirname, file);
        const content = await fs.readFile(filePath, 'utf-8');

        const lowercaseContent = content.toLowerCase();
        const lowercasePhrase = phrase.toLowerCase();

        expect(
          lowercaseContent.includes(lowercasePhrase),
          `File ${file} must NOT contain forbidden phrase "${phrase}"`
        ).toBe(false);
      }
    });
  });
});

describe('Regulator Count Consistency', () => {
  const ALLOWED_COUNTS = ['34+', '{REGULATOR_COUNT}', '${REGULATOR_COUNT}'];
  const FORBIDDEN_COUNTS = ['30+', '5 more', '5+'];

  it('MUST NOT use hardcoded "30+" anywhere', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filesToCheck = [
      '../../src/components/GlobeHero.tsx',
      '../../src/pages/Blog.tsx',
      '../../src/pages/BlogPost.tsx',
      '../../src/pages/Features.tsx',
    ];

    for (const file of filesToCheck) {
      const filePath = path.resolve(__dirname, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Check for hardcoded "30+"
      const has30Plus = content.includes('30+');
      expect(
        has30Plus,
        `File ${file} must NOT contain hardcoded "30+" - use REGULATOR_COUNT constant`
      ).toBe(false);
    }
  });

  FORBIDDEN_COUNTS.forEach((count) => {
    it(`Blog.tsx MUST NOT contain forbidden count: "${count}"`, async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const filePath = path.resolve(__dirname, '../../src/pages/Blog.tsx');
      const content = await fs.readFile(filePath, 'utf-8');

      expect(
        content.includes(count),
        `Blog.tsx must NOT contain "${count}"`
      ).toBe(false);
    });
  });
});

describe('Global Positioning Language', () => {
  it('Blog.tsx H1 must say "Global Regulatory Enforcement Intelligence"', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../../src/pages/Blog.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toContain('Global Regulatory Enforcement Intelligence');
  });

  it('Blog.tsx must NOT have "FCA Benchmarks" in H1', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../../src/pages/Blog.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).not.toContain('FCA Benchmarks</h1>');
  });

  it('Blog.tsx featured section must be "Major Enforcement Actions"', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../../src/pages/Blog.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toContain('Major Enforcement Actions');
    expect(content).not.toContain('Biggest FCA Fines');
  });

  it('Features.tsx must use "Americas, APAC, EMEA" regional grouping', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../../src/pages/Features.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toContain('Americas, APAC, EMEA');
    expect(content).not.toContain('UK, EU, APAC');
  });
});
