# Centrum Service — UI Unification Pass 1

This patch is the first site-wide UI cleanup pass, focused on the Manager console, Admin console, Network workspace, Staff & Roles, and Admin customer management.

## UI fixes

- Manager form controls now use the same dark inputs/dropdowns/focus states as Admin instead of browser-native white/gray selectors.
- Admin and Manager selects re-use the same custom arrow treatment.
- Status pills and node-status badges are forced to stay on one horizontal line (`white-space: nowrap`).
- Buttons also keep their labels on one line where space allows.
- Staff & Roles gives the role selector and **Change Role** button enough room so the label no longer gets crushed.

## Admin console cleanup

Removed duplicated header actions from the Admin Console:

- Account Settings
- Staff & Roles
- Homepage

Only **Sign Out** remains in the page header. Account Settings and Staff & Roles remain in the left-side Tools menu, and Homepage is already available from the global site navigation.

Removed the duplicate Overview shortcut buttons for Live Chat, Customer Operations, and Account Settings because those destinations already exist in the side menu.

Removed the extra Network-heading status pill. The full Automatic Monitoring status card directly below remains the canonical status display.

## Customer-management fixes

The Admin Customers workspace now loads only `role = customer` profiles. Staff accounts are managed in **Staff & Roles** instead of being counted as customers.

Admin customer editing now includes **Full name**, matching the Manager console capability.

Admins can now permanently delete a customer account from the expanded customer editor:

1. Click **Delete Customer Account**.
2. Confirm the warning.
3. Type `DELETE CUSTOMER` exactly.
4. The authenticated Edge Function verifies that the caller is an Administrator and that the target is still a Customer before deleting the Supabase Auth user.

Manager/support/admin targets cannot be deleted through the customer-management action. Staff must be handled through Staff & Roles first.

Accounting history that is configured with `ON DELETE SET NULL` remains retained without the deleted account link.

## Files changed

- `src/app/admin/page.tsx`
- `src/app/globals.css`
- `supabase/functions/delete-account/index.ts`

No database migration is required for this pass.

## Apply / test

Extract the ZIP over the project root, then run:

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue
npm run check:routes
npm run build
```

Because Admin customer deletion extends the existing `delete-account` Edge Function, deploy it after the build succeeds:

```powershell
npx supabase functions deploy delete-account
```

Then commit/push normally.

## Validation performed

- `node check.js` passes with all current Admin, Manager, Portal, and public routes.
- TypeScript parser checks on the modified TSX files found no syntax errors; this container does not contain the project's installed React/Next packages, so the full Next build must be run in the local project.
- The Edge Function parser check found only expected missing Deno/npm type-environment errors in this container, not syntax errors.
