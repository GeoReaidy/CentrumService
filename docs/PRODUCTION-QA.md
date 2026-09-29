# Centrum Service — V1 Final Production QA

Use this after the exact release candidate has been deployed to production. Never perform destructive tests with a real customer account.

## 1. Automated release gate

From the repository root:

```powershell
npm run check:routes
npm run build
npm run qa:prod
```

To test a preview or alternate domain:

```powershell
npm run qa:prod -- https://YOUR-DEPLOY-URL.netlify.app
```

`qa:prod` checks public route identity, auth-entry pages, robots, sitemap, security headers, 404 behavior, and detects common Netlify visitor/team-login protection pages.

**Any automated failure blocks V1 feature freeze.**

## 2. Netlify / public access

- [ ] Production deployment is `ready`.
- [ ] Next.js runtime/server handler is deployed; the site is not a raw `.next` static upload.
- [ ] Production is publicly reachable without Netlify team login/password protection.
- [ ] Custom domain HTTPS works.
- [ ] `/`, `/plans`, `/coverage`, `/contact`, `/about`, `/privacy`, `/terms`, `/acceptable-use` load.
- [ ] Unknown route renders the intended 404.
- [ ] No browser console crash on public pages.

## 3. Mobile / accessibility

Test at approximately 360 px, 390 px, tablet width, and desktop:

- [ ] Header/navigation fits without horizontal overflow.
- [ ] Footer columns collapse cleanly.
- [ ] Forms remain usable and do not trigger iOS input zoom.
- [ ] Keyboard-only navigation can reach all interactive controls.
- [ ] Skip-to-main-content works.
- [ ] Focus indicator is visible.
- [ ] Reduced-motion preference does not leave essential UI unusable.
- [ ] Text remains readable at 200% browser zoom.

## 4. SEO / metadata

- [ ] `/robots.txt` allows public routes and disallows `/admin` and `/portal`.
- [ ] `/sitemap.xml` contains every intended public page.
- [ ] Page titles/descriptions are sensible for Home, Plans, Coverage, Contact, and legal pages.
- [ ] favicon/app icons load.
- [ ] Open Graph image resolves.

## 5. Authentication — TEST ACCOUNT ONLY

Create a fresh test customer account:

- [ ] Registration submits successfully.
- [ ] Email confirmation flow works when enabled.
- [ ] Login rejects a wrong password and accepts the correct password.
- [ ] Resend confirmation behaves correctly.
- [ ] Forgot-password email arrives.
- [ ] Reset-password link and new password work.
- [ ] Logout removes portal access.
- [ ] A normal customer cannot access admin data/actions.
- [ ] Self-service account deletion works for the test account, including the final signed-out/deleted state.

## 6. Customer portal

Using a test customer profile:

- [ ] Dashboard loads without uncaught errors.
- [ ] Correct plan/customer information appears.
- [ ] Network status is scoped to the customer's assigned node.
- [ ] Existing unresolved ticket appears as active.
- [ ] Create a new ticket and send a ticket update.
- [ ] Customer sees admin reply/update.
- [ ] Live chat behaves as designed.
- [ ] Account page loads and permitted edits save.

## 7. Admin console

- [ ] Admin login reaches Admin Console.
- [ ] Non-admin login cannot reach privileged data/actions.
- [ ] Plans add/edit/disable behavior works.
- [ ] Coverage region add/edit/disable behavior works.
- [ ] Customer assignment changes persist.
- [ ] Ticket status/replies update correctly.
- [ ] Contact/service customization queues load.

## 8. Monitoring / outage behavior

Use a non-critical test node when possible:

- [ ] Add a service node with only name + monitor IP.
- [ ] Delete it and re-add it.
- [ ] Add a monitoring agent.
- [ ] Assign/unassign targets independently from node creation.
- [ ] Delete the monitoring agent; the service node remains.
- [ ] Re-add the monitoring agent and generate setup files.
- [ ] Download both `.rsc` and `.md` instructions.
- [ ] Install/import `.rsc` in WinBox and confirm scheduler/script exist.
- [ ] Confirm fresh heartbeat appears in Admin.
- [ ] With two agents assigned to one node, take one agent offline: node should remain up if the other still reports UP.
- [ ] Take/reboot a safe test node: status should transition down/unknown while unreachable and recover after it responds again.

## 9. Supabase / security

- [ ] Supabase project reports healthy.
- [ ] Every application table in `public` has RLS enabled.
- [ ] Expected Edge Functions are ACTIVE.
- [ ] `network-monitor` remains custom-auth/JWT-verification-off by design.
- [ ] `delete-account` requires JWT.
- [ ] No service-role/secret key appears in browser source, Git, or generated public assets.
- [ ] Enable Supabase Auth leaked-password protection before public V1 if available for the project.
- [ ] Review Supabase security/performance advisors and document intentional exceptions.

## 10. Backup and rollback proof

- [ ] `npm run backup:prod` creates a production backup bundle.
- [ ] `npm run backup:verify -- -BackupDir "..."` passes.
- [ ] Backup copied off-site/encrypted and is not tracked by Git.
- [ ] Operator knows how to publish a previous Netlify deploy.
- [ ] Operator knows that frontend rollback does **not** imply database rollback.
- [ ] Recovery runbook is accessible: `docs/PRODUCTION-RECOVERY.md`.

## 11. Final sign-off

Before moving to checklist item #13:

- [ ] All automated checks pass against the production domain.
- [ ] No unresolved P0/P1 functional defect remains.
- [ ] No public-access protection accidentally gates production.
- [ ] Test accounts/test tickets/test nodes are cleaned up.
- [ ] Latest production Git commit is recorded.
- [ ] Latest verified backup timestamp is recorded.
- [ ] Known non-blocking issues are written down instead of being silently ignored.

Only then declare V1 complete and feature-freeze it.
