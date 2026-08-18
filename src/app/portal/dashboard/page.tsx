const mockTickets = [
  { id: 1201, subject: "No internet since morning", status: "in_progress" },
  { id: 1178, subject: "Slow speed at night", status: "resolved" },
];

export default function PortalDashboardPage() {
  return (
    <section>
      <h1>Customer Dashboard</h1>
      <p className="page-intro">Welcome back. Track your account and support requests.</p>

      <div className="section-grid">
        <article className="card">
          <h2>Account</h2>
          <p><strong>Name:</strong> Example Customer</p>
          <p><strong>Plan:</strong> Family 50/15 Mbps</p>
          <p><strong>Status:</strong> Active</p>
        </article>

        <article className="card">
          <h2>Usage snapshot</h2>
          <p>Phase 1 placeholder. RADIUS usage sync will be enabled in Phase 2.</p>
        </article>
      </div>

      <article className="card">
        <h2>Recent Tickets</h2>
        <ul className="simple-list">
          {mockTickets.map((ticket) => (
            <li key={ticket.id}>
              #{ticket.id} - {ticket.subject} ({ticket.status})
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
