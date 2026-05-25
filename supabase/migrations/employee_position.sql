-- Poste structuré : boulanger | vente | cuisine
-- Remplace l'usage libre du champ role pour les règles métier.

alter table employees
  add column if not exists position text;

update employees
set position = case
  when lower(coalesce(role, '')) ~ '(boul|pât|patiss|four|pain)' then 'boulanger'
  when lower(coalesce(role, '')) ~ '(cuis|plong)' then 'cuisine'
  else 'vente'
end
where position is null or position not in ('boulanger', 'vente', 'cuisine');

alter table employees
  alter column position set default 'vente';

alter table employees
  drop constraint if exists employees_position_check;

alter table employees
  add constraint employees_position_check
  check (position in ('boulanger', 'vente', 'cuisine'));

comment on column employees.position is 'Poste : boulanger (nuit/dim), vente ou cuisine (6h30–15h lun–sam).';
