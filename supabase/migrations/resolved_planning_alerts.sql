-- Alertes planning marquées comme résolues par l'admin (persistance)
create table if not exists resolved_planning_alerts (
  alert_id     text primary key,
  resolved_at  timestamptz not null default now(),
  resolved_by  uuid references auth.users(id) on delete set null
);

comment on table resolved_planning_alerts is
  'IDs d''alertes planning marquées résolues (cloche admin). Survit au rechargement.';

create index if not exists resolved_planning_alerts_resolved_at_idx
  on resolved_planning_alerts (resolved_at desc);

alter table resolved_planning_alerts enable row level security;

-- Lecture / écriture réservées aux admins (table profiles)
drop policy if exists resolved_planning_alerts_admin_all on resolved_planning_alerts;
create policy resolved_planning_alerts_admin_all
  on resolved_planning_alerts
  for all
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
