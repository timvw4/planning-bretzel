-- Options déclaration : pause 15 min, collation, nourriture du travail
-- À exécuter dans Supabase Studio → SQL Editor

alter table time_declarations
  add column if not exists pause_15min boolean not null default true;

alter table time_declarations
  add column if not exists had_snack boolean not null default false;

alter table time_declarations
  add column if not exists ate_work_food boolean not null default false;

comment on column time_declarations.pause_15min is
  'L’employé confirme avoir pris une pause d’au moins 15 minutes dans la journée.';
comment on column time_declarations.had_snack is
  'Collation prise.';
comment on column time_declarations.ate_work_food is
  'A mangé la nourriture du travail.';
