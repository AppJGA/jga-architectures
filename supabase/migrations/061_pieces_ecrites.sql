-- Migration 061 : pièces écrites — CCTP découpés en articles
--
-- Le PDF d'un CCTP est lu dans le navigateur ; seul son texte, découpé en
-- articles, est gardé ici (le PDF ne l'est pas : rien sur le stockage de
-- 1 Go). Un seul CCTP par lot : le nouveau remplace l'ancien.
--
-- Agence seule, comme les autres pièces de l'affaire ; écriture réservée aux
-- collaborateurs de l'affaire (règle de la migration 060).
--
-- Rejouable.

create table if not exists pieces_ecrites (
  id            uuid primary key default gen_random_uuid(),
  affaire_id    uuid not null references affaires(id) on delete cascade,
  type          text not null default 'cctp' check (type in ('cctp')),
  lot_id        uuid references lots(id) on delete set null,
  titre         text not null,
  lot_numero_lu integer,
  lot_nom_lu    text,
  indice        text,
  nom_fichier   text,
  nb_pages      integer not null default 0,
  nb_articles   integer not null default 0,
  importe_le    timestamptz not null default now(),
  importe_par   uuid default auth.uid()
);

create index if not exists pieces_ecrites_affaire on pieces_ecrites(affaire_id);

create table if not exists pieces_articles (
  id          uuid primary key default gen_random_uuid(),
  piece_id    uuid not null references pieces_ecrites(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  ordre       integer not null,
  numero      text,
  niveau      integer not null default 1,
  titre       text not null,
  texte       text not null default '',
  page        integer
);

create index if not exists pieces_articles_affaire on pieces_articles(affaire_id);
create index if not exists pieces_articles_piece on pieces_articles(piece_id, ordre);

do $$
declare t text;
begin
  foreach t in array array['pieces_ecrites', 'pieces_articles'] loop
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
  end loop;
end $$;

notify pgrst, 'reload schema';
