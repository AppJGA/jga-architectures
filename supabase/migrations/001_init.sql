-- AFFAIRES
create table affaires (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  nom text not null,
  client text,
  phase text check (phase in ('esq','avp','pro','dce','chantier','livree')),
  avancement integer default 0,
  date_livraison date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RAPPORTS DE CHANTIER
create table rapports_chantier (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid references affaires(id) on delete cascade,
  date_visite date not null,
  meteo text,
  redacteur_id uuid references auth.users(id),
  contenu text,
  created_at timestamptz default now()
);

-- RÉSERVES
create table reserves (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid references rapports_chantier(id) on delete cascade,
  affaire_id uuid references affaires(id) on delete cascade,
  description text not null,
  lot text,
  statut text default 'ouverte' check (statut in ('ouverte','en_cours','levee')),
  created_at timestamptz default now()
);

-- TO-DO LIST
create table todos (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid references affaires(id) on delete cascade,
  phase_etude text,
  titre text not null,
  fait boolean default false,
  ordre integer default 0,
  created_at timestamptz default now()
);

-- HEURES TRAVAILLÉES
create table heures (
  id uuid primary key default gen_random_uuid(),
  collaborateur_id uuid references auth.users(id),
  affaire_id uuid references affaires(id),
  semaine date,
  heures numeric(5,2),
  commentaire text,
  created_at timestamptz default now()
);

-- Row Level Security
alter table affaires enable row level security;
alter table rapports_chantier enable row level security;
alter table reserves enable row level security;
alter table todos enable row level security;
alter table heures enable row level security;

create policy "Authenticated users" on affaires
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users" on rapports_chantier
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users" on reserves
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users" on todos
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users" on heures
  for all using (auth.role() = 'authenticated');

-- Données de test
insert into affaires (reference, nom, client, phase, avancement, date_livraison) values
  ('2024-017', 'Résidence Les Peupliers', 'Mairie de Calais', 'chantier', 72, '2025-12-01'),
  ('2024-021', 'Médiathèque Dunkerque Nord', 'CU Dunkerque', 'dce', 38, '2025-03-01'),
  ('2024-019', 'Groupe scolaire Sainte-Marie', 'Archidiocèse de Lille', 'pro', 55, '2025-10-01'),
  ('2023-044', 'Extension EHPAD Le Belvédère', 'Groupe Korian', 'chantier', 88, '2025-02-01'),
  ('2025-003', 'Réhabilitation Hôtel de Ville', 'Ville de Gravelines', 'esq', 15, '2026-01-01');
