-- Suppression des groupes d'employés (fonctionnalité retirée de l'application)
-- À exécuter dans Supabase Studio → SQL Editor si les tables existent déjà.

drop table if exists public.employee_group_members;
drop table if exists public.employee_groups;
