import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Centrum Service, a local internet provider serving homes and businesses across North Bekaa, Lebanon.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <section className="animate-fade-in business-page">
      <div className="badge page-badge">About Centrum Service</div>
      <h1>Local connectivity, built around North Bekaa</h1>
      <p className="page-intro business-intro">
        Centrum Service provides internet access for homes and businesses across North Bekaa, with locally managed coverage, published service plans, and direct customer support.
      </p>

      <div className="section-grid business-feature-grid">
        <article className="card">
          <div className="badge card-badge">Local Network</div>
          <h2>Managed close to home</h2>
          <p>Coverage and service nodes are managed locally so network issues can be identified and handled with local context.</p>
        </article>
        <article className="card">
          <div className="badge card-badge">Clear Options</div>
          <h2>Plans you can compare</h2>
          <p>Customers can review current plans, check service availability, and request help choosing the right connection.</p>
        </article>
        <article className="card">
          <div className="badge card-badge">Customer Access</div>
          <h2>Support beyond the installation</h2>
          <p>The Centrum Portal keeps account information, support tickets, service status, and live support in one place.</p>
        </article>
      </div>

      <div className="business-details-grid">
        <article className="card business-details-card">
          <div className="badge card-badge">Business Details</div>
          <h2>Contact Centrum Service</h2>
          <dl className="business-facts">
            <div><dt>Service area</dt><dd>North Bekaa, Lebanon</dd></div>
            <div><dt>Phone</dt><dd><a href="tel:+96103822947">+961 03 822 947</a></dd></div>
            <div><dt>Email</dt><dd><a href="mailto:tonyreaidy@live.com">tonyreaidy@live.com</a></dd></div>
            <div><dt>Operations desk</dt><dd>Monday–Saturday · 08:00–18:00</dd></div>
          </dl>
        </article>

        <article className="card">
          <div className="badge card-badge">Get Connected</div>
          <h2>Check your location first</h2>
          <p>Coverage varies by location. Check the current coverage areas or contact the team with your village and exact location.</p>
          <div className="section-actions">
            <Link href="/coverage" className="btn btn-primary">Check Coverage</Link>
            <Link href="/contact" className="btn btn-secondary">Contact Us</Link>
          </div>
        </article>
      </div>
    </section>
  );
}
