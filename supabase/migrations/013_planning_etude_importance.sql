-- Migration 013 : Étendre les valeurs autorisées pour importance
-- Le champ est désormais dérivé de type_tache :
--   etude         → moe
--   validation    → moa
--   administratif → admin
--   chantier      → chantier

alter table planning_etude_phases
  drop constraint if exists planning_etude_phases_importance_check;

alter table planning_etude_phases
  add constraint planning_etude_phases_importance_check
  check (importance in ('moe', 'moa', 'admin', 'chantier'));
