-- Migration consolidée pour le module Visites de Chantier
-- À exécuter dans Supabase SQL Editor si les colonnes n'existent pas encore

-- 1. Colonne type_section sur cr_sections (section générale vs interlocuteurs)
alter table cr_sections
  add column if not exists type_section text
    default 'general'
    check (type_section in ('general', 'interlocuteurs'));

-- 2. Colonne interlocuteur_id sur cr_remarques (attribution directe)
alter table cr_remarques
  add column if not exists interlocuteur_id uuid
    references affaire_interlocuteurs(id) on delete set null;

-- 3. Colonne section_id sur cr_remarques (remarque directe sans sous-section)
alter table cr_remarques
  add column if not exists section_id uuid
    references cr_sections(id) on delete cascade;

-- 4. sous_section_id devient optionnel
alter table cr_remarques
  alter column sous_section_id drop not null;

-- 5. Colonne parent_id sur cr_remarques (sous-remarques / fil de suivi)
alter table cr_remarques
  add column if not exists parent_id uuid
    references cr_remarques(id) on delete cascade;

-- Rafraîchir le cache du schéma PostgREST
notify pgrst, 'reload schema';
