-- Migration 078 : état des lieux — relecture du découpage
--
-- Ce que Claude a signalé en relisant le découpage d'un étage, et les
-- signalements que l'utilisateur a écartés (« C'est juste ») :
-- { le, signalements: [{ cle, pieceId, motif, source }], ecartes: [cle] }.
-- Les contrôles sans IA se recalculent à l'affichage, seuls leurs écarts
-- sont gardés ici. Sans cette colonne, la relecture marche mais n'est pas
-- gardée d'une ouverture à l'autre.
--
-- Rejouable. La table edl_niveaux a déjà ses droits et ses règles (077).

alter table edl_niveaux add column if not exists relecture jsonb;

notify pgrst, 'reload schema';
