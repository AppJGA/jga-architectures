-- Migration 005 : Lots, Entreprises, Interlocuteurs

-- ── Lots du chantier ─────────────────────────────────────────────────────────
create table lots (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  numero      integer not null,
  nom         text not null,
  ordre       integer default 0,
  created_at  timestamptz default now(),
  unique(affaire_id, numero)
);

-- ── Entreprises ───────────────────────────────────────────────────────────────
create table entreprises (
  id             uuid primary key default gen_random_uuid(),
  raison_sociale text not null,
  adresse        text,
  code_postal    text,
  ville          text,
  telephone      text,
  email          text,
  siret          text,
  created_at     timestamptz default now()
);

-- ── Interlocuteurs d'une entreprise ───────────────────────────────────────────
create table interlocuteurs (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references entreprises(id) on delete cascade,
  prenom         text not null,
  nom            text not null,
  fonction       text,
  telephone      text,
  email          text,
  est_principal  boolean default false,
  created_at     timestamptz default now()
);

-- ── Attribution lot <-> entreprise sur une affaire ────────────────────────────
create table lot_entreprises (
  id                 uuid primary key default gen_random_uuid(),
  lot_id             uuid not null references lots(id) on delete cascade,
  affaire_id         uuid not null references affaires(id) on delete cascade,
  entreprise_id      uuid not null references entreprises(id),
  interlocuteur_id   uuid references interlocuteurs(id),
  montant_marche_ht  numeric(12,2),
  montant_marche_ttc numeric(12,2),
  date_notification  date,
  observations       text,
  created_at         timestamptz default now(),
  unique(lot_id, affaire_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table lots           enable row level security;
alter table entreprises    enable row level security;
alter table interlocuteurs enable row level security;
alter table lot_entreprises enable row level security;

create policy "Authenticated" on lots
  for all using (auth.role() = 'authenticated');
create policy "Authenticated" on entreprises
  for all using (auth.role() = 'authenticated');
create policy "Authenticated" on interlocuteurs
  for all using (auth.role() = 'authenticated');
create policy "Authenticated" on lot_entreprises
  for all using (auth.role() = 'authenticated');
