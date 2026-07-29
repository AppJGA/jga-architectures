-- Migration 036 : nommer librement les phases du suivi financier d'étude
--
-- Le code de phase (`phase`) reste la clé : il porte la contrainte d'unicité
-- (affaire_id, phase), relie les estimations de lots et correspond au
-- vocabulaire de `affaires.phase`. On ne le remplace donc pas — on ajoute un
-- nom libre à côté.
--
--   · nom_custom : affiché à la place du libellé d'origine quand il est saisi.
--   · ordre      : position dans la liste, pour insérer une phase ajoutée à la
--                  main où l'on veut parmi les cinq phases de référence.

alter table suivi_financier_etude
  add column if not exists nom_custom text,
  add column if not exists ordre integer;

-- Les contraintes CHECK figeaient le vocabulaire à cinq (resp. quatre) codes :
-- aucune phase supplémentaire ne pouvait être créée. On les lève pour autoriser
-- les codes personnalisés (`perso_1`, `perso_2`…). L'unicité (affaire_id, phase)
-- continue d'empêcher tout doublon, et les cinq phases historiques restent
-- servies par l'application.
alter table suivi_financier_etude
  drop constraint if exists suivi_financier_etude_phase_check;

alter table estimations_lots
  drop constraint if exists estimations_lots_phase_check;

notify pgrst, 'reload schema';
