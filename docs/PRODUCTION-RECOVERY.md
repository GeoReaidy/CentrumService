# Centrum Service — Production Backup, Recovery & Rollback

This is the V1 recovery runbook. Keep a copy available somewhere other than the production site.

## Recovery priorities

Use the least destructive recovery that fixes the incident:

1. **Frontend/code regression:** roll back Netlify only. Do not touch the database.
2. **Bad database migration with no meaningful data loss:** prefer a targeted forward-fix migration.
3. **Corrupted/deleted application data:** restore the smallest safe database scope available.
4. **Supabase project loss:** restore/duplicate from Supabase backup when available, or perform a manual logical restore into a new project.

Database restore is a last resort on a live service because restoring to an older point can discard customer activity created after that point.

## Create a manual production backup

Prerequisites:

- Docker Desktop running (required by Supabase CLI database dump).
- Supabase CLI available through `npx supabase`.
- A database connection string from **Supabase Dashboard → Connect**. Prefer the Session pooler unless you know direct IPv6 connectivity works.
- Run from the Centrum repository root.

Do not paste the database password into committed files. For the current PowerShell session:

```powershell
$env:SUPABASE_DB_URL = "postgresql://..."
$env:SUPABASE_PROJECT_REF = "zlcikwwrgdnkscfitfqg"
npm run backup:prod
```

The script creates `backups/centrum-YYYYMMDD-HHMMSS/` containing:

- `roles.sql`
- `schema.sql`
- `data.sql`
- Supabase migration-history schema/data
- a ZIP of the committed Git source at the current HEAD
- Edge Function and migration inventories when available
- `manifest.json` with SHA-256 checksums

Verify it immediately:

```powershell
npm run backup:verify -- -BackupDir "backups\centrum-YYYYMMDD-HHMMSS"
```

Then copy the entire backup directory to encrypted/off-site storage. **Do not commit backups to GitHub and do not put them in Netlify. They may contain customer data.**

## What a database backup does not replace

Keep these separately:

- GitHub repository and commit history.
- Netlify environment variables and domain configuration.
- Supabase project configuration, Auth settings, SMTP configuration, and secrets.
- Edge Function secrets.
- Router/monitor setup procedures.
- Supabase Storage objects if Centrum later stores customer files there. Database backups contain Storage metadata, not deleted file objects themselves.

Never put service-role/secret keys or database passwords into this repository or the backup README.

## Netlify rollback — code-only incident

For a broken frontend deploy:

1. Open **Netlify → CentrumService → Deploys**.
2. Open the last known-good successful production deploy.
3. Select **Publish deploy**.
4. Verify `/`, `/plans`, `/coverage`, `/contact`, `/portal/login`, and `/admin` behavior.
5. Remember: a later Git-triggered production deploy can overwrite the rollback. Revert/fix the bad Git commit too.

Netlify deploys are atomic, so publishing a prior successful deploy is the preferred first response to a frontend regression.

## Supabase managed restore

If the project plan exposes managed backups, use **Supabase Dashboard → Database → Backups**. Supabase may provide daily backups or Point-in-Time Recovery depending on plan/add-ons.

Before confirming a restore:

1. Record the desired recovery timestamp.
2. Estimate what customer activity would be lost between that timestamp and now.
3. Take a fresh manual logical dump if the database is still reachable.
4. Inform operators that the project can be inaccessible during restoration.
5. Prefer restoring to a new/duplicate project for investigation when practical instead of immediately overwriting production.

## Manual logical recovery into a NEW Supabase project

Use this only when managed restore/duplicate-project recovery is not appropriate. Do **not** test this against the live production database.

Create a fresh target project and get its connection string. Then restore a verified backup with `psql`:

```powershell
$env:NEW_DB_URL = "postgresql://..."

psql `
  --single-transaction `
  --variable ON_ERROR_STOP=1 `
  --file "roles.sql" `
  --file "schema.sql" `
  --command "SET session_replication_role = replica" `
  --file "data.sql" `
  --dbname $env:NEW_DB_URL
```

If preserving the old Supabase CLI migration history is required, restore `migration-history-schema.sql` and `migration-history-data.sql` afterward according to the current Supabase recovery documentation.

After database recovery:

- Reconfigure Auth/SMTP/project settings.
- Reconfigure secrets from the secure secret store/dashboard; never recover them from Git.
- Redeploy the repository's Edge Functions using their existing JWT/custom-auth configuration.
- Restore Storage objects separately if the application uses Storage files.
- Update Netlify environment variables only if the Supabase project reference changed.
- Run `npm run qa:prod` against the recovery URL before switching traffic.

## Monitoring recovery

The monitoring database stores credential hashes, not a recoverable plaintext monitor credential. After a full project rebuild:

1. Confirm monitor agents and target assignments are present.
2. Confirm `network-monitor` is deployed with its custom monitor authentication behavior.
3. If an agent can no longer authenticate, use **Regenerate Setup** in Admin and install the newly generated `.rsc` on that monitoring router.
4. Confirm at least one assigned agent reports each production node.

## Disaster recovery drill

At least once before V1 feature freeze, and periodically afterward:

1. Create a manual backup with `npm run backup:prod`.
2. Verify checksums with `npm run backup:verify`.
3. Confirm the repository ZIP opens and contains `src/`, `supabase/`, `package.json`, and `netlify.toml`.
4. Confirm `schema.sql` and `data.sql` are non-empty.
5. Practice a Netlify rollback using a non-production/preview deployment where possible.
6. Do not perform a database restore drill against live production data.

## Recovery completion criteria

Recovery is not complete until:

- Public pages return correctly.
- Login/register/recovery flows work.
- Admin access works only for an admin.
- Customer data is visible to the correct customer only.
- Monitoring agents are reporting and node status is fresh.
- Tickets/live chat/contact flows work.
- `npm run qa:prod` passes.
