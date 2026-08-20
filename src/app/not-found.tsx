import Link from "next/link";

export default function NotFound() {
  return (
    <section className="app-state-page animate-fade-in">
      <div className="app-state app-state-empty">
        <div className="badge card-badge">404</div>
        <h1>That page isn't here</h1>
        <p>The link may be outdated, mistyped, or the page may have moved.</p>
        <div className="section-actions app-state-actions">
          <Link href="/" className="btn btn-primary">Back to Home</Link>
          <Link href="/contact" className="btn btn-secondary">Contact Centrum</Link>
        </div>
      </div>
    </section>
  );
}
