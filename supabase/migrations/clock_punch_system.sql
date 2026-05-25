-- Migration : système de pointage clock in / clock out
-- Remplace le modèle « déclaration manuelle » par des horodatages entrée/sortie.

-- Rendre les heures finales nullable (remplies à l'approbation admin)
alter table time_declarations
  alter column actual_start drop not null,
  alter column actual_end drop not null;

-- Horodatages pointage
alter table time_declarations
  add column if not exists clock_in_at timestamptz,
  add column if not exists clock_out_at timestamptz,
  add column if not exists auto_closed boolean not null default false;

-- GPS entrée
alter table time_declarations
  add column if not exists clock_in_lat double precision,
  add column if not exists clock_in_lng double precision,
  add column if not exists clock_in_accuracy_m double precision,
  add column if not exists clock_in_inside_geofence boolean;

-- GPS sortie
alter table time_declarations
  add column if not exists clock_out_lat double precision,
  add column if not exists clock_out_lng double precision,
  add column if not exists clock_out_accuracy_m double precision,
  add column if not exists clock_out_inside_geofence boolean;

-- Choix admin à l'approbation : 'planned' | 'actual'
alter table time_declarations
  add column if not exists approved_start_mode text,
  add column if not exists approved_end_mode text;

-- Données existantes : reconstruire les horodatages depuis actual_start/end si présents
update time_declarations
set
  clock_in_at = coalesce(
    clock_in_at,
    case when actual_start is not null then (date::text || 'T' || actual_start || ':00')::timestamptz end
  ),
  clock_out_at = coalesce(
    clock_out_at,
    case when actual_end is not null then (date::text || 'T' || actual_end || ':00')::timestamptz end
  )
where actual_start is not null or actual_end is not null;

comment on column time_declarations.status is
  'in_progress | pending | approved | rejected | auto_closed';
