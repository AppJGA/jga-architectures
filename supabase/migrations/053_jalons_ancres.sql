-- Migration 053 : un jalon peut s'accrocher au début ou à la fin d'une barre
--
-- Chantier : à une tâche (`planning`) ou à un de ses segments ; étude : à une
-- phase ou à un de ses segments. La date du jalon reste stockée (exports, page
-- de l'affaire et import la lisent telle quelle) : l'application la recale sur
-- son ancre chaque fois que la barre bouge.
--
-- Barre supprimée → l'ancre retombe à null et le jalon reste à sa date : il
-- n'est jamais supprimé avec elle.
--
-- `ancre_bord` sert aussi au dessin : « fin » place le jalon au bord droit de
-- son jour (ou de sa semaine). Il est gardé au détachement, pour que le jalon
-- ne saute pas d'un jour à l'écran.
--
-- Rejouable : colonnes et contraintes ne sont créées qu'une fois.

alter table planning_jalons
  add column if not exists ancre_tache_id bigint references planning(id) on delete set null,
  add column if not exists ancre_segment_id uuid references planning_segments(id) on delete set null,
  add column if not exists ancre_bord text;

alter table planning_jalons drop constraint if exists planning_jalons_ancre_bord_check;
alter table planning_jalons add constraint planning_jalons_ancre_bord_check
  check (ancre_bord is null or ancre_bord in ('debut', 'fin'));

alter table planning_etude_jalons
  add column if not exists ancre_phase_id bigint references planning_etude_phases(id) on delete set null,
  add column if not exists ancre_segment_id uuid references planning_etude_segments(id) on delete set null,
  add column if not exists ancre_bord text;

alter table planning_etude_jalons drop constraint if exists planning_etude_jalons_ancre_bord_check;
alter table planning_etude_jalons add constraint planning_etude_jalons_ancre_bord_check
  check (ancre_bord is null or ancre_bord in ('debut', 'fin'));

notify pgrst, 'reload schema';
