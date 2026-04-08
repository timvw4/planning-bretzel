-- Publication planning employés — à exécuter dans le SQL Editor Supabase (ou via CLI migrations).
-- Les nouvelles lignes créées par l’app passent en brouillon (visible_to_employee = false) jusqu’au bouton « Envoyer ».

alter table schedule_entries
  add column if not exists visible_to_employee boolean not null default true;

comment on column schedule_entries.visible_to_employee is
  'Si false, le créneau est visible uniquement côté admin (brouillon). Les employés filtrent sur true.';

-- Les lignes déjà présentes restent visibles (default true). Les insertions futures depuis l’app envoient explicitement false pour les nouveaux créneaux.
