-- Migration 022 : Zones de couleur du planning chantier

create table if not exists planning_zones (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  nom text not null,
  couleur text not null default '#9C9591',
  ordre integer default 0,
  created_at timestamptz default now()
);

alter table planning_zones enable row level security;
create policy "Authenticated" on planning_zones
  for all using (auth.role() = 'authenticated');

-- Colonne zone_id sur les tâches du planning
alter table planning
  add column if not exists zone_id uuid references planning_zones(id) on delete set null;

notify pgrst, 'reload schema';
