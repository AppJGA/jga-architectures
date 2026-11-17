-- Migration 077 : état des lieux d'un bâtiment existant — lot 1 (préparer)
--
-- Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md.
-- Un état des lieux par affaire ; ses étages (image du plan, cadrage
-- mètres ↔ pixels, textes du plan) et ses pièces (contour en mètres, dans le
-- repère du plan d'origine). Fichiers dans le stockage privé `edl`, rangés
-- par affaire : images des étages et plan source compressé (gzip), gardé
-- pour l'export du lot 4.
--
-- Agence seule ; écriture réservée aux collaborateurs de l'affaire (règle
-- de la migration 060). Rejouable.

create table if not exists edl_etats (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null unique references affaires(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

create table if not exists edl_niveaux (
  id                uuid primary key default gen_random_uuid(),
  etat_id           uuid not null references edl_etats(id) on delete cascade,
  affaire_id        uuid not null references affaires(id) on delete cascade,
  nom               text not null,
  ordre             integer not null default 0,
  format            text not null check (format in ('dxf', 'pdf')),
  source_nom        text,
  source_page       integer,
  chemin_source     text,
  chemin            text not null,
  chemin_apercu     text not null,
  largeur           integer not null,
  hauteur           integer not null,
  -- { x0, y0, x1, y1 (mètres), pxParMetre, largeur, hauteur }
  cadrage           jsonb not null,
  unites_par_metre  numeric,
  echelle           integer,
  -- [{ texte, pos: [x, y] (mètres) }] : relus pour proposer les pièces plus tard
  textes            jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

create table if not exists edl_pieces (
  id           uuid primary key default gen_random_uuid(),
  niveau_id    uuid not null references edl_niveaux(id) on delete cascade,
  affaire_id   uuid not null references affaires(id) on delete cascade,
  nom          text not null default '',
  numero       text,
  -- [[x, y], …] en mètres, repère du plan d'origine
  contour      jsonb not null,
  surface_lue  numeric,
  hsp_lue      numeric,
  origine      text not null check (origine in ('dxf', 'ia', 'main')),
  a_verifier   boolean not null default false,
  ordre        integer not null default 0,
  -- fiche de la pièce (sol, murs, plafond…) : remplie à partir du lot 3
  fiche        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Depuis le 30 octobre 2026, Supabase n'ouvre plus d'office une nouvelle
-- table à l'API : sans ces droits, « permission denied ». Pas d'anon.
grant select, insert, update, delete on public.edl_etats   to authenticated;
grant select, insert, update, delete on public.edl_etats   to service_role;
grant select, insert, update, delete on public.edl_niveaux to authenticated;
grant select, insert, update, delete on public.edl_niveaux to service_role;
grant select, insert, update, delete on public.edl_pieces  to authenticated;
grant select, insert, update, delete on public.edl_pieces  to service_role;

create index if not exists edl_niveaux_etat on edl_niveaux(etat_id, ordre);
create index if not exists edl_pieces_niveau on edl_pieces(niveau_id, ordre);
create index if not exists edl_pieces_affaire on edl_pieces(affaire_id);

create or replace function edl_pieces_touche() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists edl_pieces_touche on edl_pieces;
create trigger edl_pieces_touche before update on edl_pieces
  for each row execute function edl_pieces_touche();

do $$
declare t text;
begin
  foreach t in array array['edl_etats', 'edl_niveaux', 'edl_pieces'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Agence" on %I', t);
    execute format('create policy "Agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
    execute format('drop policy if exists "Collaborateurs : ajout" on %I', t);
    execute format('drop policy if exists "Collaborateurs : modification" on %I', t);
    execute format('drop policy if exists "Collaborateurs : suppression" on %I', t);
    execute format('create policy "Collaborateurs : ajout" on %I as restrictive for insert to authenticated with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
    execute format('create policy "Collaborateurs : modification" on %I as restrictive for update to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id)) with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
    execute format('create policy "Collaborateurs : suppression" on %I as restrictive for delete to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
  end loop;
end $$;

-- ─── Stockage privé `edl` ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('edl', 'edl', false, 52428800,
        array['image/webp', 'image/jpeg', 'application/gzip', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Agence edl" on storage.objects;
create policy "Agence edl" on storage.objects
  for all to authenticated
  using (bucket_id = 'edl' and public.est_agence())
  with check (bucket_id = 'edl' and public.est_agence());

-- Règles restrictives de la migration 060, rejouées avec `edl` dans la liste
-- des espaces rangés par affaire
do $$
declare
  condition text := 'bucket_id not in (''cr-photos'', ''cr-plans'', ''cr-archives'', ''audio-temporaire'', ''edl'')'
    || ' or not public.est_agence() or public.peut_modifier_affaire(public.affaire_du_chemin(name))';
begin
  execute 'drop policy if exists "Collaborateurs : dépôt" on storage.objects';
  execute 'drop policy if exists "Collaborateurs : modification" on storage.objects';
  execute 'drop policy if exists "Collaborateurs : suppression" on storage.objects';
  execute format('create policy "Collaborateurs : dépôt" on storage.objects as restrictive for insert to authenticated with check (%s)', condition);
  execute format('create policy "Collaborateurs : modification" on storage.objects as restrictive for update to authenticated using (%s) with check (%s)', condition, condition);
  execute format('create policy "Collaborateurs : suppression" on storage.objects as restrictive for delete to authenticated using (%s)', condition);
end $$;

-- ─── Fichiers inutilisés : fonction de la 075 + le stockage `edl` ────────────
create or replace function fichiers_orphelins()
returns table (bucket text, chemin text, taille bigint)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.created_at < now() - interval '1 hour'
    and (
      (o.bucket_id = 'cr-photos'
        and not exists (select 1 from public.cr_photos p where p.chemin = o.name or p.chemin_miniature = o.name)
        and not exists (select 1 from public.opr_photos p where p.chemin = o.name or p.chemin_miniature = o.name))
      or
      (o.bucket_id = 'cr-plans' and not exists (
        select 1 from public.affaire_plan_versions v where v.chemin = o.name or v.chemin_apercu = o.name))
      or
      (o.bucket_id = 'cr-archives'
        and not exists (select 1 from public.cr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_pv v where v.chemin = o.name))
      or
      (o.bucket_id = 'affaires-photos' and not exists (
        select 1 from public.affaires a
        where split_part(split_part(a.photo_url, '/affaires-photos/', 2), '?', 1) = o.name))
      or
      (o.bucket_id = 'edl' and not exists (
        select 1 from public.edl_niveaux n
        where n.chemin = o.name or n.chemin_apercu = o.name or n.chemin_source = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
