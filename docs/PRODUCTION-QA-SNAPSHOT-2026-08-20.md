# Centrum Service — Production QA Snapshot

Snapshot date: **2026-08-20**

This is a read-only infrastructure snapshot taken while implementing V1 checklist items #11 and #12. It is not a substitute for running the interactive/manual checklist after the latest patch is deployed.

## Passed / healthy

- Supabase project `CentrumService` reports `ACTIVE_HEALTHY` on PostgreSQL 17.
- All 21 current `public` tables have Row Level Security enabled.
- Expected core tables for customers, plans, coverage, tickets, contact, service requests, nodes, monitor agents, assignments, and probe results are present.
- At snapshot time there was 1 enabled monitor agent, 1 service node, 1 monitor assignment, and the enabled monitor heartbeat was fresh within the 150-second monitoring window.
- Expected Edge Functions are ACTIVE: `network-monitor`, `service-customization`, `delete-account`, and `contact-submit`.
- `network-monitor` remains JWT-verification-off intentionally because it performs custom monitor-key authentication.
- `delete-account` has JWT verification enabled.
- Current Netlify production deploy is a Next.js deploy with the Netlify Next.js server handler, framework-generated redirects, and security header handling. The earlier raw `.next` routing failure is no longer present in the current deploy metadata.

## Release blocker to verify/fix

### Netlify visitor protection

Netlify currently reports team-login/SSO visitor protection enabled with scope `all` for this project. Centrum is intended to be a public ISP website, so production must not require a Netlify team login.

Before V1 feature freeze, verify in Netlify:

**Project configuration → Access & security → Visitor access**

Production should be public. If protection is desired for previews, scope it to non-production deploys only.

This setting was not changed automatically during QA because changing live visitor access is a production access-control action.

## Security warning to address

Supabase's security advisor reports **Leaked Password Protection Disabled**. Enable compromised-password checking in Supabase Auth before public V1 if the option is available for the project.

The advisor also flags these externally callable `SECURITY DEFINER` functions:

- `get_public_network_status()` — intentional public RPC, designed to expose only safe aggregate status.
- `get_my_network_status()` — intentional authenticated RPC, designed to return the signed-in customer's scoped status.
- `is_admin()` — used for authenticated admin authorization/policies and returns only the authorization boolean.

These are intentional exceptions only if their current bodies remain narrowly scoped. Re-review them after any future edits.

## Non-blocking performance findings

The Supabase performance advisor currently reports informational/warning-level optimization opportunities including some unindexed foreign keys, multiple permissive RLS policies, and duplicate/unused indexes. They are not evidence of a current outage and should not be changed blindly during the V1 freeze. Record them for a focused post-release database optimization pass unless profiling shows one is already causing user-visible latency.

## Still requires manual QA

The following cannot be proven safely by an infrastructure-only read:

- unauthenticated browser access after visitor-protection configuration is corrected;
- register/confirm/login/forgot-password/reset flows;
- customer/admin authorization from real browser sessions;
- ticket/live-chat/contact end-to-end behavior;
- self-delete using a disposable test account;
- mobile/keyboard behavior on real browsers/devices;
- monitor failover and safe node-outage tests;
- creation and checksum verification of an off-site backup bundle.

Run `docs/PRODUCTION-QA.md` on the deployed release candidate before checklist item #13.
