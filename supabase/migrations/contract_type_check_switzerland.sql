-- Migration complète : types de contrat suisses
-- IMPORTANT : supprimer l’ancienne contrainte AVANT de mettre à jour les valeurs,
-- sinon PostgreSQL refuse d’écrire « fixed », « hourly », etc.

-- 1. Retirer l’ancienne contrainte (full-time, part-time, freelance…)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_contract_type_check;

-- 2. Convertir les anciennes valeurs
UPDATE employees SET contract_type = 'fixed' WHERE contract_type IN ('full-time', 'part-time');
UPDATE employees SET contract_type = 'hourly' WHERE contract_type = 'freelance';

-- 3. Toute valeur restante inconnue → fixed
UPDATE employees
SET contract_type = 'fixed'
WHERE contract_type IS NULL
   OR contract_type NOT IN ('fixed', 'hourly', 'intern', 'apprentice');

-- 4. Nouvelle contrainte suisse
ALTER TABLE employees ADD CONSTRAINT employees_contract_type_check
  CHECK (contract_type IN ('fixed', 'hourly', 'intern', 'apprentice'));
