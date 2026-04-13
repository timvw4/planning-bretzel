-- Heures réelles validées (copiées depuis time_declarations lors de l'approbation admin)
-- pour afficher dans le planning à la place des heures du modèle de shift.

alter table schedule_entries
  add column if not exists validated_start text,
  add column if not exists validated_end text;

comment on column schedule_entries.validated_start is
  'Heure de début réelle validée (sync après approbation des heures déclarées).';
comment on column schedule_entries.validated_end is
  'Heure de fin réelle validée (sync après approbation des heures déclarées).';
