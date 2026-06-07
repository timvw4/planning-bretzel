-- Quota vacances annuel pour les salariés à contrat fixe (jours habituels / année civile).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS annual_vacation_days integer NOT NULL DEFAULT 25;

COMMENT ON COLUMN employees.annual_vacation_days IS
  'Quota vacances annuel (jours ouvrables habituels) — appliqué aux salariés fixed.';
