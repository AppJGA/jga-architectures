-- Migration 012 : Colonnes manquantes + correction des politiques RLS sur la table affaires

-- Colonnes financières ajoutées après la migration initiale
alter table affaires
  add column if not exists taux_tva numeric(5,4) not null default 1.20,
  add column if not exists seuil_aleas_pct numeric(5,2) not null default 5.00;

-- Contrainte terrain_statut : autoriser NULL (champ optionnel)
alter table affaires
  drop constraint if exists affaires_terrain_statut_check;

alter table affaires
  add constraint affaires_terrain_statut_check
  check (
    terrain_statut is null or
    terrain_statut in ('propriete', 'compromis', 'location', 'en_vue')
  );

-- Suppression des anciennes politiques génériques (noms variables selon l'installation)
drop policy if exists "Authenticated" on affaires;
drop policy if exists "Authenticated users" on affaires;
drop policy if exists "Enable read access for all users" on affaires;
drop policy if exists "Enable insert for authenticated users only" on affaires;

-- Lecture : tout utilisateur authentifié peut lire toutes les affaires
-- (le filtrage par collaborateur est fait côté application en deux étapes)
create policy "Lecture affaires authentifiées" on affaires
  for select
  using (auth.role() = 'authenticated');

-- Création : tout utilisateur authentifié peut créer une affaire
create policy "Création affaire authentifiée" on affaires
  for insert
  with check (auth.role() = 'authenticated');

-- Modification : propriétaire déclaré, ou affaire sans propriétaire (données de test / migration)
create policy "Modification par propriétaire" on affaires
  for update
  using (
    auth.role() = 'authenticated'
    and (
      exists (
        select 1 from affaire_collaborateurs
        where affaire_id = affaires.id
          and user_id = auth.uid()
          and role = 'proprietaire'
      )
      or not exists (
        select 1 from affaire_collaborateurs
        where affaire_id = affaires.id
          and role = 'proprietaire'
      )
    )
  );

-- Suppression : réservée au propriétaire de l'affaire
create policy "Suppression par propriétaire" on affaires
  for delete
  using (
    exists (
      select 1 from affaire_collaborateurs
      where affaire_id = affaires.id
        and user_id = auth.uid()
        and role = 'proprietaire'
    )
  );
