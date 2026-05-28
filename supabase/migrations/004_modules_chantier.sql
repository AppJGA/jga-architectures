-- Migration 004 : Restructuration modules chantier
-- Renomme rapports_chantier → comptes_rendus, contenu → observations
-- Ajoute tables opr et ftm
-- Met à jour la colonne de FK dans reserves

-- ── Rename rapports_chantier → comptes_rendus ─────────────────────────────────
alter table if exists rapports_chantier rename to comptes_rendus;

-- Rename column contenu → observations
alter table comptes_rendus rename column contenu to observations;

-- Rename FK column in reserves
alter table reserves rename column rapport_id to compte_rendu_id;

-- Update FK constraint on reserves
alter table reserves drop constraint if exists reserves_rapport_id_fkey;
alter table reserves
  add constraint reserves_compte_rendu_id_fkey
  foreign key (compte_rendu_id) references comptes_rendus(id) on delete cascade;

-- Add source column to reserves (to link OPR reserves in future)
alter table reserves add column if not exists source text default 'cr' check (source in ('cr', 'opr'));

-- ── Table OPR ─────────────────────────────────────────────────────────────────
create table if not exists opr (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  date_opr    date not null,
  redacteur_id uuid references auth.users(id),
  observations text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table opr enable row level security;
create policy "Authenticated users can manage opr"
  on opr for all to authenticated using (true) with check (true);

-- Add opr_id to reserves for OPR-origin reserves
alter table reserves add column if not exists opr_id uuid references opr(id) on delete cascade;

-- ── Table FTM (Fiches de travaux modificatifs) ────────────────────────────────
create table if not exists ftm (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  numero      int,
  intitule    text not null,
  lot         text,
  statut      text default 'en_attente' check (statut in ('en_attente', 'accepte', 'refuse', 'annule')),
  montant_ht  numeric(12, 2),
  description text,
  date_emission date,
  redacteur_id uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table ftm enable row level security;
create policy "Authenticated users can manage ftm"
  on ftm for all to authenticated using (true) with check (true);

-- ── Triggers updated_at ───────────────────────────────────────────────────────
create trigger update_comptes_rendus_updated_at
  before update on comptes_rendus
  for each row execute procedure update_updated_at_column();

create trigger update_opr_updated_at
  before update on opr
  for each row execute procedure update_updated_at_column();

create trigger update_ftm_updated_at
  before update on ftm
  for each row execute procedure update_updated_at_column();
