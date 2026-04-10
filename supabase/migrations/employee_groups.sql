-- Migration : tables des groupes d'employés
-- À exécuter dans Supabase Studio → SQL Editor

create table if not exists employee_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists employee_group_members (
  group_id uuid references employee_groups(id) on delete cascade,
  employee_id text references employees(id) on delete cascade,
  primary key (group_id, employee_id)
);
