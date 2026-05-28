-- Migration 010 : Module Planning d'étude (granularité hebdomadaire)

create table if not exists planning_etude_taches (
  id bigint primary key generated always as identity,
  affaire_id uuid not null references affaires(id) on delete cascade,

  -- Identification
  num_tache text not null,
  nom text not null,

  -- Type de tâche (détermine la couleur et le rendu)
  type_tache text not null default 'etude' check (
    type_tache in ('etude', 'validation', 'administratif', 'chantier')
  ),

  -- Temporalité HEBDOMADAIRE
  semaine_debut integer not null,  -- numéro de semaine ISO (1-53)
  annee_debut   integer not null,
  duree_semaines integer not null default 1,

  -- Intervenants (pour etude/chantier) — stockés "1,2,3"
  intervenants text,

  -- Texte affiché dans la barre (pour administratif)
  label_barre text,

  -- Avancement
  avancement integer default 0 check (avancement between 0 and 100),

  -- Chemin critique
  depends_on   bigint references planning_etude_taches(id) on delete set null,
  lag_semaines integer default 0,

  ordre      integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists planning_etude_jalons (
  id         bigint primary key generated always as identity,
  affaire_id uuid not null references affaires(id) on delete cascade,
  label      text not null,
  semaine    integer not null,
  annee      integer not null,
  couleur    text not null default '#8B5CF6',
  ordre      integer default 0,
  created_at timestamptz default now()
);

alter table planning_etude_taches enable row level security;
alter table planning_etude_jalons  enable row level security;

create policy "Authenticated" on planning_etude_taches
  for all using (auth.role() = 'authenticated');
create policy "Authenticated" on planning_etude_jalons
  for all using (auth.role() = 'authenticated');

drop trigger if exists planning_etude_updated_at on planning_etude_taches;
create trigger planning_etude_updated_at
  before update on planning_etude_taches
  for each row execute function update_updated_at();
