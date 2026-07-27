-- Migration 031 : Périodes bloquantes ou informatives
--
-- true  = la période bloque les tâches (comportement historique : les tâches et
--         la propagation des chemins critiques la sautent)
-- false = période purement informative — affichée sur le planning, mais les
--         tâches peuvent s'y dérouler

alter table periodes_bloquees
  add column if not exists est_bloquante boolean default true;

notify pgrst, 'reload schema';
