-- Centrum Service multilingual content fields.
-- English remains the required/default content. French and Arabic are optional
-- and the application falls back to English whenever a translated value is blank.

begin;

alter table public.plans
  add column if not exists name_fr text,
  add column if not exists name_ar text,
  add column if not exists description_fr text,
  add column if not exists description_ar text;

alter table public.announcements
  add column if not exists title_fr text,
  add column if not exists title_ar text,
  add column if not exists body_fr text,
  add column if not exists body_ar text;

alter table public.coverage_regions
  add column if not exists name_fr text,
  add column if not exists name_ar text,
  add column if not exists description_fr text,
  add column if not exists description_ar text;

-- Keep translated customer-facing plan descriptions within the same compact
-- one-line size used by the English description introduced in item #4.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plans_description_fr_length_check'
  ) then
    alter table public.plans add constraint plans_description_fr_length_check
      check (description_fr is null or char_length(description_fr) <= 160);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'plans_description_ar_length_check'
  ) then
    alter table public.plans add constraint plans_description_ar_length_check
      check (description_ar is null or char_length(description_ar) <= 160);
  end if;
end $$;

commit;
