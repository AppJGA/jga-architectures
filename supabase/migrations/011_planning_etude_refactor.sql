-- Migration 011 : Refactoring planning d'étude
-- Renommage table, suppression colonnes obsolètes, ajout colonnes MOE/MOA

alter table planning_etude_taches rename to planning_etude_phases;

alter table planning_etude_phases
  drop column if exists avancement,
  drop column if exists num_tache,
  drop column if exists intervenants;

alter table planning_etude_phases
  add column if not exists importance text not null default 'moe'
    check (importance in ('moe', 'moa')),
  add column if not exists duree_arch  integer,
  add column if not exists duree_bet   integer,
  add column if not exists duree_econ  integer;

-- Recréer le trigger (la référence de table a changé de nom)
drop trigger if exists planning_etude_updated_at on planning_etude_phases;
create trigger planning_etude_updated_at
  before update on planning_etude_phases
  for each row execute function update_updated_at();
