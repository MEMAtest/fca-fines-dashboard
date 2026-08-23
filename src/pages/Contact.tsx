import { Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { ContactForm } from "../components/ContactForm.js";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/contact.css";

const CONTACT_EMAIL = "contact@memaconsultants.com";

/**
 * The contact form used to live on the homepage, where it was the single
 * largest section on the page: 879px, taller than the hero, sitting directly
 * beneath a digest signup that already asked for an email. Two capture surfaces
 * competed and the bigger one asked for far more.
 *
 * It was also the only structured contact route on the site — the footer link
 * was a mailto — so it could not simply be deleted. It gets its own page, which
 * is also the more useful thing: a contact page is indexable and linkable in a
 * way that an anchor two-thirds down the homepage is not.
 */
export function Contact() {
  useSEO({
    title: "Contact RegActions | Coverage, Data Access and Custom Requests",
    description:
      "Contact the RegActions team about regulator coverage, data access, API use, or a custom enforcement intelligence requirement.",
    keywords:
      "contact RegActions, regulatory enforcement data access, enforcement intelligence enquiry, compliance data API contact",
    canonicalPath: "/contact",
    ogType: "website",
  });

  return (
    <div className="contact-page">
      <div className="contact-page__inner">
        <header className="contact-page__head">
          <span className="ra-eyebrow">Talk to us</span>
          <h1>Contact RegActions</h1>
          <p>
            Questions about regulator coverage, data access, or a requirement
            that does not fit the standard product? Tell us what you need and we
            will come back to you.
          </p>
        </header>

        <div className="contact-page__grid">
          <ContactForm />

          <aside className="contact-page__aside" aria-label="Other ways to reach us">
            <div className="contact-page__aside-item">
              <Mail size={16} />
              <div>
                <strong>Email</strong>
                <p>
                  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </p>
              </div>
            </div>
            <div className="contact-page__aside-item">
              <MessageSquare size={16} />
              <div>
                <strong>What to include</strong>
                <p>
                  The regulators or jurisdictions you care about, and whether you
                  need the data in the product, as an export, or over the API.
                </p>
              </div>
            </div>
            <div className="contact-page__aside-item">
              <ShieldCheck size={16} />
              <div>
                <strong>What we do with it</strong>
                <p>
                  Your message reaches the team directly. We do not add you to a
                  mailing list; the enforcement digest is a separate,
                  one-click subscription.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default Contact;
