-- Migration 043 : archive du PDF de chaque émission d'un compte rendu
--
-- À l'émission, l'application fabrique le PDF et l'enregistre dans le
-- stockage privé `cr-archives`. Une ligne par émission : un CR rouvert puis
-- réémis garde la trace de chaque version envoyée. Les archives ne sont pas
-- soumises au verrou des CR émis — elles sont justement écrites à ce moment-là.

create table if not exists cr_archives (
  id            uuid primary key default gen_random_uuid(),
  affaire_id    uuid not null references affaires(id) on delete cascade,
  cr_id         uuid not null references comptes_rendus(id) on delete cascade,
  chemin        text not null,
  taille_octets integer not null default 0,
  reglages      jsonb,
  emis_le       timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create index if not exists cr_archives_cr_idx on cr_archives (cr_id, emis_le desc);

alter table cr_archives enable row level security;
drop policy if exists "Authenticated" on cr_archives;
create policy "Authenticated" on cr_archives for all using (auth.role() = 'authenticated');

-- ── Stockage privé ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cr-archives', 'cr-archives', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Auth read cr-archives"   on storage.objects;
drop policy if exists "Auth upload cr-archives" on storage.objects;
drop policy if exists "Auth delete cr-archives" on storage.objects;

create policy "Auth read cr-archives" on storage.objects for select
  using (bucket_id = 'cr-archives' and auth.role() = 'authenticated');
create policy "Auth upload cr-archives" on storage.objects for insert
  with check (bucket_id = 'cr-archives' and auth.role() = 'authenticated');
create policy "Auth delete cr-archives" on storage.objects for delete
  using (bucket_id = 'cr-archives' and auth.role() = 'authenticated');

-- ── Fichiers inutilisés : photos, plans et archives ──────────────────────────
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
      or
      (o.bucket_id = 'cr-archives' and not exists (
        select 1 from public.cr_archives a where a.chemin = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
