-- Migration 026 : Ordre des tâches au sein d'un lot (pour le drag & drop de réorganisation)
--
-- La colonne `ordre` existe déjà sur `planning` (migration 008) mais n'a jamais été
-- alimentée : toutes les lignes valent 0 par défaut. On l'initialise ici à partir
-- du numéro de tâche existant, pour donner un ordre stable à réorganiser ensuite.

alter table planning
  add column if not exists ordre integer default 0;

update planning
set ordre = sub.rn - 1
from (
  select id, row_number() over (
    partition by lot_id
    order by num_tache
  ) as rn
  from planning
) sub
where planning.id = sub.id;

notify pgrst, 'reload schema';
