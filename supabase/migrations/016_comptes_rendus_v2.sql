-- Migration 016 : Refonte complète du module Comptes Rendus de Chantier
-- Remplace l'ancien système simple (visite + réserves) par un CRC structuré
-- avec interlocuteurs, présences, sections, sous-sections et remarques.

-- ── Suppression de l'ancien schéma ────────────────────────────────────────────
-- CASCADE retire la FK reserves.compte_rendu_id (la table reserves reste)
drop table if exists comptes_rendus cascade;

-- ── Interlocuteurs permanents par affaire ─────────────────────────────────────
create table if not exists affaire_interlocuteurs (
  id            uuid primary key default gen_random_uuid(),
  affaire_id    uuid not null references affaires(id) on delete cascade,
  categorie     text not null check (categorie in (
    'moa', 'moe', 'be', 'ct', 'csps', 'administration', 'autre'
  )),
  categorie_label text,
  prenom        text,
  nom           text,
  fonction      text,
  organisation  text,
  adresse       text,
  email         text,
  telephone     text,
  entreprise_id uuid references entreprises(id) on delete set null,
  ordre         integer default 0,
  created_at    timestamptz default now()
);

-- ── Comptes rendus ─────────────────────────────────────────────────────────────
create table if not exists comptes_rendus (
  id                    uuid primary key default gen_random_uuid(),
  affaire_id            uuid not null references affaires(id) on delete cascade,
  numero                integer not null,
  date_reunion          date not null,
  date_prochaine_reunion date,
  heure_prochaine_reunion time,
  redacteur_id          uuid references profiles(id),
  statut                text default 'brouillon' check (statut in ('brouillon', 'emis')),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  unique(affaire_id, numero)
);

-- ── Présences ─────────────────────────────────────────────────────────────────
create table if not exists cr_presences (
  id                  uuid primary key default gen_random_uuid(),
  cr_id               uuid not null references comptes_rendus(id) on delete cascade,
  interlocuteur_id    uuid references affaire_interlocuteurs(id) on delete cascade,
  lot_entreprise_id   uuid references lot_entreprises(id) on delete cascade,
  presence            text default 'na' check (presence in ('p', 'r', 'a', 'e', 'na')),
  convoque            boolean default false,
  heure_convocation   time,
  created_at          timestamptz default now()
);

-- ── Sections ──────────────────────────────────────────────────────────────────
create table if not exists cr_sections (
  id            uuid primary key default gen_random_uuid(),
  cr_id         uuid not null references comptes_rendus(id) on delete cascade,
  numero_romain text not null,
  titre         text not null,
  ordre         integer not null default 0,
  created_at    timestamptz default now()
);

-- ── Sous-sections ─────────────────────────────────────────────────────────────
create table if not exists cr_sous_sections (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references cr_sections(id) on delete cascade,
  cr_id      uuid not null references comptes_rendus(id) on delete cascade,
  code       text not null,
  titre      text not null,
  ordre      integer not null default 0,
  created_at timestamptz default now()
);

-- ── Remarques ─────────────────────────────────────────────────────────────────
create table if not exists cr_remarques (
  id               uuid primary key default gen_random_uuid(),
  sous_section_id  uuid not null references cr_sous_sections(id) on delete cascade,
  cr_id            uuid not null references comptes_rendus(id) on delete cascade,
  affaire_id       uuid references affaires(id) on delete cascade,
  lot_id           uuid references lots(id) on delete set null,
  date_note        date,
  pour             text,
  description      text not null,
  statut           text default 'en_cours',
  date_echeance    date,
  est_important    boolean default false,
  est_clos         boolean default false,
  est_nouveau      boolean default false,
  ordre            integer default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── Templates de sections ─────────────────────────────────────────────────────
create table if not exists cr_sections_template (
  id            uuid primary key default gen_random_uuid(),
  affaire_id    uuid not null references affaires(id) on delete cascade,
  numero_romain text not null,
  titre         text not null,
  ordre         integer not null default 0,
  sous_sections jsonb default '[]'::jsonb,
  created_at    timestamptz default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$ declare t text;
begin
  foreach t in array array[
    'affaire_interlocuteurs','comptes_rendus',
    'cr_presences','cr_sections','cr_sous_sections',
    'cr_remarques','cr_sections_template'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Authenticated" on %I', t);
    execute format(
      'create policy "Authenticated" on %I for all using (auth.role() = ''authenticated'')', t
    );
  end loop;
end $$;

-- ── Triggers updated_at ───────────────────────────────────────────────────────
drop trigger if exists comptes_rendus_updated_at on comptes_rendus;
create trigger comptes_rendus_updated_at
  before update on comptes_rendus
  for each row execute function update_updated_at();

drop trigger if exists cr_remarques_updated_at on cr_remarques;
create trigger cr_remarques_updated_at
  before update on cr_remarques
  for each row execute function update_updated_at();
