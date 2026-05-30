-- Remplace l'ancien statut « preferred » par « vacation » dans les disponibilités employé.
UPDATE availability_requests
SET status = 'vacation'
WHERE status = 'preferred';
