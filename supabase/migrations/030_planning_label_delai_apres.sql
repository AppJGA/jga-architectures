-- Migration 030 : Motif du délai après une tâche
--
-- Le motif du délai AVANT existe déjà sous le nom `appro_materiau` (colonne
-- historique du délai d'approvisionnement) et reste utilisé tel quel : seul le
-- délai après avait besoin de son propre libellé.

alter table planning
  add column if not exists label_apres text;

notify pgrst, 'reload schema';
