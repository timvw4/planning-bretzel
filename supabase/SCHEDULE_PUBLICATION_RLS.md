# Visibilité employé sur `schedule_entries` (RLS)

Sans policy adaptée, un employé peut encore lire des lignes en brouillon si la règle SELECT est trop large.

## Objectif

- **Admin** : lire et modifier toutes les lignes (y compris `visible_to_employee = false`).
- **Employé** : lire **uniquement** ses lignes avec `visible_to_employee = true`.

## Exemple de policy SELECT pour le rôle employé

À ajuster selon vos noms de rôles (`authenticated`) et votre lien `profiles.employee_id` :

```sql
-- Exemple : policy pour les employés (à fusionner avec votre modèle existant)
create policy schedule_entries_employee_read_published
  on schedule_entries
  for select
  to authenticated
  using (
    visible_to_employee = true
    and employee_id = (
      select employee_id from profiles where id = auth.uid()
    )
  );
```

Si vous aviez déjà une policy `select` sur `schedule_entries` pour les employés, **remplacez-la** ou ajoutez la condition `visible_to_employee = true` dans le `using (...)`.

Les comptes **admin** peuvent garder une policy séparée (ex. appartenance à un rôle `admin` ou lecture sur toute la table).

## Vérification

1. Créer un shift en admin sans « Envoyer » : la requête employé ne doit pas le retourner.
2. Cliquer « Envoyer le mois » ou « Envoyer la semaine » : la même entrée doit apparaître côté employé.
