import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy information for the Centrum Service website and customer portal.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="animate-fade-in legal-page">
      <div className="badge page-badge">Privacy</div>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: August 20, 2026</p>
      <p className="page-intro">
        This notice explains the information Centrum Service may process when you use this website, contact the team, create a customer account, or use the customer portal.
      </p>

      <section className="card legal-section">
        <h2>Information you provide</h2>
        <p>Depending on how you use Centrum Service, this can include your name, email address, phone number, service address, account details, support messages, service requests, and information you submit through forms or tickets.</p>
      </section>

      <section className="card legal-section">
        <h2>Service and account information</h2>
        <p>The customer portal may store information needed to provide and support your service, such as your selected plan, assigned service node, service status, activation or renewal information, payment records, support history, and account security information.</p>
      </section>

      <section className="card legal-section">
        <h2>How information is used</h2>
        <ul className="legal-list">
          <li>Provide, operate, maintain, and support internet services and the customer portal.</li>
          <li>Respond to coverage checks, support requests, account questions, and service inquiries.</li>
          <li>Maintain account security, diagnose technical problems, and protect the network from abuse.</li>
          <li>Keep business, billing, support, and operational records where reasonably necessary.</li>
          <li>Comply with legal obligations or valid requests from competent authorities where applicable.</li>
        </ul>
      </section>

      <section className="card legal-section">
        <h2>Service providers and disclosures</h2>
        <p>Centrum Service may rely on technology or service providers to operate parts of the website, authentication, hosting, communications, or support workflow. Information may be shared only as needed for those services, for network operations, with your direction, or where disclosure is legally required.</p>
      </section>

      <section className="card legal-section">
        <h2>Security and retention</h2>
        <p>Reasonable technical and administrative safeguards are used to protect account and service information. No internet-connected system can guarantee absolute security. Information is kept for as long as it is reasonably needed for the purpose it was collected, operational records, dispute handling, or applicable legal requirements.</p>
      </section>

      <section className="card legal-section">
        <h2>Your choices</h2>
        <p>You can review or update certain account information through the customer portal. You can also contact Centrum Service about your personal information or delete your portal account using the account controls where available.</p>
      </section>

      <section className="card legal-section">
        <h2>Questions</h2>
        <p>For privacy questions, use the <Link href="/contact">contact page</Link>, call <a href="tel:+96103822947">+961 03 822 947</a>, or email <a href="mailto:tonyreaidy@live.com">tonyreaidy@live.com</a>.</p>
      </section>
    </article>
  );
}
