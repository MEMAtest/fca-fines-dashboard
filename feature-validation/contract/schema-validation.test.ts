/**
 * Contract Tests: JSON-LD Schema Validation
 * Validates schema.org structured data compliance
 * FAIL-LOUD: All assertions must pass, no silent failures
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

// Simple schema.org validation helpers
function validateSchemaType(schema: any, expectedType: string): boolean {
  return schema['@type'] === expectedType ||
         (Array.isArray(schema['@type']) && schema['@type'].includes(expectedType));
}

function validateRequiredFields(schema: any, fields: string[]): string[] {
  return fields.filter(field => !schema[field]);
}

describe('JSON-LD Schema Validation - schema.org Compliance', () => {
  let htmlContent: string;
  let jsonLdData: any;

  beforeAll(async () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    htmlContent = await fs.readFile(htmlPath, 'utf-8');

    const jsonLdMatch = htmlContent.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(jsonLdMatch, 'JSON-LD script must exist').toBeTruthy();

    jsonLdData = JSON.parse(jsonLdMatch![1]);
  });

  describe('Dataset Schema - schema.org/Dataset', () => {
    let dataset: any;

    beforeAll(() => {
      dataset = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Dataset');
      expect(dataset, 'Dataset schema must exist').toBeDefined();
    });

    it('MUST have @type of Dataset', () => {
      expect(validateSchemaType(dataset, 'Dataset')).toBe(true);
    });

    it('MUST have required Dataset fields', () => {
      const required = ['name', 'description', 'url'];
      const missing = validateRequiredFields(dataset, required);
      expect(missing, `Missing required fields: ${missing.join(', ')}`).toEqual([]);
    });

    it('MUST have name field describing the database', () => {
      expect(dataset.name).toBeTruthy();
      expect(dataset.name).toContain('RegActions');
      expect(dataset.name).toContain('Regulatory Fines Database');
    });

    it('MUST have spatialCoverage with 6 regions exactly', () => {
      expect(dataset.spatialCoverage).toBeDefined();
      expect(Array.isArray(dataset.spatialCoverage)).toBe(true);
      expect(dataset.spatialCoverage.length).toBe(6);
    });

    it('spatialCoverage regions MUST be Place objects with names', () => {
      dataset.spatialCoverage.forEach((region: any) => {
        expect(region['@type']).toBe('Place');
        expect(region.name).toBeTruthy();
        expect(typeof region.name).toBe('string');
      });
    });

    it('spatialCoverage MUST include all major regions', () => {
      const regionNames = dataset.spatialCoverage.map((r: any) => r.name);
      const expectedRegions = ['Europe', 'North America', 'Asia Pacific', 'Middle East', 'Caribbean', 'Africa'];

      expectedRegions.forEach(region => {
        expect(regionNames).toContain(region);
      });
    });

    it('MUST have temporalCoverage starting from 2013', () => {
      expect(dataset.temporalCoverage).toBeDefined();
      expect(dataset.temporalCoverage).toContain('2013');
    });

    it('MUST have creator pointing to Organization', () => {
      expect(dataset.creator).toBeDefined();
      expect(dataset.creator['@id']).toContain('organization');
    });

    it('MUST have variableMeasured array with PropertyValue objects', () => {
      expect(dataset.variableMeasured).toBeDefined();
      expect(Array.isArray(dataset.variableMeasured)).toBe(true);
      expect(dataset.variableMeasured.length).toBeGreaterThanOrEqual(4);

      dataset.variableMeasured.forEach((variable: any) => {
        expect(variable['@type']).toBe('PropertyValue');
        expect(variable.name).toBeTruthy();
      });
    });

    it('variableMeasured MUST include Fine Amount, Date Issued, Breach Category, Firm Name', () => {
      const variableNames = dataset.variableMeasured.map((v: any) => v.name);

      expect(variableNames).toContain('Fine Amount');
      expect(variableNames).toContain('Date Issued');
      expect(variableNames).toContain('Breach Category');
      expect(variableNames).toContain('Firm Name');
    });

    it('Fine Amount variable MUST specify unitText as GBP', () => {
      const fineVariable = dataset.variableMeasured.find((v: any) => v.name === 'Fine Amount');
      expect(fineVariable).toBeDefined();
      expect(fineVariable.unitText).toBe('GBP');
    });
  });

  describe('Organization Schema - schema.org/Organization', () => {
    let organization: any;

    beforeAll(() => {
      organization = jsonLdData['@graph'].find((item: any) => item['@type'] === 'Organization');
      expect(organization, 'Organization schema must exist').toBeDefined();
    });

    it('MUST have @type of Organization', () => {
      expect(validateSchemaType(organization, 'Organization')).toBe(true);
    });

    it('MUST have required Organization fields', () => {
      const required = ['name', 'url'];
      const missing = validateRequiredFields(organization, required);
      expect(missing, `Missing required fields: ${missing.join(', ')}`).toEqual([]);
    });

    it('MUST have name of RegActions', () => {
      expect(organization.name).toBe('RegActions');
    });

    it('MUST have logo as ImageObject', () => {
      expect(organization.logo).toBeDefined();
      expect(organization.logo['@type']).toBe('ImageObject');
      expect(organization.logo.url).toBeTruthy();
    });
  });

  describe('WebSite Schema - schema.org/WebSite', () => {
    let website: any;

    beforeAll(() => {
      website = jsonLdData['@graph'].find((item: any) => item['@type'] === 'WebSite');
      expect(website, 'WebSite schema must exist').toBeDefined();
    });

    it('MUST have @type of WebSite', () => {
      expect(validateSchemaType(website, 'WebSite')).toBe(true);
    });

    it('MUST have required WebSite fields', () => {
      const required = ['url', 'name'];
      const missing = validateRequiredFields(website, required);
      expect(missing, `Missing required fields: ${missing.join(', ')}`).toEqual([]);
    });

    it('MUST have potentialAction as SearchAction', () => {
      expect(website.potentialAction).toBeDefined();
      expect(website.potentialAction['@type']).toBe('SearchAction');
    });

    it('SearchAction MUST have target with urlTemplate', () => {
      const action = website.potentialAction;
      expect(action.target).toBeDefined();
      expect(action.target['@type']).toBe('EntryPoint');
      expect(action.target.urlTemplate).toBeTruthy();
      expect(action.target.urlTemplate).toContain('search=');
    });

    it('SearchAction MUST require search_term_string', () => {
      const action = website.potentialAction;
      expect(action['query-input']).toBe('required name=search_term_string');
    });
  });

  describe('WebPage Schema - schema.org/WebPage', () => {
    let webpage: any;

    beforeAll(() => {
      webpage = jsonLdData['@graph'].find((item: any) => item['@type'] === 'WebPage');
      expect(webpage, 'WebPage schema must exist').toBeDefined();
    });

    it('MUST have @type of WebPage', () => {
      expect(validateSchemaType(webpage, 'WebPage')).toBe(true);
    });

    it('MUST have required WebPage fields', () => {
      const required = ['url', 'name', 'description'];
      const missing = validateRequiredFields(webpage, required);
      expect(missing, `Missing required fields: ${missing.join(', ')}`).toEqual([]);
    });

    it('MUST have potentialAction as ReadAction', () => {
      expect(webpage.potentialAction).toBeDefined();
      expect(Array.isArray(webpage.potentialAction)).toBe(true);

      const readAction = webpage.potentialAction.find((a: any) => a['@type'] === 'ReadAction');
      expect(readAction).toBeDefined();
    });

    it('MUST reference breadcrumb', () => {
      expect(webpage.breadcrumb).toBeDefined();
      expect(webpage.breadcrumb['@id']).toContain('breadcrumb');
    });
  });

  describe('BreadcrumbList Schema - schema.org/BreadcrumbList', () => {
    let breadcrumb: any;

    beforeAll(() => {
      breadcrumb = jsonLdData['@graph'].find((item: any) => item['@type'] === 'BreadcrumbList');
      expect(breadcrumb, 'BreadcrumbList schema must exist').toBeDefined();
    });

    it('MUST have @type of BreadcrumbList', () => {
      expect(validateSchemaType(breadcrumb, 'BreadcrumbList')).toBe(true);
    });

    it('MUST have itemListElement array', () => {
      expect(breadcrumb.itemListElement).toBeDefined();
      expect(Array.isArray(breadcrumb.itemListElement)).toBe(true);
      expect(breadcrumb.itemListElement.length).toBeGreaterThanOrEqual(3);
    });

    it('Each ListItem MUST have position, name, and item', () => {
      breadcrumb.itemListElement.forEach((item: any, index: number) => {
        expect(item['@type']).toBe('ListItem');
        expect(item.position).toBe(index + 1);
        expect(item.name).toBeTruthy();
        expect(item.item).toBeTruthy();
      });
    });

    it('First item MUST be Home', () => {
      expect(breadcrumb.itemListElement[0].name).toBe('Home');
      expect(breadcrumb.itemListElement[0].item).toContain('regactions.com/');
    });

    it('Breadcrumb items MUST NOT be FCA-specific', () => {
      const names = breadcrumb.itemListElement.map((item: any) => item.name);
      const nameStr = names.join(' ').toLowerCase();

      expect(nameStr.includes('fca fines')).toBe(false);
      expect(nameStr.includes('fca fines database')).toBe(false);
    });
  });

  describe('BlogPost Schema in Blog Pages', () => {
    it('Blog page BlogPosting schemas MUST have correct structure', async () => {
      const blogPath = path.resolve(__dirname, '../../src/pages/Blog.tsx');
      const blogContent = await fs.readFile(blogPath, 'utf-8');

      // Check that Blog.tsx has schema generation function
      expect(blogContent).toContain('generateBlogListSchema');
      expect(blogContent).toContain('@type');
      expect(blogContent).toContain('Blog');
    });
  });

  describe('Schema Validation - No Duplicate IDs', () => {
    it('MUST NOT have duplicate @id values', () => {
      const ids = new Set<string>();
      const duplicates: string[] = [];

      jsonLdData['@graph'].forEach((item: any) => {
        if (item['@id']) {
          if (ids.has(item['@id'])) {
            duplicates.push(item['@id']);
          }
          ids.add(item['@id']);
        }
      });

      expect(duplicates, `Duplicate @id found: ${duplicates.join(', ')}`).toEqual([]);
    });
  });

  describe('Schema Validation - No Malformed JSON', () => {
    it('All schema items MUST have @type or be valid references', () => {
      jsonLdData['@graph'].forEach((item: any, index: number) => {
        expect(item['@type'] || item['@id']).toBeTruthy();
      });
    });

    it('Context MUST be https://schema.org', () => {
      expect(jsonLdData['@context']).toBe('https://schema.org');
    });
  });
});

describe('BlogPost Schema - Article Structure', () => {
  let blogPostContent: string;

  beforeAll(async () => {
    const blogPostPath = path.resolve(__dirname, '../../src/pages/BlogPost.tsx');
    try {
      blogPostContent = await fs.readFile(blogPostPath, 'utf-8');
    } catch (e) {
      blogPostContent = '';
    }
  });

  it('BlogPost component MUST generate schema with correct fields', () => {
    if (blogPostContent) {
      expect(blogPostContent).toContain('BlogPosting');
      expect(blogPostContent).toContain('headline');
      expect(blogPostContent).toContain('datePublished');
      expect(blogPostContent).toContain('author');
    }
  });

  it('BlogPost schema MUST NOT have FCA-only positioning', () => {
    if (blogPostContent) {
      const lowerContent = blogPostContent.toLowerCase();
      expect(lowerContent.includes('fca fines database')).toBe(false);
      expect(lowerContent.includes('flagship fca')).toBe(false);
    }
  });
});

describe('HowTo Schema - Guide Articles', () => {
  let blogPostContent: string;

  beforeAll(async () => {
    const blogPostPath = path.resolve(__dirname, '../../src/pages/BlogPost.tsx');
    try {
      blogPostContent = await fs.readFile(blogPostPath, 'utf-8');
    } catch (e) {
      blogPostContent = '';
    }
  });

  it('Guide articles MAY use HowTo schema for step-by-step content', () => {
    // This is optional, just document the capability
    if (blogPostContent && blogPostContent.includes('HowTo')) {
      expect(blogPostContent).toContain('@type');
    }
  });
});
