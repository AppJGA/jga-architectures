-- Migration 059 : réglages de l'agence — guide de rédaction de l'IA (lot 3)
--
-- Les remarques proposées par l'IA (visite enregistrée, lot 2) suivent un
-- guide de rédaction. Le guide de départ est dans le code
-- (`styleAgenceLogique.js`) ; l'agence peut le réécrire dans l'app, et sa
-- version vit ici. Sans ligne enregistrée, c'est le guide de départ qui part.
--
-- Une ligne par réglage (`cle`), pour en accueillir d'autres sans nouvelle
-- table. Agence seule (règles de la migration 050).
--
-- Rejouable.

create table if not exists agence_reglages (
  cle          text primary key,
  valeur       text not null,
  modifie_le   timestamptz not null default now(),
  modifie_par  uuid default auth.uid()
);

alter table agence_reglages enable row level security;

drop policy if exists "Agence" on agence_reglages;
create policy "Agence" on agence_reglages
  for all to authenticated
  using (public.est_agence())
  with check (public.est_agence());

create or replace function agence_reglages_maj() returns trigger
language plpgsql as $$
begin
  new.modifie_le := now();
  new.modifie_par := coalesce(auth.uid(), new.modifie_par);
  return new;
end $$;

drop trigger if exists agence_reglages_maj on agence_reglages;
create trigger agence_reglages_maj
  before update on agence_reglages
  for each row execute function agence_reglages_maj();
