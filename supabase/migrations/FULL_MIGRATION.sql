-- ============================================
-- FULL MIGRATION — JGA Espace Collaborateur
-- À exécuter dans Supabase > SQL Editor
-- ============================================

-- 1. TABLE AFFAIRES (enrichie)
create table if not exists affaires (
  id uuid primary key default gen_random_uuid(),
  code_affaire text not null unique,
  nom text not null,
  phase text default 'esq' check (
    phase in ('esq','avp','pro','dce','chantier','livree')
  ),
  avancement integer default 0 check (avancement between 0 and 100),
  moa_nom text,
  moa_adresse text,
  moa_telephone text,
  moa_email text,
  projet_adresse text,
  projet_commune text,
  projet_code_postal text,
  cadastre_section text,
  cadastre_parcelle text,
  cadastre_superficie numeric(10,2),
  terrain_statut text check (
    terrain_statut in ('propriete','compromis','location','en_vue')
  ),
  viab_voirie boolean default false,
  viab_electricite boolean default false,
  viab_gaz boolean default false,
  viab_assainissement boolean default false,
  viab_eaux_pluviales boolean default false,
  viab_courants_faibles boolean default false,
  doc_cadastre boolean default false,
  doc_geometre boolean default false,
  doc_etude_sol boolean default false,
  doc_servitudes boolean default false,
  enveloppe_ttc numeric(12,2),
  montant_travaux_ttc numeric(12,2),
  honoraires_ttc numeric(12,2),
  surface_plancher numeric(8,2),
  surface_habitable numeric(8,2),
  surface_terrain numeric(10,2),
  cos_autorise numeric(8,2),
  date_esq date,
  date_avp date,
  date_pro date,
  date_dce date,
  date_depot_pc date,
  date_obtention_pc date,
  date_demarrage_travaux date,
  date_livraison date,
  programme_imperatifs text,
  programme_interdits text,
  programme_prestations text,
  notes text,
  taux_tva numeric(5,4) not null default 1.20,
  seuil_aleas_pct numeric(5,2) not null default 5.00,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. PROFILES
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text not null default 'Prénom',
  nom text not null default 'Nom',
  email text not null unique,
  created_at timestamptz default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, prenom, nom, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'prenom', 'Prénom'),
    coalesce(new.raw_user_meta_data->>'nom', 'Nom'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 3. AFFAIRE COLLABORATEURS
create table if not exists affaire_collaborateurs (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text default 'collaborateur' check (
    role in ('proprietaire','collaborateur')
  ),
  added_at timestamptz default now(),
  added_by uuid references profiles(id),
  unique(affaire_id, user_id)
);

-- 4. COMPTES RENDUS DE CHANTIER
create table if not exists comptes_rendus (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid references affaires(id) on delete cascade,
  date_visite date not null,
  meteo text,
  redacteur_id uuid references auth.users(id),
  observations text,
  created_at timestamptz default now()
);

-- 5. OPR
create table if not exists opr (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid references affaires(id) on delete cascade,
  date_opr date not null,
  redacteur_id uuid references auth.users(id),
  entreprises text[],
  statut text default 'en_cours' check (
    statut in ('en_cours','clos','leve')
  ),
  observations text,
  created_at timestamptz default now()
);

-- 6. RÉSERVES
create table if not exists reserves (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid references affaires(id) on delete cascade,
  compte_rendu_id uuid references comptes_rendus(id) on delete cascade,
  opr_id uuid references opr(id) on delete cascade,
  source text default 'cr' check (source in ('cr','opr')),
  description text not null,
  lot text,
  statut text default 'ouverte' check (
    statut in ('ouverte','en_cours','levee')
  ),
  created_at timestamptz default now()
);

-- 7. FTM (enrichie — ligne_financiere_id ajoutée après lignes_financieres)
create table if not exists ftm (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,

  numero integer not null,
  date_emission date not null default current_date,
  reference_chantier text,

  origine text not null check (origine in ('moe', 'mo', 'aleas')),

  type_demande text check (type_demande in ('ajout', 'suppression', 'modification')),
  description text,

  motivation text check (motivation in ('confort_usage', 'esthetique', 'technique', 'autre')),
  motivation_autre text,

  faisabilite_technique boolean,
  impact_reglementaire boolean,
  incidence_delai_valeur numeric(6,1),
  incidence_delai_unite text check (incidence_delai_unite in ('jours', 'semaines')),
  montant_travaux_ht numeric(12,2),
  montant_honoraires_ht numeric(12,2),

  decision text check (decision in ('accepte', 'renonce', 'en_attente')),
  date_decision date,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(affaire_id, numero)
);

-- 8. TODOS
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid references affaires(id) on delete cascade,
  phase_etude text,
  titre text not null,
  fait boolean default false,
  ordre integer default 0,
  created_at timestamptz default now()
);

-- 9. HEURES
create table if not exists heures (
  id uuid primary key default gen_random_uuid(),
  collaborateur_id uuid references auth.users(id),
  affaire_id uuid references affaires(id),
  semaine date,
  heures numeric(5,2),
  commentaire text,
  created_at timestamptz default now()
);

-- 10. LOTS
create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  affaire_id uuid not null references affaires(id) on delete cascade,
  numero integer not null,
  nom text not null,
  couleur text default '#E05A1E',
  ordre integer default 0,
  created_at timestamptz default now(),
  unique(affaire_id, numero)
);

-- 11. ENTREPRISES
create table if not exists entreprises (
  id uuid primary key default gen_random_uuid(),
  raison_sociale text not null,
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email text,
  siret text,
  created_at timestamptz default now()
);

