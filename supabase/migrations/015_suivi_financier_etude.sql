-- Historique des évolutions d'enveloppe par phase
create table if not exists suivi_financier_etude (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  phase text not null check (
    phase in ('esq','avp','pro','dce','chantier')
  ),
  enveloppe_ttc numeric(12,2),
  enveloppe_ht  numeric(12,2),
  motif_evolution text,
  honoraires_ttc numeric(12,2),
  honoraires_ht  numeric(12,2),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(affaire_id, phase)
);

-- Estimations par lot (APD/PRO/DCE)
create table if not exists estimations_lots (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,
  phase text not null check (
    phase in ('esq','avp','pro','dce')
  ),
  nom_lot text not null,
  numero_lot integer,
  montant_estime_ht  numeric(12,2),
  montant_estime_ttc numeric(12,2),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table suivi_financier_etude enable row level security;
alter table estimations_lots enable row level security;

drop policy if exists "Authenticated" on suivi_financier_etude;
create policy "Authenticated" on suivi_financier_etude
  for all using (auth.role() = 'authenticated');

drop policy if exists "Authenticated" on estimations_lots;
create policy "Authenticated" on estimations_lots
  for all using (auth.role() = 'authenticated');

drop trigger if exists sfe_updated_at on suivi_financier_etude;
create trigger sfe_updated_at
  before update on suivi_financier_etude
  for each row execute function update_updated_at();

drop trigger if exists el_updated_at on estimations_lots;
create trigger el_updated_at
  before update on estimations_lots
  for each row execute function update_updated_at();
