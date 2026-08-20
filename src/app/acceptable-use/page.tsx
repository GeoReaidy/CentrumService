import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: "Acceptable use rules for Centrum Service internet access, website, and customer portal.",
  alternates: { canonical: "/acceptable-use" },
};

export default function AcceptableUsePage() {
  return (
    <article className="animate-fade-in legal-page">
      <div className="badge page-badge">Network Policy</div>
      <h1>Acceptable Use Policy</h1>
      <p className="legal-updated">Last updated: August 20, 2026</p>
      <p className="page-intro">This policy is intended to protect Centrum Service customers, systems, and network reliability while allowing normal personal and business internet use.</p>

      <section className="card legal-section">
        <h2>Do not use the service for unlawful activity</h2>
        <p>Customers must not use Centrum Service to carry out activity that violates applicable law, infringes the rights of others, or knowingly facilitates unlawful conduct.</p>
      </section>

      <section className="card legal-section">
        <h2>Do not attack or interfere with networks</h2>
        <ul className="legal-list">
          <li>Do not attempt unauthorized access to accounts, devices, servers, or networks.</li>
          <li>Do not distribute malware or intentionally operate systems designed to compromise other devices.</li>
          <li>Do not launch denial-of-service attacks, abusive scans, or traffic intended to degrade service.</li>
          <li>Do not bypass security or access controls protecting Centrum Service systems or other users.</li>
        </ul>
      </section>

      <section className="card legal-section">
        <h2>Messaging and abuse</h2>
        <p>Do not use the service to send unsolicited bulk messages, phishing attempts, fraudulent communications, harassment, or other abusive traffic that creates material harm or network reputation problems.</p>
      </section>

      <section className="card legal-section">
        <h2>Protect your connection</h2>
        <p>Customers should take reasonable steps to secure their router, Wi-Fi network, devices, and account credentials. Contact Centrum Service if you suspect your connection or account is being abused.</p>
      </section>

      <section className="card legal-section">
        <h2>Network protection</h2>
        <p>When activity creates a credible security, abuse, or stability risk, Centrum Service may take proportionate technical steps needed to investigate, contain, or stop the problem. Support should be contacted where a legitimate application is being affected unexpectedly.</p>
      </section>

      <section className="card legal-section">
        <h2>Questions or reports</h2>
        <p>Report network abuse or ask about this policy through the <Link href="/contact">contact page</Link>, by phone at <a href="tel:+96103822947">+961 03 822 947</a>, or by email at <a href="mailto:tonyreaidy@live.com">tonyreaidy@live.com</a>.</p>
      </section>
    </article>
  );
}
