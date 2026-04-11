-- Migration : feuilles d'heures travaillées
-- À exécuter dans Supabase Studio → SQL Editor

create table if not exists time_declarations (
  id               uuid primary key default gen_random_uuid(),
  employee_id      text references employees(id) on delete cascade,
  date             date not null,
  -- Heures planifiées (pré-remplies depuis le shift, peuvent être nulles si pas de shift)
  planned_start    text,
  planned_end      text,
  -- Heures réelles saisies par l'employé
  actual_start     text not null,
  actual_end       text not null,
  -- Note libre de l'employé
  note             text,
  -- Statut de validation : 'pending' | 'approved' | 'rejected'
  status           text not null default 'pending',
  -- Commentaire de l'admin (optionnel, utilisé pour expliquer un refus)
  admin_note       text,
  declared_at      timestamptz default now(),
  reviewed_at      timestamptz,
  -- Un employé ne peut déclarer qu'une seule fois par jour
  unique (employee_id, date)
);
