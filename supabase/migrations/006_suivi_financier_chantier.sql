-- Migration 006 : Suivi financier chantier

create table if not exists lignes_financieres (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  lot_id      uuid not null references lots(id) on delete cascade,

  categorie   text not null check (
    categorie in ('aleas', 'adaptation_moe', 'demande_mo')
  ),
  intitule    text not null,
  montant_ht  numeric(12,2) not null default 0,
  statut      text not null default 'en_attente' check (
    statut in ('avenant_signe', 'devis_valide', 'en_attente', 'refuse')
  ),
  reference   text,
  ftm_id      uuid references ftm(id),
  ordre       integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table lignes_financieres enable row level security;
create policy "Authenticated" on lignes_financieres
  for all using (auth.role() = 'authenticated');

drop trigger if exists lignes_financieres_updated_at on lignes_financieres;
create trigger lignes_financieres_updated_at
  before update on lignes_financieres
  for each row execute function update_updated_at();
