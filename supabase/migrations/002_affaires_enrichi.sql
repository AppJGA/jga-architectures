drop table if exists affaires cascade;

create table affaires (
  id uuid primary key default gen_random_uuid(),

  -- Identification
  code_affaire text not null unique,
  nom text not null,
  phase text default 'esq' check (
    phase in ('esq','avp','pro','dce','chantier','livree')
  ),
  avancement integer default 0 check (avancement between 0 and 100),

  -- Maître d'ouvrage
  moa_nom text,
  moa_adresse text,
  moa_telephone text,
  moa_email text,

  -- Site du projet
  projet_adresse text,
  projet_commune text,
  projet_code_postal text,

  -- Références cadastrales
  cadastre_section text,
  cadastre_parcelle text,
  cadastre_superficie numeric(10,2),

  -- Statut du terrain
  terrain_statut text check (
    terrain_statut in ('propriete','compromis','location','en_vue')
  ),

  -- Viabilités existantes
  viab_voirie boolean default false,
  viab_electricite boolean default false,
  viab_gaz boolean default false,
  viab_assainissement boolean default false,
  viab_eaux_pluviales boolean default false,
  viab_courants_faibles boolean default false,

  -- Documents disponibles
  doc_cadastre boolean default false,
  doc_geometre boolean default false,
  doc_etude_sol boolean default false,
  doc_servitudes boolean default false,

  -- Financier
  enveloppe_ttc numeric(12,2),
  montant_travaux_ttc numeric(12,2),
  honoraires_ttc numeric(12,2),

  -- Surfaces
  surface_plancher numeric(8,2),
  surface_habitable numeric(8,2),
  surface_terrain numeric(10,2),
  cos_autorise numeric(8,2),

  -- Calendrier des phases
  date_esq date,
  date_avp date,
  date_pro date,
  date_dce date,
  date_depot_pc date,
  date_obtention_pc date,
  date_demarrage_travaux date,
  date_livraison date,

  -- Programme / Notes
  programme_imperatifs text,
  programme_interdits text,
  programme_prestations text,
  notes text,

  -- Métadonnées
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table affaires enable row level security;
create policy "Authenticated users" on affaires
  for all using (auth.role() = 'authenticated');

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger affaires_updated_at
  before update on affaires
  for each row execute function update_updated_at();

insert into affaires (
  code_affaire, nom, moa_nom, moa_email,
  projet_adresse, projet_commune, projet_code_postal,
  cadastre_section, cadastre_parcelle,
  phase, avancement,
  enveloppe_ttc, montant_travaux_ttc,
  surface_plancher, surface_terrain,
  date_depot_pc, date_livraison
) values
  ('2024-RLP', 'Résidence Les Peupliers', 'Mairie de Calais',
   'contact@ville-calais.fr', '12 rue des Peupliers', 'Calais', '62100',
   'AB', '0142', 'chantier', 72,
   1200000, 950000, 1800, 4200,
   '2023-06-15', '2025-12-01'),
  ('2024-MDN', 'Médiathèque Dunkerque Nord', 'CU Dunkerque',
   'projets@cu-dunkerque.fr', '45 avenue du Port', 'Dunkerque', '59140',
   'BC', '0210', 'dce', 38,
   3500000, 2800000, 2400, 6000,
   '2025-03-01', null),
  ('2024-GSM', 'Groupe scolaire Sainte-Marie', 'Archidiocèse de Lille',
   'direction@diocese-lille.fr', '8 rue Sainte-Marie', 'Lille', '59000',
   'CD', '0087', 'pro', 55,
   2100000, 1700000, 3200, 5500,
   null, '2025-10-01'),
  ('2025-HVG', 'Réhabilitation Hôtel de Ville', 'Ville de Gravelines',
   'mairie@gravelines.fr', 'Place de la République', 'Gravelines', '59820',
   'AA', '0033', 'esq', 15,
   800000, 650000, 1200, 2800,
   '2026-01-01', null);
