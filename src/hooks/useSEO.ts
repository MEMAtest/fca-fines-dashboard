import { useEffect } from 'react';

interface SEOConfig {
  title: string;
  description: string;
  keywords?: string;
  canonicalPath?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleSection?: string;
  articleTags?: string[];
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
    if (config.canonicalPath) {
      setLinkTag('canonical', `${BASE_URL}${config.canonicalPath}`);
    }

    // Open Graph
    setMetaTag('og:title', config.ogTitle || config.title, true);
    setMetaTag('og:description', config.ogDescription || config.description, true);
    setMetaTag('og:url', `${BASE_URL}${config.canonicalPath || ''}`, true);
    setMetaTag('og:site_name', SITE_NAME, true);
    if (config.ogType) {
      setMetaTag('og:type', config.ogType, true);
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
    if (config.articleTags) {
      config.articleTags.forEach((tag, index) => {
        setMetaTag(`article:tag:${index}`, tag, true);
      });
    }

    // Cleanup function to reset to defaults when component unmounts
    return () => {
      document.title = 'FCA Fines Database & Tracker | Complete UK Financial Conduct Authority Penalties 2013-2025';
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
