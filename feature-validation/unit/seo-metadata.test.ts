/**
 * Unit Tests: SEO Metadata Validation
 * Validates index.html meta tags for global positioning
 * FAIL-LOUD: All assertions must pass, no silent failures
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SEO Metadata - index.html Validation', () => {
  let htmlContent: string;

  beforeAll(async () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    htmlContent = await fs.readFile(htmlPath, 'utf-8');
  });

  describe('Meta Tags - Primary SEO', () => {
    it('MUST have global description mentioning 34+ regulators', () => {
      const descMeta = htmlContent.match(/<meta\s+name="description"\s+content="([^"]+)"/);
      expect(descMeta, 'description meta tag must exist').toBeTruthy();

      const description = descMeta![1];
      expect(description).toContain('34+');
      expect(description).toContain('global financial regulators');
      expect(description.toLowerCase()).not.toContain('fca-centric');
      expect(description.toLowerCase()).not.toContain('flagship fca');
    });

    it('MUST have title without FCA-only positioning', () => {
      const titleMeta = htmlContent.match(/<meta\s+name="title"\s+content="([^"]+)"/);
      expect(titleMeta, 'title meta tag must exist').toBeTruthy();

      const title = titleMeta![1];
      expect(title).toContain('RegActions');
      expect(title).toContain('Fines & Enforcement Intelligence');
      expect(title.toLowerCase()).not.toContain('fca fines database');
    });

    it('MUST have keywords mentioning multiple regulators (BaFin, SEC, FCA, AMF)', () => {
      const keywordsMeta = htmlContent.match(/<meta\s+name="keywords"\s+content="([^"]+)"/);
      expect(keywordsMeta, 'keywords meta tag must exist').toBeTruthy();

      const keywords = keywordsMeta![1].toLowerCase();
      expect(keywords).toContain('bafin');
      expect(keywords).toContain('sec');
      expect(keywords).toContain('fca');
      expect(keywords).toContain('amf');

      // BaFin should appear before or alongside FCA, not after
      const bafinIndex = keywords.indexOf('bafin');
      const fcaIndex = keywords.indexOf('fca');
      expect(bafinIndex).toBeLessThanOrEqual(fcaIndex);
    });
  });

  describe('Open Graph - Social Media', () => {
    it('MUST have og:description mentioning global coverage', () => {
      const ogDesc = htmlContent.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
      expect(ogDesc, 'og:description must exist').toBeTruthy();

      const description = ogDesc![1];
      expect(description).toContain('34+');
      expect(description).toContain('global financial regulators');
      expect(description).toContain('BaFin');
      expect(description).toContain('SEC');
      expect(description).toContain('FCA');
    });

    it('MUST have og:title consistent with page title', () => {
      const ogTitle = htmlContent.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      expect(ogTitle, 'og:title must exist').toBeTruthy();

      const title = ogTitle![1];
      expect(title).toContain('RegActions');
      expect(title).toContain('Enforcement Intelligence');
    });

    it('MUST have og:image pointing to valid asset', () => {
      const ogImage = htmlContent.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
      expect(ogImage, 'og:image must exist').toBeTruthy();

      const imagePath = ogImage![1];
      expect(imagePath).toContain('og-image');
      expect(imagePath).toMatch(/\.(png|jpg|jpeg)$/i);
    });
  });

  describe('Twitter Card - Social Media', () => {
    it('MUST have twitter:description mentioning global coverage', () => {
      const twitterDesc = htmlContent.match(/<meta\s+name="twitter:description"\s+content="([^"]+)"/);
      expect(twitterDesc, 'twitter:description must exist').toBeTruthy();

      const description = twitterDesc![1];
      expect(description).toContain('34+');
      expect(description).toContain('global financial regulators');
    });

    it('MUST have twitter:card set to summary_large_image', () => {
      const twitterCard = htmlContent.match(/<meta\s+name="twitter:card"\s+content="([^"]+)"/);
      expect(twitterCard, 'twitter:card must exist').toBeTruthy();

      const cardType = twitterCard![1];
      expect(cardType).toBe('summary_large_image');
    });

    it('MUST have twitter:image pointing to valid asset', () => {
      const twitterImage = htmlContent.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/);
      expect(twitterImage, 'twitter:image must exist').toBeTruthy();

      const imagePath = twitterImage![1];
      expect(imagePath).toContain('og-image');
    });
  });

  describe('JSON-LD Structured Data - Dataset Schema', () => {
    let jsonLdData: any;

    beforeAll(() => {
      const jsonLdMatch = htmlContent.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(jsonLdMatch, 'JSON-LD script must exist').toBeTruthy();

      const jsonStr = jsonLdMatch![1];
      jsonLdData = JSON.parse(jsonStr);
    });

    it('MUST have @graph with 6+ items', () => {
      expect(jsonLdData['@graph']).toBeDefined();
      expect(Array.isArray(jsonLdData['@graph'])).toBe(true);
      expect(jsonLdData['@graph'].length).toBeGreaterThanOrEqual(6);
    });

    it('MUST contain Dataset schema', () => {
      const dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');
      expect(dataset, 'Dataset schema must exist').toBeDefined();
    });

    it('Dataset MUST have spatialCoverage with 6+ regions (NOT just UK)', () => {
      const dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');
      expect(dataset.spatialCoverage).toBeDefined();
      expect(Array.isArray(dataset.spatialCoverage)).toBe(true);
      expect(dataset.spatialCoverage.length).toBe(6);

      const regionNames = dataset.spatialCoverage.map((region: any) => region.name);
      expect(regionNames).toContain('Europe');
      expect(regionNames).toContain('North America');
      expect(regionNames).toContain('Asia Pacific');
      expect(regionNames).toContain('Middle East');
      expect(regionNames).toContain('Caribbean');
      expect(regionNames).toContain('Africa');
    });

    it('Dataset MUST NOT have UK-only geo-targeting', () => {
      const dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');

      if (dataset.spatialCoverage) {
        const regions = dataset.spatialCoverage.map((r: any) => r.name);
        const hasOnlyUK = regions.length === 1 && regions[0] === 'United Kingdom';
        expect(hasOnlyUK).toBe(false);
      }
    });

    it('Dataset description MUST mention 34+ regulators', () => {
      const dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');
      expect(dataset.description).toContain('34+');
      expect(dataset.description).toContain('global financial regulators');
    });

    it('Dataset keywords MUST have global regulators (BaFin, SEC, FCA, AMF)', () => {
      const dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');
      const keywordStr = dataset.keywords.join(' ').toLowerCase();

      expect(keywordStr).toContain('bafin');
      expect(keywordStr).toContain('sec');
      expect(keywordStr).toContain('fca');
      expect(keywordStr).toContain('amf');
    });

    it('Dataset MUST have variableMeasured array with 4+ properties', () => {
      const dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');
      expect(dataset.variableMeasured).toBeDefined();
      expect(Array.isArray(dataset.variableMeasured)).toBe(true);
      expect(dataset.variableMeasured.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('JSON-LD Structured Data - WebSite Schema', () => {
    let jsonLdData: any;

    beforeAll(() => {
      const jsonLdMatch = htmlContent.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      jsonLdData = JSON.parse(jsonLdMatch![1]);
    });

    it('MUST contain WebSite schema', () => {
      const website = jsonLdData['@graph'].find((item: any) => item['@type'] === 'WebSite');
      expect(website, 'WebSite schema must exist').toBeDefined();
    });

    it('WebSite description MUST mention global coverage', () => {
      const website = jsonLdData['@graph'].find((item: any) => item['@type'] === 'WebSite');
      expect(website.description).toContain('34+');
      expect(website.description).toContain('global financial regulators');
    });

    it('WebSite MUST have SearchAction with correct urlTemplate', () => {
      const website = jsonLdData['@graph'].find((item: any) => item['@type'] === 'WebSite');
      expect(website.potentialAction).toBeDefined();
      expect(website.potentialAction['@type']).toBe('SearchAction');
      expect(website.potentialAction.target.urlTemplate).toContain('/dashboard?search=');
    });
  });

  describe('No FCA-Specific Geo-Targeting', () => {
    it('MUST NOT have hreflang tags limiting to UK only', () => {
      const hreflangs = htmlContent.match(/<link rel="alternate" hreflang="([^"]+)"/g) || [];
      expect(hreflangs.length).toBeGreaterThan(0);

      const hreflangsSet = new Set(hreflangs.map(h => h.match(/hreflang="([^"]+)/)[1]));
      expect(hreflangsSet.has('en')).toBe(true);
      expect(hreflangsSet.has('en-us')).toBe(true);
      expect(hreflangsSet.has('en-gb')).toBe(true);
    });

    it('MUST NOT have geo location meta tags for UK only', () => {
      const geoLocation = htmlContent.match(/<meta\s+name="geo\.location"\s+content="([^"]+)"/);
      if (geoLocation) {
        // If geo location is specified, it should be global
        const location = geoLocation[1].toLowerCase();
        expect(location).not.toBe('uk');
        expect(location).not.toBe('united kingdom');
      }
    });
  });

  describe('Regulator Coverage Order - Neutral Positioning', () => {
    let jsonLdData: any;

    beforeAll(() => {
      const jsonLdMatch = htmlContent.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      jsonLdData = JSON.parse(jsonLdMatch![1]);
    });

    it('Dataset keywords MUST NOT start with FCA before other major regulators', () => {
      const dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');
      const keywords = dataset.keywords;
      const keywordStr = keywords.join(' ').toLowerCase();

      // Find indices
      const bafinIndex = keywordStr.indexOf('bafin');
      const secIndex = keywordStr.indexOf('sec fines');
      const fcaIndex = keywordStr.indexOf('fca fines');

      // BaFin should appear before FCA in the keyword list to show neutral ordering
      if (bafinIndex >= 0 && fcaIndex >= 0) {
        expect(bafinIndex).toBeLessThan(fcaIndex);
      }
    });

    it('Breadcrumb structure MUST have neutral ordering', () => {
      const breadcrumb = jsonLdData['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');
      expect(breadcrumb).toBeDefined();
      expect(breadcrumb.itemListElement.length).toBeGreaterThanOrEqual(3);

      // Should be: Home > Dashboard > Blog (not specific to FCA)
      expect(breadcrumb.itemListElement[0].name).toBe('Home');
      expect(breadcrumb.itemListElement[1].name).toContain('Dashboard');
      expect(breadcrumb.itemListElement[2].name).toContain('Insights');
    });
  });

  describe('No Forbidden FCA-Centric Phrases in Meta Tags', () => {
    const forbiddenPhrases = [
      'flagship FCA',
      'FCA benchmark',
      'in the FCA style',
      'FCA fines database',
      'historical FCA depth',
    ];

    forbiddenPhrases.forEach((phrase) => {
      it(`MUST NOT contain forbidden phrase in meta tags: "${phrase}"`, () => {
        const lowerContent = htmlContent.toLowerCase();
        const lowerPhrase = phrase.toLowerCase();
        expect(lowerContent.includes(lowerPhrase)).toBe(false);
      });
    });
  });
});
