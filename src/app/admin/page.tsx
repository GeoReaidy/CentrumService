const mockUsers = [
  { name: "Ali Hamdan", area: "Deir el Ahmar", plan: "Family", status: "active" },
  { name: "Maya Nasser", area: "Chlifa", plan: "Starter", status: "active" },
];

const mockAdminTickets = [
  { id: 1201, customer: "Ali Hamdan", status: "in_progress" },
  { id: 1202, customer: "Maya Nasser", status: "open" },
];

export default function AdminPage() {
  return (
    <section>
      <h1>Admin Dashboard</h1>
      <p className="page-intro">
        Manage users, monitor open tickets, and coordinate support actions.
      </p>

      <div className="section-grid">
        <article className="card">
          <h2>Customers</h2>
          <ul className="simple-list">
            {mockUsers.map((user) => (
              <li key={user.name}>
                {user.name} - {user.area} - {user.plan} ({user.status})
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Open Tickets</h2>
          <ul className="simple-list">
            {mockAdminTickets.map((ticket) => (
              <li key={ticket.id}>
                #{ticket.id} - {ticket.customer} ({ticket.status})
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
