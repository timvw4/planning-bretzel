-- Migration : types de contrat vers le modèle Suisse (fixed, hourly, intern, apprentice)
UPDATE employees SET contract_type = 'fixed' WHERE contract_type IN ('full-time', 'part-time');
UPDATE employees SET contract_type = 'hourly' WHERE contract_type = 'freelance';
