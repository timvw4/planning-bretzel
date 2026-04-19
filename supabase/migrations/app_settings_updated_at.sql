-- Migration : colonne updated_at sur app_settings
-- À exécuter dans Supabase → SQL Editor (ou via CLI supabase db push)

alter table public.app_settings
  add column if not exists updated_at timestamptz default now();

comment on column public.app_settings.updated_at is 'Dernière modification des paramètres applicatifs';

-- Les lignes déjà présentes reçoivent une valeur (PostgreSQL remplit au besoin lors de l’ADD COLUMN avec DEFAULT)
