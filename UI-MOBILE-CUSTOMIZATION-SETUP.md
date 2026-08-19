# Centrum Service — UI, Customer Status, and Customization Setup

This build keeps the working MikroTik network-monitor endpoint intact. It adds a customer-safe network-status RPC, a service-customization request flow, email delivery through a Supabase Edge Function, consistent scroll/search/filter/sort list controls, and mobile layout hardening.

## 1. Replace the local project

Use this project folder as the new source. Before starting Next.js, clear the old cache and run the route integrity check:

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run check:routes
npm run dev
```

The route check must end with:

```text
Route check PASSED.
```

The correct route map is:

- `/` → HomePage
- `/portal` → PortalPage role router
- `/portal/dashboard` → customer dashboard
- `/admin` → admin dashboard
- `/portal/tickets/[id]` → ticket details

## 2. Run the NEW database migration

Your existing network-monitoring migration can stay as-is. Run only this new file in Supabase SQL Editor:

```text
supabase/migrations/20260819_customer_status_and_customization.sql
```

It creates:

1. `public.get_my_network_status()` — a security-definer RPC that lets a logged-in customer read only the monitoring snapshot of the node assigned to that customer's own profile, plus global maintenance / monitor heartbeat.
2. `public.service_customization_requests` — stores optional service-match questionnaires.
3. Admin-only RLS policies for reviewing and managing those customization requests.

After this migration, the customer dashboard no longer depends on direct customer SELECT access to `nodes` or `system_settings`, which fixes the network status getting stuck on “Checking Status”.

## 3. Deploy the new service-customization Edge Function

This project is already configured for:

```text
zlcikwwrgdnkscfitfqg
```

From PowerShell in the project root:

```powershell
npx supabase login
npx supabase link --project-ref zlcikwwrgdnkscfitfqg
npx supabase functions deploy service-customization
```

The deployed URL is:

```text
https://zlcikwwrgdnkscfitfqg.supabase.co/functions/v1/service-customization
```

`supabase/config.toml` already sets `verify_jwt = false` for this function because the wizard is intentionally available to prospective users before they sign in. The function still validates input server-side and uses a honeypot field for simple bot suppression.

## 4. Configure email delivery to Tony

The function stores every submitted request in Supabase first. For email delivery it expects Resend secrets.

Create a Resend API key, then set:

```powershell
npx supabase secrets set RESEND_API_KEY="YOUR_RESEND_API_KEY"
npx supabase secrets set CUSTOMIZATION_TO_EMAIL="tonyreaidy@live.com"
```

For production, verify a sending domain in Resend and use an address on that domain, for example:

```powershell
npx supabase secrets set CUSTOMIZATION_FROM_EMAIL="Centrum Service <requests@yourdomain.com>"
```

If the Resend account itself belongs to `tonyreaidy@live.com`, you can initially test with Resend's test sender. Otherwise, Resend requires a verified domain before sending to recipients other than the Resend account owner.

You do not need to redeploy the function after changing Edge Function secrets.

## 5. Test the customization flow

Test all three entry points:

### Public Plans page

Open `/plans` and click `Select Plan` on a plan. The service-match overlay should open with that plan already selected.

### Registration page

Open `/portal/register`. The normal account form stays simple. The optional `Help Me Customize My Service` button launches the guided overlay for users who want a recommendation.

### Existing customer

Sign in as a normal customer and open `/portal/dashboard`. The same customization button is available without forcing existing subscribers through the wizard.

A successful submission should:

1. create a row in `service_customization_requests`;
2. send an email to `tonyreaidy@live.com` if Resend is configured;
3. appear under Admin → Customer Operations → Customization Requests.

## 6. Verify the customer node-status fix

Make sure a customer profile has a valid `node_id` assigned in Admin → Customers.

The monitoring router should already be updating that node in `nodes` with values such as:

```text
probe_status = up
last_checked_at = current timestamp
```

Sign in as that customer. The dashboard should now follow this priority:

1. Global maintenance → Maintenance
2. Assigned node maintenance → Maintenance
3. Stale monitor heartbeat → Status Unavailable
4. Fresh assigned node `probe_status = up` → Online
5. Fresh assigned node `probe_status = down` → Service Outage
6. No first result yet → Checking Status

The dashboard polls the customer-safe RPC every 10 seconds, so current monitoring data should no longer remain stuck on Checking.

## 7. List/UI behavior added

Admin list sections now use fixed-height scroll areas rather than endlessly extending the page. Search/filter/sort controls are included where useful:

- Service Nodes
- Coverage Regions
- Contact Messages
- Customers
- Internet Plans
- Tickets
- Payment History
- Announcements
- Service Requests
- Customization Requests
- Live Chat conversations

Customer ticket, announcement, request and payment feeds also use bounded scroll areas.

## 8. Mobile checks

Test at roughly these widths in browser DevTools:

- 390 px — typical phone
- 430 px — large phone
- 768 px — tablet
- 1024 px — small laptop/tablet landscape
- desktop

On phone:

- top navigation becomes horizontally scrollable instead of overflowing;
- admin action groups become full-width stacked controls;
- search/filter toolbars collapse to one column;
- list boxes remain scrollable;
- plan/customer/node/request action buttons stack cleanly;
- the customization wizard becomes a bottom-sheet style overlay with its own scrolling content.

## 9. Important: no MikroTik changes are required

Do not replace or modify the working `network-monitor` Edge Function or the MikroTik script for these UI changes.

The new customer status path reads the database state already produced by the working monitor:

```text
MikroTik → network-monitor Edge Function → nodes/system_settings
                                      ↓
                         get_my_network_status()
                                      ↓
                            customer dashboard
```

