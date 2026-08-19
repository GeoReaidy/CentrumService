// Route integrity checker for Centrum Service.
// Run: npm run check:routes
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(process.cwd(), "src", "app");

const expected = new Map([
  ["page.tsx", "HomePage"],
  ["admin/page.tsx", "AdminPage"],
  ["admin/live-chat/page.tsx", "AdminLiveChatPage"],
  ["admin/operations/page.tsx", "AdminOperationsPage"],
  ["contact/page.tsx", "ContactPage"],
  ["coverage/page.tsx", "CoveragePage"],
  ["plans/page.tsx", "PlansPage"],
  ["portal/page.tsx", "PortalPage"],
  ["portal/dashboard/page.tsx", "PortalDashboardPage"],
  ["portal/live-chat/page.tsx", "CustomerLiveChatPage"],
  ["portal/login/page.tsx", "PortalLoginPage"],
  ["portal/register/page.tsx", "PortalRegisterPage"],
  ["portal/tickets/new/page.tsx", "NewTicketPage"],
  ["portal/tickets/[id]/page.tsx", "PortalTicketDetailsPage"],
]);

let failed = false;
const hashes = new Map();

console.log("Centrum route integrity check\n");

for (const [relative, expectedComponent] of expected) {
  const file = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(file)) {
    console.error(`MISSING  /${relative.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "") || ""} -> ${relative}`);
    failed = true;
    continue;
  }

  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
  const component = match?.[1] ?? "(unknown)";
  const hash = crypto.createHash("sha256").update(text).digest("hex");

  if (!hashes.has(hash)) hashes.set(hash, []);
  hashes.get(hash).push(relative);

  if (component !== expectedComponent) {
    console.error(`WRONG    ${relative}: expected ${expectedComponent}, found ${component}`);
    failed = true;
  } else {
    console.log(`OK       ${relative} -> ${component}`);
  }
}

for (const files of hashes.values()) {
  if (files.length > 1) {
    console.error(`DUPLICATE route files have identical contents: ${files.join(", ")}`);
    failed = true;
  }
}

const siteHeader = path.join(process.cwd(), "src", "components", "SiteHeader.tsx");
if (!fs.existsSync(siteHeader)) {
  console.error("MISSING  src/components/SiteHeader.tsx");
  failed = true;
} else {
  const headerText = fs.readFileSync(siteHeader, "utf8");
  if (!headerText.includes('{ href: "/portal", label: "Portal"')) {
    console.error("WRONG    SiteHeader Portal entry must point to /portal");
    failed = true;
  } else {
    console.log("OK       SiteHeader Portal entry -> /portal");
  }
}

if (failed) {
  console.error("\nRoute check FAILED. A page file is missing, copied into the wrong route, or duplicated.");
  process.exit(1);
}

console.log("\nRoute check PASSED.");
