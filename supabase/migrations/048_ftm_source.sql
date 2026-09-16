-- Migration 048 : origine d'une fiche de travaux modificatifs
--
-- Une FTM peut naître d'une remarque de compte rendu ou d'une réserve d'OPR.
-- Le lien se fait sur le suivi de la remarque (`cr_remarques.suivi_id`, stable
-- d'une visite à l'autre) ou sur la réserve, et le libellé est recopié pour
-- rester lisible même si la source est supprimée.

alter table ftm
  add column if not exists source_type       text check (source_type in ('remarque', 'reserve')),
  add column if not exists source_suivi_id   uuid,
  add column if not exists source_reserve_id uuid references opr_reserves(id) on delete set null,
  add column if not exists source_libelle    text;

create index if not exists ftm_source_suivi_idx on ftm (source_suivi_id);
create index if not exists ftm_source_reserve_idx on ftm (source_reserve_id);

notify pgrst, 'reload schema';
