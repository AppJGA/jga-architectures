-- Migration 039 : photos des remarques de chantier
--
-- Les photos sont compressées sur l'appareil avant l'envoi (1 920 px, WebP ou
-- JPEG, ~300 Ko) et accompagnées d'une miniature (~25 Ko). Les fichiers vivent
-- dans le stockage privé `cr-photos` ; la table `cr_photos` les rattache à une
-- remarque d'un compte rendu.
--
-- Une photo suit sa remarque d'une visite à l'autre : la reprise recopie la
-- ligne, pas le fichier. Plusieurs lignes peuvent donc désigner le même
-- `chemin` ; l'application n'efface le fichier que lorsque plus aucune ligne ne
-- le désigne (le stockage ne se purge que par son API, pas en SQL).

create table if not exists cr_photos (
  id               uuid primary key default gen_random_uuid(),
  affaire_id       uuid not null references affaires(id) on delete cascade,
  cr_id            uuid not null references comptes_rendus(id) on delete cascade,
  remarque_id      uuid not null references cr_remarques(id) on delete cascade,
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

create index if not exists cr_photos_remarque_idx on cr_photos (remarque_id);
create index if not exists cr_photos_cr_idx on cr_photos (cr_id);
create index if not exists cr_photos_chemin_idx on cr_photos (chemin);

alter table cr_photos enable row level security;
drop policy if exists "Authenticated" on cr_photos;
create policy "Authenticated" on cr_photos for all using (auth.role() = 'authenticated');

-- Verrou des comptes rendus émis (fonction de la migration 037)
drop trigger if exists cr_photos_verrou_emis on cr_photos;
create trigger cr_photos_verrou_emis
  before insert or update or delete on cr_photos
  for each row execute function cr_verifier_brouillon();

-- ── Stockage privé ────────────────────────────────────────────────────────────
-- Privé : une photo de chantier ne s'ouvre qu'avec un lien signé, délivré aux
-- personnes connectées. Taille plafonnée : un fichier non compressé est refusé.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cr-photos', 'cr-photos', false, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Auth read cr-photos"   on storage.objects;
drop policy if exists "Auth upload cr-photos" on storage.objects;
drop policy if exists "Auth delete cr-photos" on storage.objects;

create policy "Auth read cr-photos" on storage.objects for select
  using (bucket_id = 'cr-photos' and auth.role() = 'authenticated');
create policy "Auth upload cr-photos" on storage.objects for insert
  with check (bucket_id = 'cr-photos' and auth.role() = 'authenticated');
create policy "Auth delete cr-photos" on storage.objects for delete
  using (bucket_id = 'cr-photos' and auth.role() = 'authenticated');

-- ── Espace utilisé ────────────────────────────────────────────────────────────
-- Tout le stockage du projet (photos de chantier et de couverture) : c'est ce
-- total que plafonne l'offre gratuite de Supabase (1 Go).
create or replace function espace_stockage_utilise() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)::bigint from storage.objects
$$;
revoke all on function espace_stockage_utilise() from public, anon;
grant execute on function espace_stockage_utilise() to authenticated;

notify pgrst, 'reload schema';
