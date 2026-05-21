-- Périmètre travail (app_settings) + colonnes GPS sur les déclarations d'heures.
-- RLS : assurez-vous que les employés authentifiés peuvent faire SELECT sur app_settings
-- (ligne unique) pour lire work_site_* — sinon la contrôle GPS côté « Mes heures » ne peut pas fonctionner.

-- Site : centre + rayon (mètres), tout nullable = périmètre désactivé
alter table public.app_settings
  add column if not exists work_site_latitude double precision;

alter table public.app_settings
  add column if not exists work_site_longitude double precision;

alter table public.app_settings
  add column if not exists work_site_radius_m double precision;

comment on column public.app_settings.work_site_latitude is 'Latitude du centre du périmètre travail (déclarations « Mes heures »).';
comment on column public.app_settings.work_site_longitude is 'Longitude du centre du périmètre travail.';
comment on column public.app_settings.work_site_radius_m is 'Rayon du périmètre en mètres (cercle).';

-- Position au moment de la déclaration (employé)
alter table public.time_declarations
  add column if not exists declared_lat double precision;

alter table public.time_declarations
  add column if not exists declared_lng double precision;

alter table public.time_declarations
  add column if not exists declared_accuracy_m double precision;

alter table public.time_declarations
  add column if not exists declared_inside_geofence boolean;

comment on column public.time_declarations.declared_lat is 'Latitude GPS au moment du clic « Déclarer » (si fournie).';
comment on column public.time_declarations.declared_lng is 'Longitude GPS au moment du clic « Déclarer ».';
comment on column public.time_declarations.declared_accuracy_m is 'Incertitude GPS en mètres (navigator).';
comment on column public.time_declarations.declared_inside_geofence is 'null = pas de périmètre configuré ou pas de position ; true/false sinon.';
