-- Migration 032 : Segments sur les phases du planning d'étude
--
-- Équivalent hebdomadaire de `planning_segments` (planning chantier) : une phase
-- peut être représentée à plusieurs périodes distinctes.
--
-- Note de typage : `planning_etude_phases.id` est un `bigint` (identity), comme
-- `planning.id` côté chantier — d'où `phase_id bigint` et non `uuid`, sinon la
-- clé étrangère est rejetée (types incompatibles).

create table if not exists planning_etude_segments (
  id uuid primary key default gen_random_uuid(),
  phase_id bigint not null references planning_etude_phases(id) on delete cascade,
  affaire_id uuid not null references affaires(id) on delete cascade,

  nom text,

  -- Temporalité hebdomadaire, même convention que planning_etude_phases
  semaine_debut integer not null,
  annee_debut integer not null,
  duree_semaines integer not null default 2,

  ordre integer default 0,
  created_at timestamptz default now()
);

alter table planning_etude_segments enable row level security;

create policy "Authenticated" on planning_etude_segments
  for all using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
