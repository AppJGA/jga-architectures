-- Migration 024 : Affichage du nom sur les segments du planning chantier

alter table planning_segments
  add column if not exists afficher_nom boolean default false;

notify pgrst, 'reload schema';
