-- Migration 045 : OPR et suivi des réserves
--
-- 1. Visites (`opr_visites`) : OPR ou visite de levée, numérotées par affaire,
--    lots concernés, brouillon puis émise (verrouillée comme un compte rendu).
-- 2. Réserves (`opr_reserves`) : une ligne par réserve, qui vit d'une visite à
--    l'autre jusqu'à sa levée. Numéro par affaire.
-- 3. Constats (`opr_constats`) : l'historique. Chaque changement de statut est
--    un constat, rattaché à la visite où il est fait ; le statut de la réserve
--    est toujours celui de son dernier constat (tenu par la base).
-- 4. Photos, pastilles sur plan, présences et archives PDF des visites.
--
-- Accès futur des intervenants extérieurs : chaque ligne porte `affaire_id` et
-- `created_by` ; les fichiers sont rangés sous l'identifiant de l'affaire.

create table if not exists opr_visites (
  id            uuid primary key default gen_random_uuid(),
  affaire_id    uuid not null references affaires(id) on delete cascade,
  numero        integer not null,
  type          text not null check (type in ('opr', 'levee')),
  date_visite   date not null,
  lot_ids       uuid[] not null default '{}',
  statut        text not null default 'brouillon' check (statut in ('brouillon', 'emis')),
  date_emission timestamptz,
  observations  text,
  redacteur_id  uuid references profiles(id) on delete set null,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (affaire_id, numero)
);

create table if not exists opr_reserves (
  id                uuid primary key default gen_random_uuid(),
  affaire_id        uuid not null references affaires(id) on delete cascade,
  numero            integer,
  visite_origine_id uuid not null references opr_visites(id) on delete cascade,
  lot_id            uuid references lots(id) on delete set null,
  copie_lot         text,
  localisation      text,
  description       text not null check (length(trim(description)) > 0),
  statut            text not null default 'ouverte' check (statut in ('ouverte', 'levee', 'contestee', 'abandonnee')),
  date_statut       timestamptz not null default now(),
  date_limite       date,
  est_important     boolean not null default false,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (affaire_id, numero)
);