-- 12. INTERLOCUTEURS
create table if not exists interlocuteurs (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprises(id) on delete cascade,
  prenom text not null,
  nom text not null,
  fonction text,
  telephone text,
  email text,
  est_principal boolean default false,
  created_at timestamptz default now()
);

-- 13. LOT_ENTREPRISES
create table if not exists lot_entreprises (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  affaire_id uuid not null references affaires(id) on delete cascade,
  entreprise_id uuid not null references entreprises(id),
  interlocuteur_id uuid references interlocuteurs(id),
  montant_marche_ht numeric(12,2),
  montant_marche_ttc numeric(12,2),
  date_notification date,
  observations text,
  created_at timestamptz default now(),
  unique(lot_id, affaire_id)
);

-- 14. LIGNES FINANCIERES (lot_id nullable pour les FTM sans lot)
create table if not exists lignes_financieres (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  lot_id      uuid references lots(id) on delete set null,
  categorie   text not null check (
    categorie in ('aleas', 'adaptation_moe', 'demande_mo')
  ),
  intitule    text not null,
  montant_ht  numeric(12,2) not null default 0,
  statut      text not null default 'en_attente' check (
    statut in ('avenant_signe', 'devis_valide', 'en_attente', 'refuse')
  ),
  reference   text,
  ftm_id      uuid references ftm(id) on delete set null,
  ordre       integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- FK circulaire ftm ↔ lignes_financieres : ajoutée après la création des deux tables
alter table ftm add column if not exists ligne_financiere_id uuid references lignes_financieres(id) on delete set null;

-- 15. PLANNING
create table if not exists planning (
  id bigint primary key generated always as identity,
  affaire_id uuid not null references affaires(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,
  num_tache text not null,
  nom text not null,
  debut date not null,
  duree integer not null default 5,
  avancement integer default 0 check (avancement between 0 and 100),
  depends_on bigint references planning(id) on delete set null,
  lag_days integer default 1,
  ordre integer default 0,
  appro_actif boolean default false,
  appro_duree integer,
  appro_materiau text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 16. JALONS PLANNING
create table if not exists planning_jalons (
  id bigint primary key generated always as identity,
  affaire_id uuid not null references affaires(id) on delete cascade,
  label text not null,
  date date not null,
  couleur text not null default '#8B5CF6',
  ordre integer default 0,
  created_at timestamptz default now()
);

-- ============================================
-- RLS — Row Level Security
-- ============================================
alter table affaires enable row level security;
alter table profiles enable row level security;
alter table affaire_collaborateurs enable row level security;
alter table comptes_rendus enable row level security;
alter table opr enable row level security;
alter table reserves enable row level security;
alter table ftm enable row level security;
alter table todos enable row level security;
alter table heures enable row level security;
alter table lots enable row level security;
alter table entreprises enable row level security;
alter table interlocuteurs enable row level security;
alter table lot_entreprises enable row level security;
alter table lignes_financieres enable row level security;
alter table planning enable row level security;
alter table planning_jalons enable row level security;

-- Policies (drop + recreate pour éviter les doublons)
do $$ declare
  t text;
begin
  foreach t in array array[
    'affaires','profiles','affaire_collaborateurs','comptes_rendus',
    'opr','reserves','ftm','todos','heures','lots',
    'entreprises','interlocuteurs','lot_entreprises','lignes_financieres','planning','planning_jalons'
  ] loop
    execute format(
      'drop policy if exists "Authenticated" on %I', t
    );
    execute format(
      'create policy "Authenticated" on %I
       for all using (auth.role() = ''authenticated'')', t
    );
  end loop;
end $$;

-- ============================================
-- TRIGGER updated_at sur affaires
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists affaires_updated_at on affaires;
create trigger affaires_updated_at
  before update on affaires
  for each row execute function update_updated_at();

drop trigger if exists lignes_financieres_updated_at on lignes_financieres;
create trigger lignes_financieres_updated_at
  before update on lignes_financieres
  for each row execute function update_updated_at();

drop trigger if exists planning_updated_at on planning;
create trigger planning_updated_at
  before update on planning
  for each row execute function update_updated_at();

drop trigger if exists ftm_updated_at on ftm;
create trigger ftm_updated_at
  before update on ftm
  for each row execute function update_updated_at();

-- Numérotation séquentielle FTM par affaire
create or replace function next_ftm_numero(p_affaire_id uuid)
returns integer as $$
  select coalesce(max(numero), 0) + 1
  from ftm
  where affaire_id = p_affaire_id
$$ language sql;

-- ============================================
-- DONNÉES DE TEST
-- ============================================
insert into affaires (
  code_affaire, nom, moa_nom, moa_email,
  projet_commune, projet_code_postal,
  phase, avancement,
  enveloppe_ttc, montant_travaux_ttc,
  surface_plancher, date_livraison
) values
  ('2024-RLP','Résidence Les Peupliers','Mairie de Calais',
   'contact@ville-calais.fr','Calais','62100',
   'chantier',72, 1200000,950000,1800,'2025-12-01'),
  ('2024-MDN','Médiathèque Dunkerque Nord','CU Dunkerque',
   'projets@cu-dunkerque.fr','Dunkerque','59140',
   'dce',38, 3500000,2800000,2400, null),
  ('2024-GSM','Groupe scolaire Sainte-Marie','Archidiocèse de Lille',
   'direction@diocese-lille.fr','Lille','59000',
   'pro',55, 2100000,1700000,3200, null),
  ('2025-HVG','Réhabilitation Hôtel de Ville','Ville de Gravelines',
   'mairie@gravelines.fr','Gravelines','59820',
   'esq',15, 800000,650000,1200, null)
on conflict (code_affaire) do nothing;
