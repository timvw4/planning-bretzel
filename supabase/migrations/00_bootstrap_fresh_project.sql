-- ============================================================
-- PLANNING BRETZEL — Bootstrap projet Supabase neuf
-- ============================================================
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Projet : puxbvjedhptwmdlzaopu
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists employees (
  id                   text primary key default gen_random_uuid()::text,
  first_name           text not null,
  last_name            text default '',
  role                 text default '',
  position             text not null default 'vente'
                         check (position in ('boulanger', 'vente', 'cuisine')),
  email                text default '',
  phone                text default '',
  color                text not null default '#6366F1',
  availability         text[] default '{}',
  contract_type        text not null default 'fixed'
                         check (contract_type in ('fixed', 'hourly', 'intern', 'apprentice')),
  contract_hours       numeric default 42,
  annual_vacation_days integer not null default 25,
  notes                text default '',
  is_active            boolean default true,
  inactive_months      text[] default '{}',
  created_at           timestamptz default now()
);

-- L'email sert à relier un compte à sa fiche employé : il doit donc être
-- unique. Les fiches sans email ne sont pas concernées.
create unique index if not exists employees_email_unique_idx
  on employees (lower(email))
  where coalesce(email, '') <> '';

create table if not exists shifts (
  id             text primary key default gen_random_uuid()::text,
  name           text not null,
  short_name     text not null,
  type           text not null default 'work'
                   check (type in ('work', 'off', 'vacation', 'sick', 'holiday', 'training')),
  start_time     text default '',
  end_time       text default '',
  color          text not null,
  text_color     text not null,
  duration_hours numeric default 0,
  description    text default '',
  is_active      boolean default true,
  created_at     timestamptz default now()
);

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'employee' check (role in ('admin', 'employee')),
  employee_id text references employees(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists schedule_entries (
  id                   text primary key default gen_random_uuid()::text,
  employee_id          text not null references employees(id) on delete cascade,
  shift_id             text not null references shifts(id) on delete cascade,
  date                 date not null,
  note                 text default '',
  is_modified          boolean default false,
  visible_to_employee  boolean not null default true,
  validated_start      text,
  validated_end        text,
  -- Pause retenue sur la journée validée (barème LTr art. 15)
  validated_break_minutes integer,
  created_at           timestamptz default now(),
  unique (employee_id, date)
);

create table if not exists app_settings (
  id                     uuid primary key default gen_random_uuid(),
  company_name           text default 'Leonard Bretzel',
  week_start_day         integer default 1 check (week_start_day in (0, 1)),
  min_rest_hours         integer default 11,
  max_weekly_hours       integer default 50,
  locale                 text default 'fr-FR',
  timezone               text default 'Europe/Zurich',
  planning_month_mode    text default 'strict'
                           check (planning_month_mode in ('strict', 'full-weeks')),
  holidays               jsonb default '[]'::jsonb,
  -- Les pauses sont-elles retirées des heures payées ? Décision de
  -- l'établissement : désactivé au départ pour ne rien changer sans le savoir.
  deduct_breaks          boolean not null default false,
  notifications          jsonb default '{"overtime":true,"unavailable":true,"lowRest":true,"geofencePunch":true,"missingPunch":true,"shortBreak":true}'::jsonb,
  work_site_latitude     double precision,
  work_site_longitude    double precision,
  work_site_radius_m     double precision,
  updated_at             timestamptz default now()
);

-- Exceptions jour par jour (vacances / indispo)
create table if not exists availability_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references employees(id) on delete cascade,
  date         date not null,
  status       text not null
                 check (status in ('vacation', 'unavailable')),
  note         text default '',
  created_at   timestamptz default now(),
  unique (employee_id, date)
);

create table if not exists availability_validations (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references employees(id) on delete cascade,
  month_key    text not null,
  validated_at timestamptz default now(),
  unique (employee_id, month_key)
);

create table if not exists availability_unlock_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references employees(id) on delete cascade,
  month_key    text not null,
  reason       text not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users(id) on delete set null
);

