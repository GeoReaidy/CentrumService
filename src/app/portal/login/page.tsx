export default function PortalLoginPage() {
  return (
    <section>
      <h1>Customer Portal Login</h1>
      <p className="page-intro">
        Sign in to manage your account, report issues, and track ticket updates.
      </p>
      <form className="card form-grid">
        <label>
          Email
          <input type="email" placeholder="you@example.com" />
        </label>
        <label>
          Password
          <input type="password" placeholder="Your password" />
        </label>
        <button type="button" className="btn btn-primary">Sign In</button>
      </form>
    </section>
  );
}
