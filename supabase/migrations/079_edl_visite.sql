-- Migration 079 : état des lieux — lot 2 (visiter)
--
-- Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md, § 5.
-- Une visite (séance sur place, reprise possible tant qu'elle n'est pas
-- terminée), ses points posés sur le plan (en mètres, repère du plan
-- d'origine, comme les contours des pièces), son journal horodaté et les
-- photos des points (stockage privé `edl`, `<affaire>/edl/photos/…`).
--
-- Tout s'écrit depuis la tablette, souvent sans réseau : les identifiants
-- sont décidés sur l'appareil (aucun défaut), un envoi rejoué écrit la même
-- ligne. Agence seule ; écriture réservée aux collaborateurs (règle 060).
-- Rejouable.

create table if not exists edl_visites (
  id          uuid primary key,
  etat_id     uuid not null references edl_etats(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  debut       timestamptz not null,
  fin         timestamptz,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists edl_points (
  id          uuid primary key,
  visite_id   uuid not null references edl_visites(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  niveau_id   uuid not null references edl_niveaux(id) on delete cascade,
  -- Pièce corrigée ou supprimée au bureau : le point reste, rattaché à l'étage
  piece_id    uuid references edl_pieces(id) on delete set null,
  numero      integer not null,
  x           numeric not null,
  y           numeric not null,
  calque      text,
  type        text,
  -- heure de l'appareil : le lot 3 la rapproche de la parole
  pose_le     timestamptz not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists edl_evenements (
  id          uuid primary key,
  visite_id   uuid not null references edl_visites(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  type        text not null check (type in (
    'debut', 'fin', 'entree', 'sortie', 'point', 'point-modifie', 'point-supprime',
    'photo', 'pause', 'reprise', 'coupure')),
  niveau_id   uuid references edl_niveaux(id) on delete set null,
  piece_id    uuid references edl_pieces(id) on delete set null,
  -- Sans clé étrangère : le journal garde la trace d'un point supprimé
  point_id    uuid,
  le          timestamptz not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists edl_photos (
  id                uuid primary key,
  point_id          uuid not null references edl_points(id) on delete cascade,
  visite_id         uuid not null references edl_visites(id) on delete cascade,
  affaire_id        uuid not null references affaires(id) on delete cascade,
  chemin            text not null,
  chemin_miniature  text not null,
  largeur           integer,
  hauteur           integer,
  poids_octets      bigint,
  prise_le          timestamptz not null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

-- Depuis le 30 octobre 2026, Supabase n'ouvre plus d'office une nouvelle
-- table à l'API : sans ces droits, « permission denied ». Pas d'anon.
grant select, insert, update, delete on public.edl_visites    to authenticated;
grant select, insert, update, delete on public.edl_visites    to service_role;
grant select, insert, update, delete on public.edl_points     to authenticated;
grant select, insert, update, delete on public.edl_points     to service_role;
grant select, insert, update, delete on public.edl_evenements to authenticated;
grant select, insert, update, delete on public.edl_evenements to service_role;
grant select, insert, update, delete on public.edl_photos     to authenticated;
grant select, insert, update, delete on public.edl_photos     to service_role;

create index if not exists edl_visites_etat on edl_visites(etat_id, debut);
create index if not exists edl_points_affaire on edl_points(affaire_id, numero);
create index if not exists edl_points_niveau on edl_points(niveau_id);
create index if not exists edl_evenements_visite on edl_evenements(visite_id, le);
create index if not exists edl_evenements_affaire_type on edl_evenements(affaire_id, type);
create index if not exists edl_photos_point on edl_photos(point_id);
create index if not exists edl_photos_affaire on edl_photos(affaire_id);

create or replace function edl_points_touche() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists edl_points_touche on edl_points;
create trigger edl_points_touche before update on edl_points
  for each row execute function edl_points_touche();

do $$
declare t text;
begin
  foreach t in array array['edl_visites', 'edl_points', 'edl_evenements', 'edl_photos'] loop
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

-- ─── Plus de « Remplacer les plans » après une visite ────────────────────────
-- Les points sont posés sur les étages et les pièces : les remplacer les
-- effacerait. La suppression de l'affaire (cascade, profondeur > 1) passe.
create or replace function edl_etats_garde_visites() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.edl_visites v where v.etat_id = old.id) then
    raise exception 'Une visite a déjà eu lieu : les plans de cet état des lieux ne se remplacent plus.'
      using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists edl_etats_garde_visites on edl_etats;
create trigger edl_etats_garde_visites before delete on edl_etats
  for each row execute function edl_etats_garde_visites();

-- ─── Fichiers inutilisés : fonction de la 077 + les photos des points ────────
-- Un point supprimé emporte ses lignes de photos (cascade) mais pas ses
-- fichiers, pour qu'« Annuler » le rende intact : ils sont rattrapés ici.
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
      (o.bucket_id = 'edl'
        and not exists (
          select 1 from public.edl_niveaux n
          where n.chemin = o.name or n.chemin_apercu = o.name or n.chemin_source = o.name)
        and not exists (
          select 1 from public.edl_photos p
          where p.chemin = o.name or p.chemin_miniature = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
