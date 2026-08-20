export default function Loading() {
  return (
    <section className="app-state-page" aria-live="polite" aria-busy="true">
      <div className="app-state app-state-loading">
        <span className="app-state-spinner" aria-hidden="true" />
        <div className="badge card-badge">Centrum Service</div>
        <h1>Loading…</h1>
        <p>Getting the latest information for you.</p>
      </div>
    </section>
  );
}
