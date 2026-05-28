-- Migration 009 : Module FTM enrichi (Fiches de Travaux Modificatifs)

-- Supprimer l'ancienne table FTM simplifiée (cascade supprime ftm_id dans lignes_financieres)
drop table if exists ftm cascade;

-- Rendre lot_id nullable dans lignes_financieres (FTM sans lot possible)
alter table lignes_financieres
  alter column lot_id drop not null;

-- Nouvelle table FTM enrichie
create table ftm (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,

  numero integer not null,
  date_emission date not null default current_date,
  reference_chantier text,

  origine text not null check (origine in ('moe', 'mo', 'aleas')),

  type_demande text check (type_demande in ('ajout', 'suppression', 'modification')),
  description text,

  motivation text check (motivation in ('confort_usage', 'esthetique', 'technique', 'autre')),
  motivation_autre text,

  faisabilite_technique boolean,
  impact_reglementaire boolean,
  incidence_delai_valeur numeric(6,1),
  incidence_delai_unite text check (incidence_delai_unite in ('jours', 'semaines')),
  montant_travaux_ht numeric(12,2),
  montant_honoraires_ht numeric(12,2),

  decision text check (decision in ('accepte', 'renonce', 'en_attente')),
  date_decision date,

  ligne_financiere_id uuid references lignes_financieres(id) on delete set null,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(affaire_id, numero)
);

alter table ftm enable row level security;
create policy "Authenticated" on ftm
  for all using (auth.role() = 'authenticated');

drop trigger if exists ftm_updated_at on ftm;
create trigger ftm_updated_at
  before update on ftm
  for each row execute function update_updated_at();

-- Numérotation séquentielle par affaire
create or replace function next_ftm_numero(p_affaire_id uuid)
returns integer as $$
  select coalesce(max(numero), 0) + 1
  from ftm
  where affaire_id = p_affaire_id
$$ language sql;
