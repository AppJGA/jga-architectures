-- Migration 057 : visite enregistrée — transcriptions (lot 1)
--
-- Le robot du mode Visite enregistre la réunion par morceaux ; chaque morceau
-- est transcrit par Mistral (fonction serveur api/transcrire.js). Seul le
-- TEXTE est gardé ici, jamais l'audio : il reste sur l'appareil le temps de
-- la transcription, puis s'efface.
--
-- `id` est décidé sur l'appareil : la ligne naît au premier morceau
-- transcrit, éventuellement longtemps après le début (visite sans réseau).
--
-- Agence seule : un intervenant extérieur ne voit ni le robot ni ses
-- transcriptions (règles de la migration 050).
--
-- Stockage `audio-temporaire` : un enregistrement du Dictaphone importé y
-- séjourne le temps de sa transcription, puis la fonction l'efface.
--
-- Rejouable.

create table if not exists cr_enregistrements (
  id          uuid primary key,
  cr_id       uuid not null references comptes_rendus(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  created_by  uuid default auth.uid(),
  debut       timestamptz not null default now(),
  origine     text not null default 'micro' check (origine in ('micro', 'fichier')),
  format      text,
  duree_s     numeric not null default 0,
  -- [{ rang, duree_s, texte, transcrit_le }]
  segments    jsonb not null default '[]'::jsonb,
  statut      text not null default 'transcription'
              check (statut in ('enregistrement', 'transcription', 'pret', 'erreur')),
  erreur      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cr_enregistrements_cr on cr_enregistrements(cr_id);

alter table cr_enregistrements enable row level security;

drop policy if exists "Agence" on cr_enregistrements;
create policy "Agence" on cr_enregistrements
  for all to authenticated
  using (public.est_agence())
  with check (public.est_agence());

create or replace function cr_enregistrements_maj() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists cr_enregistrements_maj on cr_enregistrements;
create trigger cr_enregistrements_maj
  before update on cr_enregistrements
  for each row execute function cr_enregistrements_maj();

-- Fichier importé : 50 Mo au plus (limite de l'offre gratuite de Supabase),
-- formats audio seulement. Chemin `<affaire_id>/<fichier>`, comme ailleurs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio-temporaire', 'audio-temporaire', false, 52428800,
        array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp3',
              'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Écriture agence audio-temporaire" on storage.objects;
create policy "Écriture agence audio-temporaire" on storage.objects
  for all to authenticated
  using (bucket_id = 'audio-temporaire' and public.est_agence())
  with check (bucket_id = 'audio-temporaire' and public.est_agence());

notify pgrst, 'reload schema';
