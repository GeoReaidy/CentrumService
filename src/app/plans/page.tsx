const plans = [
  { name: "Starter", speed: "20/8 Mbps", quota: "200 GB", price: "$20" },
  { name: "Family", speed: "50/15 Mbps", quota: "500 GB", price: "$35" },
  { name: "Pro", speed: "100/30 Mbps", quota: "Unlimited", price: "$55" },
];

export default function PlansPage() {
  return (
    <section>
      <h1>Internet Plans</h1>
      <p className="page-intro">Choose a plan that fits your home or business usage.</p>
      <div className="section-grid">
        {plans.map((plan) => (
          <article className="card" key={plan.name}>
            <h2>{plan.name}</h2>
            <p><strong>Speed:</strong> {plan.speed}</p>
            <p><strong>Quota:</strong> {plan.quota}</p>
            <p><strong>Price:</strong> {plan.price}/month</p>
          </article>
        ))}
      </div>
    </section>
  );
}