create table if not exists time_declarations (
  id                         uuid primary key default gen_random_uuid(),
  employee_id                text not null references employees(id) on delete cascade,
  date                       date not null,
  planned_start              text,
  planned_end                text,
  actual_start               text,
  actual_end                 text,
  note                       text,
  status                     text not null default 'pending'
                               check (status in ('in_progress', 'pending', 'approved', 'rejected', 'auto_closed')),
  admin_note                 text,
  declared_at                timestamptz default now(),
  reviewed_at                timestamptz,
  clock_in_at                timestamptz,
  clock_out_at               timestamptz,
  auto_closed                boolean not null default false,
  clock_in_lat               double precision,
  clock_in_lng               double precision,
  clock_in_accuracy_m        double precision,
  clock_in_inside_geofence   boolean,
  clock_out_lat              double precision,
  clock_out_lng              double precision,
  clock_out_accuracy_m       double precision,
  clock_out_inside_geofence  boolean,
  declared_lat               double precision,
  declared_lng               double precision,
  declared_accuracy_m        double precision,
  declared_inside_geofence   boolean,
  -- Ancienne case « pause de 15 min », tenue à jour par l'application
  -- en même temps que pause_minutes, pour les écrans qui l'affichent encore.
  pause_15min                boolean not null default false,
  -- Durée de pause déclarée, en minutes (barème LTr art. 15)
  pause_minutes              integer not null default 0
                               check (pause_minutes >= 0 and pause_minutes <= 480),
  had_snack                  boolean not null default false,
  ate_work_food              boolean not null default false,
  approved_start_mode        text,
  approved_end_mode          text,
  -- Archivage : un pointage n'est jamais détruit, il est retiré des écrans.
  deleted_at                 timestamptz,
  deleted_by                 uuid references auth.users(id) on delete set null
);

-- « Un seul pointage par employé et par jour », en ignorant les archives.
create unique index if not exists time_declarations_active_day_idx
  on time_declarations (employee_id, date)
  where deleted_at is null;

-- Journal des corrections de pointage (qui, quand, quoi), rempli par un
-- déclencheur : l'application n'a rien à écrire ici.
create table if not exists time_declaration_history (
  id              bigserial primary key,
  declaration_id  uuid not null,
  employee_id     text,
  date            date,
  action          text not null check (action in ('update', 'delete')),
  changed_at      timestamptz not null default now(),
  changed_by      uuid,
  changed_fields  text[] not null default '{}',
  valeurs_avant   jsonb,
  valeurs_apres   jsonb
);

create index if not exists time_declaration_history_declaration_idx
  on time_declaration_history (declaration_id, changed_at desc);

create index if not exists time_declaration_history_employee_idx
  on time_declaration_history (employee_id, date);

create table if not exists resolved_planning_alerts (
  alert_id     text primary key,
  resolved_at  timestamptz not null default now(),
  resolved_by  uuid references auth.users(id) on delete set null
);

-- ============================================================
-- FONCTIONS AUTH / ADMIN
-- ============================================================

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function check_employee_email(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from employees
    where lower(email) = lower(p_email)
      and coalesce(is_active, true) = true
  );
$$;

grant execute on function check_employee_email(text) to anon, authenticated;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id text;
  premier_compte boolean;
begin
  -- Base vierge : le tout premier compte créé est l'administrateur.
  -- Ensuite, plus aucun compte ne peut obtenir ce rôle automatiquement.
  select not exists (select 1 from profiles) into premier_compte;

  select id into emp_id
  from employees
  where lower(email) = lower(new.email)
    and coalesce(is_active, true) = true
  limit 1;

  -- Aucune fiche employé correspondante : on refuse la création du compte.
  if emp_id is null and not premier_compte then
    raise exception
      'Cet email ne correspond à aucun employé actif. Demandez à votre responsable de vous enregistrer.';
  end if;

  insert into profiles (id, role, employee_id)
  values (
    new.id,
    case when premier_compte then 'admin' else 'employee' end,
    emp_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- RLS
-- ============================================================

alter table profiles enable row level security;
alter table employees enable row level security;
alter table shifts enable row level security;
alter table schedule_entries enable row level security;
alter table app_settings enable row level security;
alter table availability_requests enable row level security;
alter table availability_validations enable row level security;
alter table availability_unlock_requests enable row level security;
alter table time_declarations enable row level security;
alter table time_declaration_history enable row level security;
alter table resolved_planning_alerts enable row level security;

-- Profiles
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select to authenticated
  using (auth.uid() = id or is_admin());

-- Pas de politique d'insertion : le profil est créé par le déclencheur
-- handle_new_user, qui s'exécute avec les droits du propriétaire et n'est
-- donc pas soumis à ces règles.
drop policy if exists profiles_insert on profiles;

drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

-- Employees
drop policy if exists employees_admin_all on employees;
create policy employees_admin_all on employees for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists employees_self_select on employees;
create policy employees_self_select on employees for select to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.employee_id = employees.id
    )
  );

-- Shifts
drop policy if exists shifts_auth_select on shifts;
create policy shifts_auth_select on shifts for select to authenticated
  using (true);

drop policy if exists shifts_admin_all on shifts;
create policy shifts_admin_all on shifts for all to authenticated
  using (is_admin()) with check (is_admin());

