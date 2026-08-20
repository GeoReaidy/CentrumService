import { getPublicCoverageRegions } from "@/lib/public-catalog-server";
import { CoverageClient } from "./CoverageClient";

export const revalidate = 300;

export default function CoveragePage() {
  return <CoverageServerContent />;
}

async function CoverageServerContent() {
  const initial = await getPublicCoverageRegions();

  return (
    <CoverageClient
      initialAreas={initial.data}
      initialLoadFailed={initial.failed}
    />
  );
}
