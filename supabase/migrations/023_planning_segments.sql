-- Migration 023 : Segments multi-zones sur les tâches du planning chantier

create table if not exists planning_segments (
  id uuid primary key default gen_random_uuid(),
  tache_id bigint not null references planning(id) on delete cascade,
  affaire_id uuid not null references affaires(id) on delete cascade,

  -- Période du segment
  date_debut date not null,
  duree_jours integer not null default 5,

  -- Zone assignée (optionnel)
  zone_id uuid references planning_zones(id) on delete set null,

  -- Délai d'appro propre au segment
  delai_appro integer default 0,

  ordre integer default 0,
  created_at timestamptz default now()
);

alter table planning_segments enable row level security;
create policy "Authenticated" on planning_segments
  for all using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
