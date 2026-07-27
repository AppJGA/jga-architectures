-- Migration 029 : Délai après la fin d'une tâche (séchage, livraison…)
--
-- Exprimé en jours ouvrés, comme le délai d'approvisionnement. Il repousse la
-- fin effective de la tâche pour le calcul des chemins critiques : les tâches
-- dépendantes démarrent après (fin + delai_apres + lag).

alter table planning
  add column if not exists delai_apres integer default 0;

notify pgrst, 'reload schema';