-- Schedule entries
drop policy if exists schedule_admin_all on schedule_entries;
create policy schedule_admin_all on schedule_entries for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists schedule_employee_published on schedule_entries;
create policy schedule_employee_published on schedule_entries for select to authenticated
  using (
    visible_to_employee = true
    and employee_id = (
      select employee_id from profiles where id = auth.uid()
    )
  );

-- App settings
drop policy if exists settings_auth_select on app_settings;
create policy settings_auth_select on app_settings for select to authenticated
  using (true);

drop policy if exists settings_admin_all on app_settings;
create policy settings_admin_all on app_settings for all to authenticated
  using (is_admin()) with check (is_admin());

-- Availability requests
drop policy if exists avail_req_self on availability_requests;
create policy avail_req_self on availability_requests for all to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
  )
  with check (
    employee_id = (select employee_id from profiles where id = auth.uid())
  );

drop policy if exists avail_req_admin on availability_requests;
create policy avail_req_admin on availability_requests for all to authenticated
  using (is_admin()) with check (is_admin());

-- Availability validations
drop policy if exists avail_val_self on availability_validations;
create policy avail_val_self on availability_validations for all to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
  )
  with check (
    employee_id = (select employee_id from profiles where id = auth.uid())
  );

drop policy if exists avail_val_admin on availability_validations;
create policy avail_val_admin on availability_validations for all to authenticated
  using (is_admin()) with check (is_admin());

-- Unlock requests
drop policy if exists avail_unlock_self on availability_unlock_requests;
create policy avail_unlock_self on availability_unlock_requests for all to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
  )
  with check (
    employee_id = (select employee_id from profiles where id = auth.uid())
  );

drop policy if exists avail_unlock_admin on availability_unlock_requests;
create policy avail_unlock_admin on availability_unlock_requests for all to authenticated
  using (is_admin()) with check (is_admin());

-- Time declarations / pointages
-- L'employé consulte ses pointages, ouvre sa journée et la clôture.
-- Dès que la journée part en validation, il ne peut plus la modifier,
-- et il ne peut jamais supprimer un pointage.
drop policy if exists punches_self on time_declarations;

drop policy if exists punches_self_select on time_declarations;
create policy punches_self_select on time_declarations for select to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and deleted_at is null
  );

drop policy if exists punches_self_insert on time_declarations;
create policy punches_self_insert on time_declarations for insert to authenticated
  with check (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and status = 'in_progress'
  );

drop policy if exists punches_self_update on time_declarations;
create policy punches_self_update on time_declarations for update to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and status = 'in_progress'
    and deleted_at is null
  )
  with check (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and status in ('in_progress', 'pending', 'auto_closed')
    and deleted_at is null
  );

drop policy if exists punches_admin on time_declarations;
create policy punches_admin on time_declarations for all to authenticated
  using (is_admin()) with check (is_admin());

-- Journal des corrections de pointage : rempli par le déclencheur
-- ci-dessous, consultable par la direction uniquement.
create or replace function log_time_declaration_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  avant jsonb;
  apres jsonb;
  champs text[];
begin
  if tg_op = 'DELETE' then
    insert into time_declaration_history (
      declaration_id, employee_id, date, action, changed_by,
      changed_fields, valeurs_avant, valeurs_apres
    )
    values (
      old.id, old.employee_id, old.date, 'delete', auth.uid(),
      '{}', to_jsonb(old), null
    );
    return old;
  end if;

  avant := to_jsonb(old);
  apres := to_jsonb(new);

  select coalesce(array_agg(n.key order by n.key), '{}')
  into champs
  from jsonb_each(apres) as n(key, value)
  where n.value is distinct from (avant -> n.key);

  if array_length(champs, 1) is null then
    return new;
  end if;

  insert into time_declaration_history (
    declaration_id, employee_id, date, action, changed_by,
    changed_fields, valeurs_avant, valeurs_apres
  )
  values (
    new.id, new.employee_id, new.date, 'update', auth.uid(),
    champs, avant, apres
  );

  return new;
end;
$$;

drop trigger if exists trg_log_time_declaration_change on time_declarations;
create trigger trg_log_time_declaration_change
  after update or delete on time_declarations
  for each row execute function log_time_declaration_change();

drop policy if exists time_declaration_history_admin_select on time_declaration_history;
create policy time_declaration_history_admin_select on time_declaration_history
  for select to authenticated
  using (is_admin());

-- Resolved alerts (admin only)
drop policy if exists resolved_planning_alerts_admin_all on resolved_planning_alerts;
create policy resolved_planning_alerts_admin_all on resolved_planning_alerts
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

insert into app_settings (company_name, timezone, max_weekly_hours)
select 'Leonard Bretzel', 'Europe/Zurich', 50
where not exists (select 1 from app_settings);
