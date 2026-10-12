-- Migration 071 : échéances partagées avec Notion
--
-- Conception : docs/superpowers/specs/2026-10-12-echeances-notion-design.md.
-- Le registre relie chaque date lue dans une carte « ECHEANCES RENDUS » du
-- Planning hebdomadaire Notion à une échéance d'un planning de l'app — ou à
-- rien, quand l'affaire n'existe que dans Notion. `date_synchro` est la date
-- sur laquelle les deux côtés étaient d'accord au dernier passage : c'est en
-- la comparant aux deux côtés qu'on sait lequel a bougé. `libelle` est le
-- texte vu dans Notion, `libelle_app` celui de l'échéance : chacun change de
-- son côté sans écraser l'autre au premier rapprochement.
--
-- `modifie_le` sur les échéances départage les deux côtés quand les deux ont
-- changé (le plus récent l'emporte).
--
-- Rejouable. Suppose les migrations 050, 060, 068 (est_agence,
-- peut_modifier_affaire, acces_gestion).

create table if not exists notion_echeances (
  id uuid primary key,
  page_id text,
  rang integer not null default 0,
  numero text,
  reference text,
  affaire_id uuid references affaires(id) on delete set null,
  origine text check (origine in ('etude', 'chantier')),
  jalon_id bigint,
  libelle text,
  libelle_app text,
  date_synchro date,
  texte_carte text,
  nb_dates integer not null default 1,
  notion_modifie_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origine, jalon_id)
);

create index if not exists notion_echeances_page on notion_echeances (page_id);
create index if not exists notion_echeances_numero on notion_echeances (numero);

create or replace function notion_echeances_maj() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists notion_echeances_maj on notion_echeances;
create trigger notion_echeances_maj before update on notion_echeances
  for each row execute function notion_echeances_maj();

alter table notion_echeances enable row level security;
drop policy if exists "Agence" on notion_echeances;
create policy "Agence" on notion_echeances for all to authenticated
  using (public.est_agence()) with check (public.est_agence());
-- Comme toute table d'une affaire (060) : seules les écritures sont restreintes
-- à une affaire qu'on peut modifier ; la lecture reste ouverte à toute l'agence
-- (une politique restrictive `for all` l'aurait fermée aussi). Une ligne sans
-- affaire (affaire absente de l'app) reste ouverte à toute l'agence.
drop policy if exists "Collaborateurs : écriture" on notion_echeances;
drop policy if exists "Collaborateurs : ajout" on notion_echeances;
create policy "Collaborateurs : ajout" on notion_echeances as restrictive for insert to authenticated
  with check (affaire_id is null or public.peut_modifier_affaire(affaire_id) or public.acces_gestion());
drop policy if exists "Collaborateurs : modification" on notion_echeances;
create policy "Collaborateurs : modification" on notion_echeances as restrictive for update to authenticated
  using (affaire_id is null or public.peut_modifier_affaire(affaire_id) or public.acces_gestion())
  with check (affaire_id is null or public.peut_modifier_affaire(affaire_id) or public.acces_gestion());
drop policy if exists "Collaborateurs : suppression" on notion_echeances;
create policy "Collaborateurs : suppression" on notion_echeances as restrictive for delete to authenticated
  using (affaire_id is null or public.peut_modifier_affaire(affaire_id) or public.acces_gestion());

-- Heure de modification des échéances
alter table planning_jalons add column if not exists modifie_le timestamptz not null default now();
alter table planning_etude_jalons add column if not exists modifie_le timestamptz not null default now();

create or replace function jalons_modifie_le() returns trigger language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;
drop trigger if exists planning_jalons_modifie_le on planning_jalons;
create trigger planning_jalons_modifie_le before update on planning_jalons
  for each row execute function jalons_modifie_le();
drop trigger if exists planning_etude_jalons_modifie_le on planning_etude_jalons;
create trigger planning_etude_jalons_modifie_le before update on planning_etude_jalons
  for each row execute function jalons_modifie_le();

notify pgrst, 'reload schema';
