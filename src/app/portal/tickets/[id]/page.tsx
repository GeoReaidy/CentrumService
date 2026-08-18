type TicketPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PortalTicketDetailsPage({ params }: TicketPageProps) {
  const { id } = await params;

  return (
    <section>
      <h1>Ticket #{id}</h1>
      <p className="page-intro">Track progress and exchange messages with support.</p>
      <article className="card">
        <p><strong>Status:</strong> In Progress</p>
        <p><strong>Subject:</strong> Reported connectivity issue</p>
        <p><strong>Last update:</strong> Technician assigned and reviewing line condition.</p>
      </article>
    </section>
  );
}
