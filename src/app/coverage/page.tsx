export default function CoveragePage() {
  const areas = [
    "Deir el Ahmar",
    "Chlifa",
    "Yammoune",
    "Baalbek outskirts",
    "Nearby villages in North Bekaa",
  ];

  return (
    <section>
      <h1>Coverage Areas</h1>
      <p className="page-intro">
        BekaaNet is expanding continuously. If your area is not listed yet, contact us and
        we will confirm availability.
      </p>
      <div className="card">
        <ul className="simple-list">
          {areas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
