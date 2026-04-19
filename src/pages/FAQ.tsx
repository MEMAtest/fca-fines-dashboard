import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSEO, injectStructuredData } from "../hooks/useSEO.js";
import {
  faqItems,
  getFaqCategories,
  getFaqsByCategory,
  generateFaqSchema,
} from "../data/faqData.js";
import type { FAQItem } from "../data/faqData.js";
import "../styles/blog.css";

const categoryDescriptions: Record<FAQItem["category"], string> = {
  "Global Enforcement":
    "Cross-regulator comparisons, global trends, and enforcement leaders.",
  "Platform & Data":
    "How RegActions works, data coverage, methodology, and update frequency.",
  "EU Regulators":
    "BaFin, AMF, ESMA, CNMV, and other European financial regulators.",
  "APAC Regulators":
    "ASIC, MAS, HKMA, SFC, SEBI, and other Asia-Pacific regulators.",
  "Americas Regulators":
    "SEC, FINRA, CIRO, and other regulators across the Americas.",
  "Biggest Fines": "The largest financial penalties ever imposed by the FCA.",
  "How FCA Works": "How the FCA investigates, calculates, and enforces fines.",
  "By Year": "FCA enforcement activity broken down by year.",
  "By Sector":
    "Fines by industry sector including banking, insurance, and investment.",
  "Specific Cases": "Notable FCA enforcement cases against named firms.",
  "Financial Crime": "Financial crime types and the FCA's response.",
  General: "General questions about FCA fines and enforcement.",
};

export function FAQ() {
  useSEO({
    title:
      "Regulatory Fines FAQ | Global Financial Enforcement | RegActions",
    description:
      "Answers to common questions about regulatory fines from 45+ global financial regulators including FCA, BaFin, SEC, ASIC, and MAS. Compare enforcement trends.",
    keywords:
      "regulatory fines FAQ, global enforcement questions, FCA fines, BaFin fines, SEC enforcement, ASIC fines, MAS penalties, ESMA regulation, financial regulator comparison, AML enforcement, biggest regulatory fines, RegActions",
    canonicalPath: "/faq",
    ogType: "website",
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
          <h1 className="blog-post-title">
            Regulatory Enforcement: Frequently Asked Questions
          </h1>

          <p className="faq-intro">
            Answers to the most common questions about regulatory fines and
            enforcement actions from 45+ financial regulators across Europe,
            the Americas, Asia-Pacific, the Middle East, and the Caribbean.
          </p>

          {/* Quick navigation */}
          <nav className="faq-nav">
            <h2 className="faq-nav-title">Jump to section</h2>
            <ul className="faq-nav-list">
              {categories.map((category) => (
                <li key={category}>
                  <a
                    href={`#faq-${category.toLowerCase().replace(/\s+/g, "-")}`}
                    className="faq-nav-link"
                  >
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
            {categories.map((category) => {
              const items = getFaqsByCategory(category);
              return (
                <section
                  key={category}
                  id={`faq-${category.toLowerCase().replace(/\s+/g, "-")}`}
                  className="faq-category-section"
                >
                  <div className="faq-category-header">
                    <h2>{category}</h2>
                    <p>{categoryDescriptions[category]}</p>
                  </div>

                  {items.map((item) => (
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
              <strong>Related:</strong> Global regulatory fines database, multi-regulator enforcement
              tracker, FCA, BaFin, SEC, ASIC, MAS, ESMA, AML enforcement, financial penalties
            </p>
            <Link to="/regulators" className="blog-cta-button">
              Explore Global Enforcement Data
              <ChevronRight size={18} />
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
