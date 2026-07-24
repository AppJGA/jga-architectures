-- Migration 028 : Nom propre optionnel sur les segments
--
-- null = utiliser le nom de la tâche parente (comportement actuel)
-- renseigné = nom propre du segment, utile notamment en groupement "Par zone"
-- où un segment peut être affiché sur une ligne dupliquée sous un autre nom
-- que la tâche (ex : « Dallage — Zone 1 »).

alter table planning_segments
  add column if not exists nom text;

notify pgrst, 'reload schema';
