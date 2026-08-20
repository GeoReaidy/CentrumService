import { getPublicPlans } from "@/lib/public-catalog-server";
import { PlansClient } from "./PlansClient";

export const revalidate = 300;

export default function PlansPage() {
  return <PlansServerContent />;
}

async function PlansServerContent() {
  const initial = await getPublicPlans();

  return (
    <PlansClient
      initialPlans={initial.data}
      initialLoadFailed={initial.failed}
    />
  );
}
