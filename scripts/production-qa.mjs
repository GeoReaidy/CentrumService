#!/usr/bin/env node

const rawBase = process.argv[2] || process.env.CENTRUM_BASE_URL || "https://centrumservice.net";
const baseUrl = rawBase.replace(/\/$/, "");
const canonicalBase = (process.env.CENTRUM_CANONICAL_URL || "https://centrumservice.net").replace(/\/$/, "");
const timeoutMs = Number(process.env.CENTRUM_QA_TIMEOUT_MS || 15000);

const pageChecks = [
  ["/", "High-Speed Internet"],
  ["/plans", "Internet plans and pricing in North Bekaa"],
  ["/coverage", "Internet coverage across North Bekaa"],
  ["/contact", "Talk to a real local support team"],
  ["/about", "About Centrum Service"],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Use"],
  ["/acceptable-use", "Acceptable Use Policy"],
  ["/portal/login", "Centrum Portal Login"],
  ["/portal/register", "Create Your Portal Account"],
  ["/portal/forgot-password", "Reset Your Password"],
];

let passed = 0;
let warned = 0;
let failed = 0;

function pass(message) {
  passed += 1;
  console.log(`PASS  ${message}`);
}

function warn(message) {
  warned += 1;
  console.warn(`WARN  ${message}`);
}

function fail(message) {
  failed += 1;
  console.error(`FAIL  ${message}`);
}

async function fetchChecked(path) {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Centrum-V1-Production-QA/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function looksVisitorGated(response, body) {
  const finalHost = (() => {
    try { return new URL(response.url).hostname; } catch { return ""; }
  })();
  const lower = body.toLowerCase();
  return (
    response.status === 401 ||
    response.status === 403 ||
    finalHost === "app.netlify.com" ||
    lower.includes("log in to netlify") ||
    lower.includes("netlify team login") ||
    lower.includes("request access") && lower.includes("netlify")
  );
}

console.log(`Centrum V1 production QA\nTarget: ${baseUrl}\n`);

for (const [path, marker] of pageChecks) {
  try {
    const response = await fetchChecked(path);
    const body = await response.text();

    if (looksVisitorGated(response, body)) {
      fail(`${path} is behind Netlify visitor/team-login protection`);
      continue;
    }
    if (!response.ok) {
      fail(`${path} returned HTTP ${response.status}`);
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      fail(`${path} returned unexpected Content-Type: ${contentType || "(missing)"}`);
      continue;
    }
    if (!body.includes(marker)) {
      fail(`${path} did not contain its route identity marker: ${JSON.stringify(marker)}`);
      continue;
    }
    pass(`${path} -> HTTP ${response.status}, correct page identity`);
  } catch (error) {
    fail(`${path} request failed: ${error?.message || error}`);
  }
}

try {
  const response = await fetchChecked("/robots.txt");
  const body = await response.text();
  if (!response.ok) fail(`/robots.txt returned HTTP ${response.status}`);
  else if (!/user-agent\s*:\s*\*/i.test(body)) fail(`/robots.txt is missing User-Agent: *`);
  else if (!body.includes("/admin") || !body.includes("/portal")) fail(`/robots.txt does not disallow admin/portal routes`);
  else if (!body.includes("/sitemap.xml")) fail(`/robots.txt does not reference sitemap.xml`);
  else pass(`/robots.txt contains crawler, private-route, and sitemap rules`);
} catch (error) {
  fail(`/robots.txt request failed: ${error?.message || error}`);
}

try {
  const response = await fetchChecked("/sitemap.xml");
  const body = await response.text();
  const requiredPaths = ["/plans", "/coverage", "/contact", "/about", "/privacy", "/terms", "/acceptable-use"];
  if (!response.ok) fail(`/sitemap.xml returned HTTP ${response.status}`);
  else if (!body.includes("<urlset")) fail(`/sitemap.xml is not a URL set`);
  else {
    const missing = requiredPaths.filter((path) => {
      const candidates = [`${canonicalBase}${path}`, `${baseUrl}${path}`];
      return !candidates.some((candidate) => body.includes(candidate));
    });
    if (missing.length) fail(`/sitemap.xml is missing: ${missing.join(", ")}`);
    else pass(`/sitemap.xml contains all public V1 routes`);
  }
} catch (error) {
  fail(`/sitemap.xml request failed: ${error?.message || error}`);
}

try {
  const response = await fetchChecked("/");
  const body = await response.text();
  if (!looksVisitorGated(response, body) && response.ok) {
    const requiredHeaders = [
      ["content-security-policy", null],
      ["x-content-type-options", "nosniff"],
      ["x-frame-options", "DENY"],
      ["referrer-policy", null],
      ["permissions-policy", null],
    ];

    for (const [name, exact] of requiredHeaders) {
      const value = response.headers.get(name);
      if (!value) fail(`security header missing: ${name}`);
      else if (exact && value.toLowerCase() !== exact.toLowerCase()) fail(`${name} expected ${exact}, received ${value}`);
      else pass(`security header present: ${name}`);
    }
  }
} catch (error) {
  fail(`security-header check failed: ${error?.message || error}`);
}

try {
  const response = await fetchChecked("/this-route-should-never-exist-centrum-v1-qa");
  if (response.status === 404) pass(`unknown route correctly returns HTTP 404`);
  else warn(`unknown route returned HTTP ${response.status}; verify custom not-found behavior manually`);
} catch (error) {
  warn(`404 behavior could not be checked: ${error?.message || error}`);
}

console.log(`\nSummary: ${passed} passed, ${warned} warnings, ${failed} failed.`);
if (failed > 0) {
  console.error("V1 production QA FAILED. Do not declare feature freeze yet.");
  process.exit(1);
}

console.log("Automated V1 production QA PASSED. Complete docs/PRODUCTION-QA.md before feature freeze.");
