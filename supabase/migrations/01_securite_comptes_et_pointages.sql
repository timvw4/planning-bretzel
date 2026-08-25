-- ============================================================
-- ÉTAPE 1 — SÉCURITÉ DES COMPTES ET DES POINTAGES
-- ============================================================
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Ce script est sans danger pour les comptes existants : il ne
-- modifie aucune ligne de la table profiles.
--
-- Ce qu'il corrige :
--   1. Un email inconnu ne devient plus administrateur à l'inscription.
--   2. Un employé ne peut plus modifier ni supprimer un pointage validé.
--   3. La table profiles n'accepte plus d'insertion depuis l'application.
--   4. Deux employés ne peuvent plus partager la même adresse email.
-- ============================================================


-- ============================================================
-- 1. INSCRIPTION — plus jamais d'administrateur automatique
-- ============================================================
-- Avant : email absent de la table employees  ->  rôle « admin ».
-- Après : seuls les emails d'employés actifs peuvent créer un compte,
--         et le rôle attribué est toujours « employee ».
--
-- Pour créer un nouvel administrateur, voir la note en fin de fichier.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id text;
  premier_compte boolean;
begin
  -- Base entièrement vierge : le tout premier compte devient administrateur
  -- (sinon personne ne pourrait démarrer). Votre base contient déjà des
  -- comptes, ce cas ne peut donc plus se produire ici.
  select not exists (select 1 from profiles) into premier_compte;

  select id into emp_id
  from employees
  where lower(email) = lower(new.email)
    and coalesce(is_active, true) = true
  limit 1;

  -- Aucune fiche employé correspondante : on refuse la création du compte.
  if emp_id is null and not premier_compte then
    raise exception
      'Cet email ne correspond à aucun employé actif. Demandez à votre responsable de vous enregistrer.';
  end if;

  insert into profiles (id, role, employee_id)
  values (
    new.id,
    case when premier_compte then 'admin' else 'employee' end,
    emp_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ============================================================
-- 2. PROFILS — plus d'insertion libre depuis l'application
-- ============================================================
-- La création du profil est faite par le déclencheur ci-dessus, qui
-- s'exécute avec les droits du propriétaire et n'est donc pas concerné
-- par cette règle. Aucune page de l'application n'écrit dans profiles.

drop policy if exists profiles_insert on profiles;


-- ============================================================
-- 3. POINTAGES — l'employé ne touche plus une journée validée
-- ============================================================
-- Avant : une seule règle « FOR ALL » donnait à l'employé tous les
--         droits sur ses lignes, y compris après validation.
-- Après : il peut consulter ses pointages, ouvrir sa journée, et la
--         clôturer. Il ne peut plus rien modifier dès que la journée
--         est passée en attente de validation, ni supprimer.

drop policy if exists punches_self on time_declarations;

-- Lecture : ses propres pointages, tous statuts confondus.
drop policy if exists punches_self_select on time_declarations;
create policy punches_self_select on time_declarations for select to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
  );

-- Création : uniquement l'ouverture d'une journée (« en service »).
drop policy if exists punches_self_insert on time_declarations;
create policy punches_self_insert on time_declarations for insert to authenticated
  with check (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and status = 'in_progress'
  );

-- Modification : uniquement une journée encore en cours.
-- Statuts d'arrivée autorisés : fin de service (pending) ou clôture
-- automatique après 12 h (auto_closed).
drop policy if exists punches_self_update on time_declarations;
create policy punches_self_update on time_declarations for update to authenticated
  using (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and status = 'in_progress'
  )
  with check (
    employee_id = (select employee_id from profiles where id = auth.uid())
    and status in ('in_progress', 'pending', 'auto_closed')
  );

-- Aucune règle de suppression pour l'employé : seule la direction
-- (politique punches_admin, inchangée) peut supprimer un pointage.

-- Liste fermée des statuts possibles, pour éviter toute valeur inattendue.
-- Si d'anciennes lignes portent un statut hors liste, on préfère prévenir
-- plutôt que d'interrompre le script : les règles ci-dessus restent posées.
do $$
declare
  statuts_inconnus text;
begin
  if exists (
    select 1 from pg_constraint where conname = 'time_declarations_status_check'
  ) then
    return;
  end if;

  select string_agg(distinct status, ', ')
  into statuts_inconnus
  from time_declarations
  where status not in ('in_progress', 'pending', 'approved', 'rejected', 'auto_closed');

  if statuts_inconnus is not null then
    raise warning
      'Statuts de pointage inattendus en base (%) : la contrainte n''a pas été ajoutée.', statuts_inconnus;
  else
    alter table time_declarations
      add constraint time_declarations_status_check
      check (status in ('in_progress', 'pending', 'approved', 'rejected', 'auto_closed'));
  end if;
end
$$;


-- ============================================================
-- 4. EMPLOYÉS — une adresse email ne peut servir qu'une fois
-- ============================================================
-- La liaison compte ↔ employé se fait par l'email : deux fiches avec le
-- même email rendraient cette liaison imprévisible.
-- L'index ignore les fiches sans email (email vide autorisé en plusieurs
-- exemplaires) et ne tient pas compte des majuscules.

do $$
declare
  doublons text;
begin
  select string_agg(t.email_normalise, ', ')
  into doublons
  from (
    select lower(email) as email_normalise
    from employees
    where coalesce(email, '') <> ''
    group by lower(email)
    having count(*) > 1
  ) t;

  if doublons is not null then
    -- Simple avertissement : le reste du script reste appliqué.
    raise warning
      'Emails en double dans la table employees (%) : l''index d''unicité n''a pas été créé. Corrigez ces fiches puis relancez ce script.', doublons;
  else
    create unique index if not exists employees_email_unique_idx
      on employees (lower(email))
      where coalesce(email, '') <> '';
  end if;
end
$$;


-- ============================================================
-- NOTE — comment créer un nouvel administrateur
-- ============================================================
-- L'inscription depuis l'application crée désormais toujours un compte
-- employé. Pour donner les droits d'administration à quelqu'un :
--
--   1. L'enregistrer comme employé dans l'application (avec son email).
--   2. Lui demander de créer son compte sur la page d'inscription.
--   3. Exécuter ici, en remplaçant l'adresse :
--
-- update profiles
-- set role = 'admin'
-- where id = (select id from auth.users where lower(email) = lower('adresse@exemple.ch'));
--
-- Pour retirer les droits d'administration, remplacer 'admin' par 'employee'.
--
-- Conséquence à connaître : la création d'un utilisateur depuis le tableau
-- de bord Supabase (Authentication → Add user) est soumise à la même règle.
-- L'email doit donc exister dans la table employees, sinon la création est
-- refusée avec le message ci-dessus.
-- ============================================================
