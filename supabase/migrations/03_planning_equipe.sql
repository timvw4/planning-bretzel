-- ============================================================
-- PLANNING DE L'ÉQUIPE VISIBLE PAR LES EMPLOYÉS
-- ============================================================
-- À coller dans : Supabase → SQL Editor → New query → Run
-- À exécuter APRÈS 02_pauses_historique_archivage.sql
--
-- Objectif : permettre à un employé de voir qui travaille quand,
-- SANS lui ouvrir l'accès aux tables `employees` et `schedule_entries`.
--
-- Pourquoi une vue plutôt qu'une nouvelle règle de sécurité :
-- les règles de sécurité de Postgres filtrent des LIGNES, pas des
-- COLONNES. Autoriser un employé à lire la fiche de ses collègues, même
-- en lecture seule, lui donnerait aussi leur téléphone, leur email,
-- leurs heures de contrat et les notes privées de la direction.
-- La vue ci-dessous n'expose que six informations inoffensives.
-- ============================================================


-- ============================================================
-- 1. LA VUE
-- ============================================================
-- Uniquement les journées de TRAVAIL déjà publiées ("envoyées" depuis
-- l'admin) d'employés actifs. Les absences des collègues (vacances,
-- indisponibilités, repos) n'y figurent pas : elles ne concernent
-- personne d'autre que la direction et l'intéressé.
--
-- Les horaires exposés sont ceux du SHIFT PRÉVU, jamais les heures
-- réellement pointées : les heures travaillées d'un collègue touchent
-- à sa paie, ça ne se partage pas.

drop view if exists team_planning;

create view team_planning as
select
  se.date                              as date,
  se.employee_id                       as employee_id,
  e.first_name                         as first_name,
  -- Initiale seule : sert à distinguer deux collègues qui portent le
  -- même prénom, sans divulguer les noms de famille.
  left(coalesce(e.last_name, ''), 1)   as last_name_initial,
  e.color                              as employee_color,
  s.short_name                         as shift_short_name,
  s.start_time                         as start_time,
  s.end_time                           as end_time
from schedule_entries se
join employees e on e.id = se.employee_id
join shifts s on s.id = se.shift_id
where se.visible_to_employee = true
  and coalesce(e.is_active, true) = true
  and s.type = 'work';


-- ============================================================
-- 2. QUI PEUT LIRE CETTE VUE
-- ============================================================
-- Une vue interrogée par un utilisateur connecté s'exécute avec les
-- droits de son propriétaire : elle traverse donc les verrous des
-- tables sous-jacentes. C'est exactement ce qu'on veut ici, mais il
-- faut alors verrouiller l'accès à la vue elle-même.
--
-- `anon` = visiteur NON connecté. Sans ce retrait, le planning de
-- l'équipe serait lisible publiquement, sans mot de passe.

revoke all on team_planning from anon;
revoke all on team_planning from public;
grant select on team_planning to authenticated;


-- ============================================================
-- 3. INDEX DE CONFORT
-- ============================================================
-- La vue est presque toujours interrogée sur une semaine précise.

create index if not exists schedule_entries_date_visible_idx
  on schedule_entries (date)
  where visible_to_employee = true;
