import Link from "next/link";

export default function PortalAccountDeletedPage() {
  return (
    <section className="auth-shell animate-fade-in">
      <article className="card auth-card">
        <div className="badge card-badge">Account Removed</div>
        <h1>Portal Account Deleted</h1>
        <p className="page-intro">
          Your Centrum Portal account has been deleted. The old email and password can no longer be used to sign in.
        </p>
        <div className="section-actions">
          <Link href="/" className="btn btn-secondary">Return Home</Link>
          <Link href="/portal/register" className="btn btn-primary">Create a New Account</Link>
        </div>
      </article>
    </section>
  );
}
