import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms for using the Centrum Service website and customer portal.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="animate-fade-in legal-page">
      <div className="badge page-badge">Legal</div>
      <h1>Terms of Use</h1>
      <p className="legal-updated">Last updated: August 20, 2026</p>
      <p className="page-intro">These terms govern use of the Centrum Service website and customer portal. Your internet subscription may also be subject to the service terms or agreement provided when service is activated.</p>

      <section className="card legal-section">
        <h2>Website and portal use</h2>
        <p>Use the website and portal lawfully and only for their intended purposes. Do not attempt to disrupt, probe, bypass, overload, or gain unauthorized access to the website, customer accounts, monitoring systems, or network infrastructure.</p>
      </section>

      <section className="card legal-section">
        <h2>Customer accounts</h2>
        <p>You are responsible for keeping your sign-in information confidential and for providing accurate account information. Contact Centrum Service promptly if you believe your account has been accessed without permission.</p>
      </section>

      <section className="card legal-section">
        <h2>Plans, coverage, and availability</h2>
        <p>Published plans and coverage information are provided to help customers understand available services. Final service availability can depend on the exact installation location, network capacity, technical feasibility, and the service arrangement confirmed with Centrum Service.</p>
      </section>

      <section className="card legal-section">
        <h2>Service status and support information</h2>
        <p>Network status information is provided as an operational aid and may not reflect every individual customer issue instantly. If your connection is not working normally, contact support even if the public status appears healthy.</p>
      </section>

      <section className="card legal-section">
        <h2>Acceptable use</h2>
        <p>Use of the network and portal is also subject to the <Link href="/acceptable-use">Acceptable Use Policy</Link>. Activity that threatens customers, systems, or network reliability may be investigated or restricted as reasonably necessary to protect the service.</p>
      </section>

      <section className="card legal-section">
        <h2>Changes and corrections</h2>
        <p>Centrum Service may update website content, plans, portal features, and these terms as services evolve. Material service-specific changes should be communicated through the appropriate customer or service channels.</p>
      </section>

      <section className="card legal-section">
        <h2>Contact</h2>
        <p>Questions about these terms can be sent through the <Link href="/contact">contact page</Link>, by phone at <a href="tel:+96103822947">+961 03 822 947</a>, or by email at <a href="mailto:tonyreaidy@live.com">tonyreaidy@live.com</a>.</p>
      </section>
    </article>
  );
}