create table if not exists opr_constats (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  reserve_id  uuid not null references opr_reserves(id) on delete cascade,
  visite_id   uuid references opr_visites(id) on delete cascade,
  statut      text not null check (statut in ('ouverte', 'levee', 'contestee', 'abandonnee')),
  commentaire text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
-- Un constat par réserve et par visite : le refaire le remplace
create unique index if not exists opr_constats_visite_unique on opr_constats (reserve_id, visite_id) where visite_id is not null;

create table if not exists opr_photos (
  id               uuid primary key default gen_random_uuid(),
  affaire_id       uuid not null references affaires(id) on delete cascade,
  reserve_id       uuid not null references opr_reserves(id) on delete cascade,
  visite_id        uuid references opr_visites(id) on delete cascade,
  chemin           text not null,
  chemin_miniature text not null,
  largeur          integer,
  hauteur          integer,
  poids_octets     integer not null default 0,
  legende          text,
  ordre            integer not null default 0,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);

create table if not exists opr_pastilles (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  reserve_id  uuid not null unique references opr_reserves(id) on delete cascade,
  plan_id     uuid not null references affaire_plans(id) on delete cascade,
  version_id  uuid not null references affaire_plan_versions(id) on delete cascade,
  x           double precision not null check (x >= 0 and x <= 1),
  y           double precision not null check (y >= 0 and y <= 1),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists opr_presences (
  id                    uuid primary key default gen_random_uuid(),
  affaire_id            uuid not null references affaires(id) on delete cascade,
  visite_id             uuid not null references opr_visites(id) on delete cascade,
  interlocuteur_id      uuid references affaire_interlocuteurs(id) on delete set null,
  lot_entreprise_id     uuid references lot_entreprises(id) on delete set null,
  presence              text not null default 'na' check (presence in ('p', 'r', 'a', 'e', 'na')),
  convoque              boolean not null default false,
  copie_type            text check (copie_type in ('interlocuteur', 'entreprise')),
  copie_categorie       text,
  copie_categorie_label text,
  copie_prenom          text,
  copie_nom             text,
  copie_fonction        text,
  copie_organisation    text,
  copie_adresse         text,
  copie_email           text,
  copie_telephone       text,
  copie_ordre           integer,
  copie_lot_numero      integer,
  copie_lot_nom         text,
  copie_entreprise      text,
  created_at            timestamptz not null default now()
);

create table if not exists opr_archives (
  id            uuid primary key default gen_random_uuid(),
  affaire_id    uuid not null references affaires(id) on delete cascade,
  visite_id     uuid not null references opr_visites(id) on delete cascade,
  chemin        text not null,
  taille_octets integer not null default 0,
  reglages      jsonb,
  destinataire  text,
  version_pour  text,
  emis_le       timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create table if not exists opr_diffusions (
  id           uuid primary key default gen_random_uuid(),
  affaire_id   uuid not null references affaires(id) on delete cascade,
  visite_id    uuid not null references opr_visites(id) on delete cascade,
  archive_id   uuid references opr_archives(id) on delete set null,
  mode         text not null check (mode in ('tous', 'entreprise')),
  destinataire text,
  libelle      text,
  adresses     text[] not null default '{}',
  objet        text,
  prepare_le   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);

create index if not exists opr_visites_affaire_idx on opr_visites (affaire_id, numero);
create index if not exists opr_reserves_affaire_idx on opr_reserves (affaire_id, lot_id);
create index if not exists opr_constats_reserve_idx on opr_constats (reserve_id, created_at);
create index if not exists opr_photos_reserve_idx on opr_photos (reserve_id);
create index if not exists opr_photos_chemin_idx on opr_photos (chemin);
create index if not exists opr_presences_visite_idx on opr_presences (visite_id);
create index if not exists opr_archives_visite_idx on opr_archives (visite_id, emis_le desc);

do $$ declare t text;
begin
  foreach t in array array['opr_visites', 'opr_reserves', 'opr_constats', 'opr_photos', 'opr_pastilles', 'opr_presences', 'opr_archives', 'opr_diffusions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Authenticated" on %I', t);
    execute format('create policy "Authenticated" on %I for all using (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- ── Numéros ───────────────────────────────────────────────────────────────────
create or replace function opr_reserve_numero() returns trigger
language plpgsql as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext('opr_reserves_numero:' || new.affaire_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from opr_reserves where affaire_id = new.affaire_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists opr_reserves_numero on opr_reserves;
create trigger opr_reserves_numero before insert or update on opr_reserves
  for each row execute function opr_reserve_numero();

-- ── Statut d'une réserve = son dernier constat ───────────────────────────────
create or replace function opr_reserve_constat_initial() returns trigger
language plpgsql as $$
begin
  insert into opr_constats (affaire_id, reserve_id, visite_id, statut, created_by)
  values (new.affaire_id, new.id, new.visite_origine_id, new.statut, new.created_by);
  return new;
end $$;

drop trigger if exists opr_reserves_constat_initial on opr_reserves;
create trigger opr_reserves_constat_initial after insert on opr_reserves
  for each row execute function opr_reserve_constat_initial();

create or replace function opr_recalculer_statut() returns trigger
language plpgsql as $$
declare
  v_reserve uuid := coalesce(new.reserve_id, old.reserve_id);
  v_dernier record;
begin
  select statut, created_at into v_dernier from opr_constats
  where reserve_id = v_reserve order by created_at desc, id desc limit 1;
  if found then
    update opr_reserves set statut = v_dernier.statut, date_statut = v_dernier.created_at
    where id = v_reserve and (statut is distinct from v_dernier.statut or date_statut is distinct from v_dernier.created_at);
  end if;
  return null;
end $$;

drop trigger if exists opr_constats_statut on opr_constats;
create trigger opr_constats_statut after insert or update or delete on opr_constats
  for each row execute function opr_recalculer_statut();

-- ── Verrou des visites émises ────────────────────────────────────────────────
-- Constats, photos et présences rattachés à une visite émise sont figés ; les
-- écritures en cascade (suppression de l'affaire, fiche supprimée) passent.
create or replace function opr_verifier_brouillon() returns trigger
language plpgsql as $$
declare v_visite uuid;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then v_visite := old.visite_id; else v_visite := new.visite_id; end if;
  if v_visite is not null and exists (select 1 from opr_visites where id = v_visite and statut = 'emis') then
    raise exception 'Cette visite est émise : rouvrez-la pour la modifier.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$ declare t text;
begin
  foreach t in array array['opr_constats', 'opr_photos', 'opr_presences'] loop
    execute format('drop trigger if exists %I on %I', t || '_verrou_emis', t);
    execute format('create trigger %I before insert or update or delete on %I for each row execute function opr_verifier_brouillon()', t || '_verrou_emis', t);
  end loop;
end $$;

-- Une réserve constatée lors d'une visite émise garde son texte ; son statut
-- évolue ensuite par les constats des visites suivantes (mise à jour faite par
-- la base, donc en cascade).
create or replace function opr_verrou_reserve() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if exists (select 1 from opr_visites where id = old.visite_origine_id and statut = 'emis') then
    raise exception 'Cette réserve a été constatée lors d’une visite émise : elle ne peut plus être modifiée ni supprimée.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists opr_reserves_verrou_emis on opr_reserves;
create trigger opr_reserves_verrou_emis before update or delete on opr_reserves
  for each row execute function opr_verrou_reserve();

create or replace function opr_verrou_visite() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'emis' and pg_trigger_depth() = 1 then
      raise exception 'Cette visite est émise : rouvrez-la pour la supprimer.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.statut = 'emis' and new.statut = 'emis' then
    raise exception 'Cette visite est émise : rouvrez-la pour la modifier.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists opr_visites_verrou_emis on opr_visites;
create trigger opr_visites_verrou_emis before update or delete on opr_visites
  for each row execute function opr_verrou_visite();

-- ── Fichiers inutilisés : photos (CR et OPR), plans, archives (CR et OPR) ────
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
        and not exists (select 1 from public.opr_archives a where a.chemin = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
