import { useEffect } from 'react';

interface SEOConfig {
  title: string;
  description: string;
  keywords?: string;
  canonicalPath?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  ogImage?: string;
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleSection?: string;
  articleTags?: string[];
  relNext?: string;
  relPrev?: string;
}

const BASE_URL = 'https://fcafines.memaconsultants.com';
const SITE_NAME = 'FCA Fines Dashboard';

export function useSEO(config: SEOConfig) {
  useEffect(() => {
    // Set document title
    document.title = config.title;

    // Helper to set or create meta tag
    const setMetaTag = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let element = document.querySelector(`meta[${attr}="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // Helper to set or create link tag
    const setLinkTag = (rel: string, href: string) => {
      let element = document.querySelector(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', rel);
        document.head.appendChild(element);
      }
      element.setAttribute('href', href);
    };

    // Primary meta tags
    setMetaTag('title', config.title);
    setMetaTag('description', config.description);
    if (config.keywords) {
      setMetaTag('keywords', config.keywords);
    }

    // Canonical URL
    const fullUrl = `${BASE_URL}${config.canonicalPath || ''}`;
    if (config.canonicalPath) {
      setLinkTag('canonical', fullUrl);
    }

    // Update hreflang tags to match current page URL
    (['en-gb', 'en', 'en-us', 'x-default'] as const).forEach(lang => {
      const el = document.querySelector(`link[hreflang="${lang}"]`);
      if (el) el.setAttribute('href', fullUrl);
    });

    // Open Graph
    setMetaTag('og:title', config.ogTitle || config.title, true);
    setMetaTag('og:description', config.ogDescription || config.description, true);
    setMetaTag('og:url', fullUrl, true);
    setMetaTag('og:site_name', SITE_NAME, true);
    if (config.ogType) {
      setMetaTag('og:type', config.ogType, true);
    }
    if (config.ogImage) {
      setMetaTag('og:image', config.ogImage, true);
      setMetaTag('twitter:image', config.ogImage);
    }

    // Twitter
    setMetaTag('twitter:title', config.ogTitle || config.title);
    setMetaTag('twitter:description', config.ogDescription || config.description);

    // Article-specific meta (for blog posts)
    if (config.articlePublishedTime) {
      setMetaTag('article:published_time', config.articlePublishedTime, true);
    }
    if (config.articleModifiedTime) {
      setMetaTag('article:modified_time', config.articleModifiedTime, true);
    }
    if (config.articleSection) {
      setMetaTag('article:section', config.articleSection, true);
    }
    // Open Graph expects repeated `meta property="article:tag"` elements (not indexed names).
    document.querySelectorAll('meta[property="article:tag"]').forEach((el) => el.remove());
    if (config.articleTags?.length) {
      config.articleTags.forEach((tag) => {
        const element = document.createElement('meta');
        element.setAttribute('property', 'article:tag');
        element.setAttribute('content', tag);
        document.head.appendChild(element);
      });
    }

    // Pagination rel links
    const existingNext = document.querySelector('link[rel="next"]');
    const existingPrev = document.querySelector('link[rel="prev"]');
    if (config.relNext) {
      if (existingNext) {
        existingNext.setAttribute('href', config.relNext);
      } else {
        const link = document.createElement('link');
        link.setAttribute('rel', 'next');
        link.setAttribute('href', config.relNext);
        document.head.appendChild(link);
      }
    } else {
      existingNext?.remove();
    }
    if (config.relPrev) {
      if (existingPrev) {
        existingPrev.setAttribute('href', config.relPrev);
      } else {
        const link = document.createElement('link');
        link.setAttribute('rel', 'prev');
        link.setAttribute('href', config.relPrev);
        document.head.appendChild(link);
      }
    } else {
      existingPrev?.remove();
    }

    // Cleanup function to reset to defaults when component unmounts
    return () => {
      document.title = 'FCA Fines Database & Tracker | Complete UK Financial Conduct Authority Penalties 2013-2026';
      document.querySelector('link[rel="next"]')?.remove();
      document.querySelector('link[rel="prev"]')?.remove();
    };
  }, [config]);
}

// Helper to inject JSON-LD structured data
export function injectStructuredData(data: object) {
  // Remove existing dynamic structured data
  const existingScript = document.querySelector('script[data-dynamic-ld]');
  if (existingScript) {
    existingScript.remove();
  }

  // Add new structured data
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-dynamic-ld', 'true');
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);

  return () => {
    script.remove();
  };
}
