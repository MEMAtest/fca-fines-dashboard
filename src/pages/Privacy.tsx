import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/about.css";

export function Privacy() {
  useSEO({
    title: "Privacy Notice | RegActions",
    description: "How RegActions and MEMA Consultants use personal information, including API registrations and Board Pack requests.",
  });
  return (
    <div className="about-page">
      <section className="about-hero">
        <span className="about-eyebrow">Privacy</span>
        <h1>Privacy notice</h1>
        <p>Last updated 9 September 2026</p>
      </section>
      <section className="about-section">
        <h2>Who we are</h2>
        <p>RegActions is a public regulatory enforcement intelligence platform built and operated by MEMA Consultants. Questions or rights requests can be sent to <a href="mailto:contact@memaconsultants.com">contact@memaconsultants.com</a>.</p>
        <h2>Board Pack downloads</h2>
        <p>When you request a Board Pack, we collect your name, work email address, organisation, selected firm profile, consent choices, request time, IP address and browser information. We use these details to provide the requested PDF, record the request, protect the service from abuse, maintain an audit trail and notify the MEMA board advisory team.</p>
        <p>We only use your email for marketing follow-up when you select the separate optional marketing consent box. You can withdraw that consent at any time by emailing us.</p>
        <h2>Developer API registration and use</h2>
        <p>When you apply for API access, we collect the organisation name, responsible contact, work email, intended use, requested term, expected request volume, submission time and a pseudonymised network fingerprint. We use this information to review the application, contact you, set appropriate access limits, issue and administer keys, prevent abuse and keep a commercial and security record.</p>
        <p>When a registered key is used, we record the organisation and key identifier, endpoint, request time, access outcome, technical client information and a pseudonymised network fingerprint. We do not place API response contents in the usage log. API keys are stored as one-way hashes rather than in readable form.</p>
        <h2>Lawful bases and retention</h2>
        <p>We use the information needed to review, provide, measure and secure the requested service on the basis of legitimate interests, contract administration and steps taken at your request. We use consent for optional marketing follow-up. We retain service, registration and usage records only for as long as needed for delivery, licensing, security, dispute handling and proportionate business follow-up, then delete or anonymise them.</p>
        <h2>Who receives the information</h2>
        <p>Authorised RegActions and MEMA Consultants personnel can access the request. Our infrastructure, database and email delivery providers process information on our behalf. We do not place your name or email address in the generated PDF or in shareable dashboard URLs.</p>
        <h2>Your rights</h2>
        <p>You may ask for access, correction, deletion, restriction or portability of your personal information, and may object to certain uses. You can also complain to the UK Information Commissioner's Office. We may need to verify your identity before acting on a request.</p>
        <h2>Other product use</h2>
        <p>Saved workspace views are kept in your browser on the device you use. Public workspace share URLs contain selected filters only and should not contain personal information. Basic page-view information may be collected to understand and improve the service.</p>
        <p><Link to="/board-pack">Return to the Board Pack</Link></p>
      </section>
    </div>
  );
}
