-- ============================================================
-- ÉTAPE 2 — PAUSES, HISTORIQUE DES POINTAGES, ARCHIVAGE
-- ============================================================
-- À coller dans : Supabase → SQL Editor → New query → Run
-- À exécuter APRÈS 01_securite_comptes_et_pointages.sql
--
-- Ce que ce script ajoute :
--   1. La durée de pause en minutes sur chaque pointage (au lieu d'une
--      simple case « pause de 15 min »).
--   2. La pause retenue sur la journée validée du planning.
--   3. Un réglage « déduire les pauses des heures payées ».
--   4. Un journal automatique de toutes les modifications de pointage.
--   5. L'archivage des pointages supprimés, au lieu de leur destruction.
-- ============================================================


-- ============================================================
-- 1. DURÉE DE PAUSE EN MINUTES
-- ============================================================
-- La case « pause 15 min » ne permettait pas de distinguer une pause de
-- 15 minutes d'une pause de 30 ou 60 minutes, alors que la loi suisse
-- (art. 15 LTr) impose 15 min au-delà de 5 h 30, 30 min au-delà de 7 h
-- et 60 min au-delà de 9 h de travail.
-- L'ancienne case reste renseignée par l'application (pause >= 15 min),
-- pour que les écrans et exports existants continuent de fonctionner.

-- La reprise de l'historique (case cochée = 15 minutes) ne doit se faire
-- qu'une seule fois, sinon relancer le script écraserait les corrections
-- saisies depuis. D'où le test d'existence de la colonne.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_declarations'
      and column_name = 'pause_minutes'
  ) then
    alter table time_declarations
      add column pause_minutes integer not null default 0;

    update time_declarations
    set pause_minutes = case when pause_15min then 15 else 0 end;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'time_declarations_pause_minutes_check'
  ) then
    alter table time_declarations
      add constraint time_declarations_pause_minutes_check
      check (pause_minutes >= 0 and pause_minutes <= 480);
  end if;
end
$$;

-- Pause retenue sur la journée validée : c'est cette valeur qui sert au
-- calcul des heures dans les plannings et les exports.
alter table schedule_entries
  add column if not exists validated_break_minutes integer;


-- ============================================================
-- 2. RÉGLAGE — DÉDUIRE LES PAUSES DES HEURES PAYÉES
-- ============================================================
-- Volontairement désactivé au départ : activer ce réglage change les
-- heures payées de tout le monde, la décision doit être consciente.

alter table app_settings
  add column if not exists deduct_breaks boolean not null default false;


-- ============================================================
-- 3. JOURNAL DES MODIFICATIONS DE POINTAGE
-- ============================================================
-- Un pointage est une pièce justificative : toute correction doit rester
-- traçable (qui, quand, quoi). Le journal est rempli automatiquement par
-- la base, l'application n'a rien à faire.

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

  -- Liste des colonnes réellement modifiées.
  select coalesce(array_agg(n.key order by n.key), '{}')
  into champs
  from jsonb_each(apres) as n(key, value)
  where n.value is distinct from (avant -> n.key);

  -- Rien de changé (ou seulement une écriture identique) : on n'archive pas.
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

alter table time_declaration_history enable row level security;

-- Journal consultable par la direction, et par personne d'autre.
-- Aucune politique d'écriture : seul le déclencheur ci-dessus écrit.
drop policy if exists time_declaration_history_admin_select on time_declaration_history;
create policy time_declaration_history_admin_select on time_declaration_history
  for select to authenticated
  using (is_admin());


-- ============================================================
-- 4. ARCHIVAGE AU LIEU DE SUPPRESSION
-- ============================================================
-- Supprimer un pointage effaçait définitivement une pièce justificative.
-- Désormais l'application renseigne `deleted_at` : la ligne disparaît des
-- écrans mais reste consultable en base.

alter table time_declarations
  add column if not exists deleted_at timestamptz;

alter table time_declarations
  add column if not exists deleted_by uuid;

-- La contrainte « un seul pointage par employé et par jour » doit ignorer
-- les lignes archivées, sinon impossible de ressaisir une journée annulée.
alter table time_declarations
  drop constraint if exists time_declarations_employee_id_date_key;

create unique index if not exists time_declarations_active_day_idx
  on time_declarations (employee_id, date)
  where deleted_at is null;

-- L'employé n'a jamais accès aux lignes archivées.
drop policy if exists punches_self_select on time_declarations;
create policy punches_self_select on time_declarations for select to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and deleted_at is null
  );

-- Archiver, c'est modifier : l'employé ne doit pas pouvoir le faire.
-- On réécrit sa règle de modification pour exiger, avant comme après,
-- une ligne non archivée.
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
