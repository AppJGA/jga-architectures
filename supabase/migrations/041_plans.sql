-- Migration 041 : plans de l'affaire et pastilles des remarques
--
-- 1. Plans : communs à toute l'affaire (`affaire_plans`), chacun avec ses
--    versions successives (indice A, B, C…). Le fichier est une image
--    convertie sur l'appareil (6 000 px au plus, ~1,5 Mo) et son aperçu
--    (~2 000 px) ; le PDF d'origine n'est pas gardé.
-- 2. Pastilles : une par remarque (`cr_pastilles`), position relative sur le
--    plan (x, y entre 0 et 1), et version du plan affichée. Comme les photos,
--    la pastille est recopiée à chaque reprise de visite.
-- 3. Une nouvelle version d'un plan est reportée sur les pastilles des
--    brouillons ; les comptes rendus émis gardent la version de leur émission,
--    et un plan ou une version qu'ils affichent ne peut pas être supprimé.
-- 4. Stockage privé `cr-plans`, et recherche des fichiers inutilisés étendue
--    aux plans.

create table if not exists affaire_plans (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  nom         text not null,
  ordre       integer not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists affaire_plan_versions (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references affaire_plans(id) on delete cascade,
  indice         text not null,
  chemin         text not null,
  chemin_apercu  text not null,
  largeur        integer not null,
  hauteur        integer not null,
  poids_octets   integer not null default 0,
  source_nom     text,
  source_page    integer,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create table if not exists cr_pastilles (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  cr_id       uuid not null references comptes_rendus(id) on delete cascade,
  remarque_id uuid not null unique references cr_remarques(id) on delete cascade,
  plan_id     uuid not null references affaire_plans(id) on delete cascade,
  version_id  uuid not null references affaire_plan_versions(id) on delete cascade,
  x           double precision not null check (x >= 0 and x <= 1),
  y           double precision not null check (y >= 0 and y <= 1),
  created_at  timestamptz not null default now()
);

create index if not exists affaire_plans_affaire_idx on affaire_plans (affaire_id);
create index if not exists affaire_plan_versions_plan_idx on affaire_plan_versions (plan_id);
create index if not exists cr_pastilles_cr_idx on cr_pastilles (cr_id);
create index if not exists cr_pastilles_plan_idx on cr_pastilles (plan_id);
create index if not exists cr_pastilles_version_idx on cr_pastilles (version_id);

do $$ declare t text;
begin
  foreach t in array array['affaire_plans', 'affaire_plan_versions', 'cr_pastilles'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Authenticated" on %I', t);
    execute format('create policy "Authenticated" on %I for all using (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- Verrou des comptes rendus émis (fonction de la migration 037)
drop trigger if exists cr_pastilles_verrou_emis on cr_pastilles;
create trigger cr_pastilles_verrou_emis
  before insert or update or delete on cr_pastilles
  for each row execute function cr_verifier_brouillon();

-- ── Plans utilisés par un compte rendu émis : pas de suppression ─────────────
-- Seule la suppression demandée directement est refusée ; celle de l'affaire
-- entière passe (cascade, pg_trigger_depth() > 1).
create or replace function plan_verifier_suppression() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if exists (
    select 1 from cr_pastilles p
    join comptes_rendus c on c.id = p.cr_id
    where c.statut = 'emis'
      and (case when tg_table_name = 'affaire_plans' then p.plan_id else p.version_id end) = old.id
  ) then
    raise exception 'Ce plan figure dans un compte rendu émis : il ne peut pas être supprimé.'
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists affaire_plans_protection on affaire_plans;
create trigger affaire_plans_protection
  before delete on affaire_plans
  for each row execute function plan_verifier_suppression();

drop trigger if exists affaire_plan_versions_protection on affaire_plan_versions;
create trigger affaire_plan_versions_protection
  before delete on affaire_plan_versions
  for each row execute function plan_verifier_suppression();

-- ── Nouvelle version : reportée sur les brouillons ───────────────────────────
create or replace function plan_reporter_version() returns trigger
language plpgsql as $$
begin
  update cr_pastilles p set version_id = new.id
  from comptes_rendus c
  where c.id = p.cr_id and c.statut <> 'emis' and p.plan_id = new.plan_id;
  return new;
end $$;

drop trigger if exists affaire_plan_versions_report on affaire_plan_versions;
create trigger affaire_plan_versions_report
  after insert on affaire_plan_versions
  for each row execute function plan_reporter_version();

-- ── Stockage privé ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cr-plans', 'cr-plans', false, 12582912, array['image/webp', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Auth read cr-plans"   on storage.objects;
drop policy if exists "Auth upload cr-plans" on storage.objects;
drop policy if exists "Auth delete cr-plans" on storage.objects;

create policy "Auth read cr-plans" on storage.objects for select
  using (bucket_id = 'cr-plans' and auth.role() = 'authenticated');
create policy "Auth upload cr-plans" on storage.objects for insert
  with check (bucket_id = 'cr-plans' and auth.role() = 'authenticated');
create policy "Auth delete cr-plans" on storage.objects for delete
  using (bucket_id = 'cr-plans' and auth.role() = 'authenticated');

-- ── Fichiers inutilisés : photos et plans ────────────────────────────────────
-- Remplace, pour l'application, cr_photos_orphelines (migration 040). Les
-- fichiers de moins d'une heure sont ignorés : envoi en cours.
create or replace function fichiers_orphelins()
returns table (bucket text, chemin text, taille bigint)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.created_at < now() - interval '1 hour'
    and (
      (o.bucket_id = 'cr-photos' and not exists (
        select 1 from public.cr_photos p where p.chemin = o.name or p.chemin_miniature = o.name))
      or
      (o.bucket_id = 'cr-plans' and not exists (
        select 1 from public.affaire_plan_versions v where v.chemin = o.name or v.chemin_apercu = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
