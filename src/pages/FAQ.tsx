import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSEO, injectStructuredData } from '../hooks/useSEO';
import {
  faqItems,
  getFaqCategories,
  getFaqsByCategory,
  generateFaqSchema,
} from '../data/faqData';
import type { FAQItem } from '../data/faqData';
import '../styles/blog.css';

const categoryDescriptions: Record<FAQItem['category'], string> = {
  'Biggest Fines': 'The largest financial penalties ever imposed by the FCA.',
  'How FCA Works': 'How the FCA investigates, calculates, and enforces fines.',
  'By Year': 'FCA enforcement activity broken down by year.',
  'By Sector': 'Fines by industry sector including banking, insurance, and investment.',
  'Specific Cases': 'Notable FCA enforcement cases against named firms.',
  'Financial Crime': 'Financial crime types and the FCA\'s response.',
  'General': 'General questions about FCA fines and enforcement.',
};

export function FAQ() {
  useSEO({
    title: 'FCA Fines FAQ | Frequently Asked Questions About Financial Conduct Authority Penalties',
    description:
      'Answers to common questions about FCA fines, enforcement actions, and financial penalties. Learn how the FCA calculates fines, the biggest fines ever issued, and what happens when a firm is fined.',
    keywords:
      'FCA fines FAQ, FCA fines questions, biggest FCA fine, FCA fine calculation, FCA Final Notice, SM&CR fines, FCA money laundering fine, financial crime penalties, FCA fines 2025, FCA fines 2026',
    canonicalPath: '/faq',
    ogType: 'website',
  });

  useEffect(() => {
    const cleanup = injectStructuredData(generateFaqSchema(faqItems));
    return cleanup;
  }, []);

  const categories = getFaqCategories();

  return (
    <div className="blog-page">
      <div className="blog-post-container">
        <nav className="blog-post-nav">
          <Link to="/" className="blog-post-back">
            <ChevronLeft size={18} />
            Home
          </Link>
        </nav>

        <article className="blog-article-modal">
          <h1 className="blog-post-title">FCA Fines: Frequently Asked Questions</h1>

          <p className="faq-intro">
            Answers to the most common questions about Financial Conduct Authority fines,
            enforcement actions, and regulatory penalties in the UK.
          </p>

          {/* Quick navigation */}
          <nav className="faq-nav">
            <h2 className="faq-nav-title">Jump to section</h2>
            <ul className="faq-nav-list">
              {categories.map(category => (
                <li key={category}>
                  <a href={`#faq-${category.toLowerCase().replace(/\s+/g, '-')}`} className="faq-nav-link">
                    {category}
                    <span className="faq-nav-count">
                      {getFaqsByCategory(category).length}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* FAQ sections by category */}
          <div className="blog-article-content">
            {categories.map(category => {
              const items = getFaqsByCategory(category);
              return (
                <section
                  key={category}
                  id={`faq-${category.toLowerCase().replace(/\s+/g, '-')}`}
                  className="faq-category-section"
                >
                  <div className="faq-category-header">
                    <h2>{category}</h2>
                    <p>{categoryDescriptions[category]}</p>
                  </div>

                  {items.map(item => (
                    <div key={item.slug} id={item.slug} className="faq-item">
                      {/* Question as H2 — critical for Google PAA extraction */}
                      <h2 className="faq-question">{item.question}</h2>
                      {/* Concise 40-60 word answer as first paragraph */}
                      <p>{item.answer}</p>
                      {item.relatedArticle && (
                        <p className="faq-related-link">
                          <Link to={`/blog/${item.relatedArticle}`}>
                            Read our detailed analysis
                            <ChevronRight size={14} />
                          </Link>
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>

          {/* Bottom CTA */}
          <div className="blog-article-modal-footer">
            <p className="blog-article-keywords">
              <strong>Related:</strong> FCA fines database, FCA enforcement actions, financial conduct authority penalties, FCA Final Notices, SM&CR
            </p>
            <Link to="/dashboard" className="blog-cta-button">
              Explore FCA Fines Dashboard
              <ChevronRight size={18} />
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
