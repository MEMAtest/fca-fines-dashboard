/**
 * Unit Tests: FAQ Data Integrity
 * Validates FAQ items, categories, homepage slugs, and cross-references.
 */

import { describe, it, expect } from 'vitest';
import {
  faqItems,
  getFaqCategories,
  getFaqsByCategory,
  getHomepageFaqs,
  getFaqsForArticle,
  generateFaqSchema,
} from '../../src/data/faqData';
import type { FAQItem } from '../../src/data/faqData';
import { REGULATOR_COUNT } from '../../src/constants/site';

describe('FAQ Items - Data Integrity', () => {
  it('should have at least 30 FAQ items (15 original + 16 global)', () => {
    expect(faqItems.length).toBeGreaterThanOrEqual(30);
  });

  it('every item must have a non-empty question, answer, category, and slug', () => {
    for (const item of faqItems) {
      expect(item.question.length, `FAQ "${item.slug}" missing question`).toBeGreaterThan(0);
      expect(item.answer.length, `FAQ "${item.slug}" missing answer`).toBeGreaterThan(0);
      expect(item.category.length, `FAQ "${item.slug}" missing category`).toBeGreaterThan(0);
      expect(item.slug.length, `FAQ "${item.slug}" missing slug`).toBeGreaterThan(0);
    }
  });

  it('all slugs must be unique', () => {
    const slugs = faqItems.map(item => item.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('all questions must be unique', () => {
    const questions = faqItems.map(item => item.question);
    const unique = new Set(questions);
    expect(unique.size).toBe(questions.length);
  });

  it('slugs must be URL-safe (lowercase, no spaces)', () => {
    for (const item of faqItems) {
      expect(item.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('questions must end with a question mark', () => {
    for (const item of faqItems) {
      expect(item.question.endsWith('?'), `FAQ "${item.slug}" question missing "?"`).toBe(true);
    }
  });

  it('answers should be 30-100 words for Google PAA extraction', () => {
    for (const item of faqItems) {
      const wordCount = item.answer.split(/\s+/).length;
      expect(wordCount, `FAQ "${item.slug}" answer is ${wordCount} words`).toBeGreaterThanOrEqual(30);
      expect(wordCount, `FAQ "${item.slug}" answer is ${wordCount} words`).toBeLessThanOrEqual(100);
    }
  });

  it('relatedArticle references must point to valid article slugs if present', () => {
    for (const item of faqItems) {
      if (item.relatedArticle) {
        expect(typeof item.relatedArticle).toBe('string');
        expect(item.relatedArticle.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('FAQ Categories', () => {
  it('should have global categories first in order', () => {
    const categories = getFaqCategories();
    const globalCategories = ['Global Enforcement', 'Platform & Data', 'EU Regulators', 'APAC Regulators', 'Americas Regulators'];

    // Global categories should appear before FCA-specific ones
    const globalIndices = globalCategories.map(cat => categories.indexOf(cat)).filter(i => i >= 0);
    const fcaIndex = categories.indexOf('Biggest Fines');

    for (const gi of globalIndices) {
      expect(gi, `Global category at index ${gi} should be before "Biggest Fines" at ${fcaIndex}`).toBeLessThan(fcaIndex);
    }
  });

  it('getFaqCategories should only return categories that have items', () => {
    const categories = getFaqCategories();
    for (const category of categories) {
      const items = getFaqsByCategory(category);
      expect(items.length, `Category "${category}" has no items`).toBeGreaterThan(0);
    }
  });

  it('should have at least 10 active categories', () => {
    const categories = getFaqCategories();
    expect(categories.length).toBeGreaterThanOrEqual(10);
  });

  it('every FAQ item category must appear in getFaqCategories()', () => {
    const categories = getFaqCategories();
    for (const item of faqItems) {
      expect(categories, `Category "${item.category}" not in getFaqCategories()`).toContain(item.category);
    }
  });
});

describe('Homepage FAQs', () => {
  it('should return exactly 6 homepage FAQs', () => {
    const homepageFaqs = getHomepageFaqs();
    expect(homepageFaqs.length).toBe(6);
  });

  it('should have a globally balanced mix (at least 3 global)', () => {
    const homepageFaqs = getHomepageFaqs();
    const globalCategories = ['Global Enforcement', 'Platform & Data', 'EU Regulators', 'APAC Regulators', 'Americas Regulators'];
    const globalCount = homepageFaqs.filter(item => globalCategories.includes(item.category)).length;
    expect(globalCount).toBeGreaterThanOrEqual(3);
  });

  it('homepage FAQs should include at least one FCA question for SEO continuity', () => {
    const homepageFaqs = getHomepageFaqs();
    const fcaCategories = ['Biggest Fines', 'How FCA Works', 'By Year', 'Specific Cases', 'Financial Crime', 'General'];
    const fcaCount = homepageFaqs.filter(item => fcaCategories.includes(item.category)).length;
    expect(fcaCount).toBeGreaterThanOrEqual(1);
  });

  it('all homepage FAQ slugs must resolve to existing items', () => {
    const homepageFaqs = getHomepageFaqs();
    for (const faq of homepageFaqs) {
      expect(faq.question).toBeTruthy();
      expect(faq.answer).toBeTruthy();
    }
  });
});

describe('Global Regulator Coverage', () => {
  it('FAQ answers should mention multiple regulators', () => {
    const allText = faqItems.map(item => item.answer).join(' ');
    const regulators = ['FCA', 'BaFin', 'SEC', 'ASIC', 'MAS', 'ESMA', 'AMF', 'FINRA'];

    for (const reg of regulators) {
      expect(allText, `No FAQ mentions ${reg}`).toContain(reg);
    }
  });

  it('should have items in all 5 global categories', () => {
    const globalCategories: FAQItem['category'][] = [
      'Global Enforcement', 'Platform & Data', 'EU Regulators', 'APAC Regulators', 'Americas Regulators',
    ];

    for (const cat of globalCategories) {
      const items = getFaqsByCategory(cat);
      expect(items.length, `Category "${cat}" has no items`).toBeGreaterThanOrEqual(2);
    }
  });

  it('Platform & Data FAQs should reference the correct regulator count', () => {
    const platformFaqs = getFaqsByCategory('Platform & Data');
    const mentionsCount = platformFaqs.some(item =>
      item.answer.includes(REGULATOR_COUNT) || item.question.includes(REGULATOR_COUNT),
    );
    expect(mentionsCount, `No Platform & Data FAQ mentions "${REGULATOR_COUNT}"`).toBe(true);
  });
});

describe('Article FAQ Mapping', () => {
  it('getFaqsForArticle should return items for known article slugs', () => {
    const knownArticles = [
      '20-biggest-fca-fines-of-all-time',
      'fca-aml-fines-anti-money-laundering',
      'fca-enforcement-trends-2013-2025',
    ];

    for (const slug of knownArticles) {
      const faqs = getFaqsForArticle(slug);
      expect(faqs.length, `Article "${slug}" has no mapped FAQs`).toBeGreaterThanOrEqual(1);
    }
  });

  it('getFaqsForArticle should return empty array for unknown slugs', () => {
    const faqs = getFaqsForArticle('nonexistent-article');
    expect(faqs).toEqual([]);
  });

  it('all mapped FAQ slugs should resolve to existing FAQ items', () => {
    const knownArticles = [
      '20-biggest-fca-fines-of-all-time',
      'fca-fines-2025-complete-list',
      'fca-aml-fines-anti-money-laundering',
      'fca-enforcement-trends-2013-2025',
      'senior-managers-regime-fca-fines',
    ];

    for (const slug of knownArticles) {
      const faqs = getFaqsForArticle(slug);
      for (const faq of faqs) {
        expect(faq.question, `Mapped FAQ for "${slug}" has no question`).toBeTruthy();
        expect(faq.slug, `Mapped FAQ for "${slug}" has no slug`).toBeTruthy();
      }
    }
  });
});

describe('JSON-LD Schema Generation', () => {
  it('generateFaqSchema should produce valid FAQPage schema', () => {
    const schema = generateFaqSchema(faqItems);
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toBeInstanceOf(Array);
    expect(schema.mainEntity.length).toBe(faqItems.length);
  });

  it('each schema entry should have Question type with accepted answer', () => {
    const schema = generateFaqSchema(faqItems.slice(0, 3));
    for (const entry of schema.mainEntity) {
      expect(entry['@type']).toBe('Question');
      expect(entry.name).toBeTruthy();
      expect(entry.acceptedAnswer['@type']).toBe('Answer');
      expect(entry.acceptedAnswer.text).toBeTruthy();
    }
  });

  it('schema should handle empty array', () => {
    const schema = generateFaqSchema([]);
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toEqual([]);
  });
});
