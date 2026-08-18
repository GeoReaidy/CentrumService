export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Fast and stable internet across Bekaa.</h1>
        <p>
          BekaaNet provides dependable home and business connectivity in Deir el Ahmar,
          Chlifa, and nearby towns.
        </p>
        <div className="cta-row">
          <a href="/plans" className="btn btn-primary">View Plans</a>
          <a href="/portal/login" className="btn btn-secondary">Customer Portal</a>
        </div>
      </section>

      <section className="section-grid">
        <article className="card">
          <h2>Service coverage</h2>
          <p>We currently cover Deir el Ahmar, Chlifa, and surrounding villages.</p>
          <a href="/coverage" className="text-link">See full coverage map and areas</a>
        </article>

        <article className="card">
          <h2>Support that responds</h2>
          <p>Report issues from your portal and get direct updates from our team.</p>
          <a href="/contact" className="text-link">Contact support</a>
        </article>

        <article className="card">
          <h2>Built for growth</h2>
          <p>Phase 1 delivers essential customer and admin features with Supabase.</p>
          <a href="/admin" className="text-link">Open admin dashboard</a>
        </article>
      </section>
    </>
  );
}
