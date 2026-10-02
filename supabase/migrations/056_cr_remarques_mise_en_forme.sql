-- Migration 056 : mise en forme d'une remarque (gras, italique, surligné)
--
-- À la demande de l'agence, toute la remarque peut être mise en gras, en
-- italique et/ou surlignée, à l'écran comme dans le PDF. Ces trois cases
-- remplacent « Important » (`est_important`), qui mettait la remarque en gras
-- orange : une remarque encore marquée « Important » s'affiche en gras.
-- Aucune ligne n'est réécrite — un compte rendu émis est verrouillé
-- (migration 037), et l'application lit les deux.
--
-- Rejouable.

alter table cr_remarques
  add column if not exists gras boolean not null default false,
  add column if not exists italique boolean not null default false,
  add column if not exists surligne boolean not null default false;

notify pgrst, 'reload schema';
