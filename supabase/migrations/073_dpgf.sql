-- Migration 073 : pièces écrites — DPGF
--
-- Les DPGF vierges du DCE (Excel ou PDF) sont lus dans le navigateur ; seules
-- leurs lignes (numéro, désignation, unité, quantité — jamais les prix) sont
-- gardées ici. Une pièce `dpgf` par lot, à côté du CCTP : un nouvel import
-- remplace l'ancien DPGF du lot, jamais son CCTP. Le lien aux articles du
-- CCTP (même lot, même numéro) se calcule à l'affichage.
--
-- Mêmes droits que la migration 061 : agence seule, écriture réservée aux
-- collaborateurs de l'affaire (règle de la migration 060).
--
-- Rejouable.

alter table pieces_ecrites drop constraint if exists pieces_ecrites_type_check;
alter table pieces_ecrites add constraint pieces_ecrites_type_check check (type in ('cctp', 'dpgf'));

create table if not exists pieces_dpgf_lignes (
  id              uuid primary key default gen_random_uuid(),
  piece_id        uuid not null references pieces_ecrites(id) on delete cascade,
  affaire_id      uuid not null references affaires(id) on delete cascade,
  ordre           integer not null,
  numero          text,
  article         text,
  niveau          integer,
  designation     text not null default '',
  unite           text,
  quantite        numeric,
  quantite_texte  text,
  titre           boolean not null default false,
  page            integer
);

create index if not exists pieces_dpgf_lignes_affaire on pieces_dpgf_lignes(affaire_id);
create index if not exists pieces_dpgf_lignes_piece on pieces_dpgf_lignes(piece_id, ordre);

do $$
declare t text := 'pieces_dpgf_lignes';
begin
  execute format('alter table %I enable row level security', t);
  execute format('drop policy if exists "Agence" on %I', t);
  execute format('create policy "Agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
  -- Règles restrictives d'écriture : mêmes que la migration 060
  execute format('drop policy if exists "Collaborateurs : ajout" on %I', t);
  execute format('drop policy if exists "Collaborateurs : modification" on %I', t);
  execute format('drop policy if exists "Collaborateurs : suppression" on %I', t);
  execute format('create policy "Collaborateurs : ajout" on %I as restrictive for insert to authenticated with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
  execute format('create policy "Collaborateurs : modification" on %I as restrictive for update to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id)) with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
  execute format('create policy "Collaborateurs : suppression" on %I as restrictive for delete to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
end $$;

notify pgrst, 'reload schema';
