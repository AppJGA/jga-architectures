-- Migration 027 : Dépendances de chemin critique impliquant des segments
--
-- Le système existant (`planning.depends_on` / `planning.lag_days`) ne couvre que
-- les liaisons tâche → tâche. Cette table étend les chemins critiques aux segments
-- (segment → segment, segment → tâche, tâche → segment). Les dépendances
-- tâche → tâche déjà créées restent gérées par les colonnes existantes sur
-- `planning` ; aucune migration de données n'est nécessaire.

create table if not exists planning_dependances (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,

  source_tache_id bigint references planning(id) on delete cascade,
  source_segment_id uuid references planning_segments(id) on delete cascade,
  cible_tache_id bigint references planning(id) on delete cascade,
  cible_segment_id uuid references planning_segments(id) on delete cascade,

  lag_jours integer not null default 0,
  created_at timestamptz default now(),

  constraint source_non_vide check (
    source_tache_id is not null or source_segment_id is not null
  ),
  constraint cible_non_vide check (
    cible_tache_id is not null or cible_segment_id is not null
  )
);

alter table planning_dependances enable row level security;
create policy "Authenticated" on planning_dependances
  for all using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
