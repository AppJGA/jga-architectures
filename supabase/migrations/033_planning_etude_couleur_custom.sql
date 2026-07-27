-- Migration 033 : Couleur personnalisée par phase du planning d'étude
--
-- null      = couleur par défaut du type (MOE / MOA / administratif / chantier)
-- '#RRGGBB' = couleur choisie par l'utilisateur, qui prime sur celle du type

alter table planning_etude_phases
  add column if not exists couleur_custom text;

notify pgrst, 'reload schema';
