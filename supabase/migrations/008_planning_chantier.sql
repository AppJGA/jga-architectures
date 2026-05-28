-- Migration 008 : Planning chantier (Gantt)

-- Colonne couleur sur les lots existants
alter table lots
  add column if not exists couleur text default '#E05A1E';

-- Table des tâches planning
create table if not exists planning (
  id bigint primary key generated always as identity,
  affaire_id uuid not null references affaires(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,
  num_tache text not null,
  nom text not null,
  debut date not null,
  duree integer not null default 5,
  avancement integer default 0
    check (avancement between 0 and 100),
  depends_on bigint references planning(id) on delete set null,
  lag_days integer default 1,
  ordre integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table planning enable row level security;
create policy "Authenticated" on planning
  for all using (auth.role() = 'authenticated');

drop trigger if exists planning_updated_at on planning;
create trigger planning_updated_at
  before update on planning
  for each row execute function update_updated_at();

-- Colonnes approvisionnement
alter table planning
  add column if not exists appro_actif boolean default false,
  add column if not exists appro_duree integer,
  add column if not exists appro_materiau text;

-- Table des jalons
create table if not exists planning_jalons (
  id bigint primary key generated always as identity,
  affaire_id uuid not null references affaires(id) on delete cascade,
  label text not null,
  date date not null,
  couleur text not null default '#8B5CF6',
  ordre integer default 0,
  created_at timestamptz default now()
);

alter table planning_jalons enable row level security;
create policy "Authenticated" on planning_jalons
  for all using (auth.role() = 'authenticated');
