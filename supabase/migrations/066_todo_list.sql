-- Migration 066 : to-do list d'une affaire
--
-- Conception : docs/superpowers/specs/2026-10-09-todo-list-design.md.
--
-- `todo_modele` est la liste type de l'agence (mission phase par phase,
-- contenu des plans), modifiable dans l'app. Une affaire ne la recopie pas :
-- `todo_elements` ne garde que ce qu'elle a touché (coche, note, « sans
-- objet ») sur un article type, ses articles propres et ses tâches du
-- quotidien. Un article type n'est jamais effacé, seulement retiré
-- (`supprime_le`) : il reste visible là où il a servi.
--
-- Agence seule ; écriture dans une affaire réservée à ses collaborateurs
-- (règle de la migration 060).
--
-- Rejouable : la liste de départ n'est insérée que si la liste type est vide.

create table if not exists todo_modele (
  id          uuid primary key default gen_random_uuid(),
  liste       text not null check (liste in ('mission', 'plans')),
  groupe      text not null,
  texte       text not null,
  ordre       integer not null default 0,
  supprime_le timestamptz,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists todo_modele_liste on todo_modele(liste, groupe, ordre);

create table if not exists todo_elements (
  id             uuid primary key default gen_random_uuid(),
  affaire_id     uuid not null references affaires(id) on delete cascade,
  type           text not null check (type in ('modele', 'article', 'tache')),
  modele_id      uuid references todo_modele(id) on delete cascade,
  -- Recopiés sur l'état d'un article type : « Recommencer la vérification »
  -- des plans se fait alors d'une seule requête
  liste          text check (liste in ('mission', 'plans')),
  groupe         text,
  texte          text,
  responsable_id uuid references auth.users(id) on delete set null,
  echeance       date,
  fait_le        timestamptz,
  fait_par       uuid references auth.users(id) on delete set null,
  sans_objet     boolean not null default false,
  note           text,
  ordre          integer,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (affaire_id, modele_id)
);

create index if not exists todo_elements_affaire on todo_elements(affaire_id);

drop trigger if exists todo_elements_updated_at on todo_elements;
create trigger todo_elements_updated_at
  before update on todo_elements
  for each row execute function update_updated_at();

alter table todo_modele enable row level security;
drop policy if exists "Agence" on todo_modele;
create policy "Agence" on todo_modele for all to authenticated using (public.est_agence()) with check (public.est_agence());

do $$
declare t text := 'todo_elements';
begin
  execute format('alter table %I enable row level security', t);
  execute format('drop policy if exists "Agence" on %I', t);
  execute format('create policy "Agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
  -- Règles restrictives d'écriture : mêmes que la migration 060
  execute format('drop policy if exists "Collaborateurs : ajout" on %I', t);
  execute format('drop policy if exists "Collaborateurs : modification" on %I', t);
  execute format('drop policy if exists "Collaborateurs : suppression" on %I', t);
  execute format('create policy "Collaborateurs : ajout" on %I as restrictive for insert to authenticated with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
  execute format('create policy "Collaborateurs : modification" on %I as restrictive for update to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id)) with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
  execute format('create policy "Collaborateurs : suppression" on %I as restrictive for delete to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
end $$;

-- Liste type de départ : la fiche « Contrôle d'avancement » du carnet de
-- bord, remise aux dénominations actuelles, et la liste du contenu des plans
-- (section 7 de la conception). Ensuite, elle ne se modifie que dans l'app.
do $$
begin
  if not exists (select 1 from todo_modele) then
    insert into todo_modele (liste, groupe, ordre, texte) values
  ('mission', 'engagement', 1, 'Fiche de l''affaire renseignée : maître d''ouvrage, interlocuteurs, adresse du terrain'),
  ('mission', 'engagement', 2, 'Programme et enveloppe financière du maître d''ouvrage recueillis'),
  ('mission', 'engagement', 3, 'Proposition d''honoraires envoyée'),
  ('mission', 'engagement', 4, 'Contrat de maîtrise d''œuvre signé : mission, phases, honoraires, délais'),
  ('mission', 'engagement', 5, 'Contrat déclaré à l''Ordre, attestation d''assurance jointe'),
  ('mission', 'engagement', 6, 'Équipe de maîtrise d''œuvre constituée (BET structure, fluides, thermique, économiste, acousticien…)'),
  ('mission', 'engagement', 7, 'Contrats de cotraitance ou sous-traitance signés, missions et honoraires répartis'),
  ('mission', 'engagement', 8, 'Budget des études et planning d''étude établis (suivi financier et planning de l''app)'),
  ('mission', 'esq', 1, 'Visite du terrain et reportage photo'),
  ('mission', 'esq', 2, 'Relevé de géomètre commandé : topographie, altimétrie, limites'),
  ('mission', 'esq', 3, 'Règles d''urbanisme analysées : PLU(i), hauteur, reculs, emprise, stationnement, espaces verts'),
  ('mission', 'esq', 4, 'Servitudes recherchées (droit privé et utilité publique)'),
  ('mission', 'esq', 5, 'Certificat d''urbanisme demandé si utile'),
  ('mission', 'esq', 6, 'Contraintes du site vérifiées : risques (PPR, argiles), ABF, archéologie préventive'),
  ('mission', 'esq', 7, 'Étude géotechnique G1 demandée au maître d''ouvrage (loi ELAN)'),
  ('mission', 'esq', 8, 'Diagnostics de l''existant demandés en réhabilitation : amiante, plomb, structure'),
  ('mission', 'esq', 9, 'Programme précisé avec le maître d''ouvrage'),
  ('mission', 'esq', 10, 'Esquisses et plan masse'),
  ('mission', 'esq', 11, 'Tableau des surfaces : surface de plancher, SHAB, emprise au sol'),
  ('mission', 'esq', 12, 'Estimation sommaire comparée à l''enveloppe'),
  ('mission', 'esq', 13, 'Assurance dommages-ouvrage et contrôle technique rappelés au maître d''ouvrage'),
  ('mission', 'esq', 14, 'Esquisse présentée et validée par écrit par le maître d''ouvrage'),
  ('mission', 'esq', 15, 'Note d''honoraires de la phase'),
  ('mission', 'aps', 1, 'Concessionnaires consultés : eau, assainissement, Enedis, GRDF, télécoms / fibre, réseau de chaleur'),
  ('mission', 'aps', 2, 'Gestion des eaux pluviales à la parcelle étudiée'),
  ('mission', 'aps', 3, 'Rendez-vous préalables : service urbanisme, ABF, SDIS, accessibilité, gestionnaire de voirie'),
  ('mission', 'aps', 4, 'Compte rendu de chaque rendez-vous diffusé'),
  ('mission', 'aps', 5, 'Accord de principe de l''urbanisme sur le plan masse'),
  ('mission', 'aps', 6, 'Contrôleur technique désigné par le maître d''ouvrage, missions définies'),
  ('mission', 'aps', 7, 'Coordonnateur SPS désigné par le maître d''ouvrage'),
  ('mission', 'aps', 8, 'Étude géotechnique G2 AVP commandée'),
  ('mission', 'aps', 9, 'Voisins : état des mitoyens, mitoyenneté, clôtures, servitudes'),
  ('mission', 'aps', 10, 'Démolition : permis de démolir prévu, diagnostics amiante / plomb / déchets (PEMD)'),
  ('mission', 'aps', 11, 'Encombrements techniques donnés par les BET'),
  ('mission', 'aps', 12, 'Pré-étude thermique RE2020'),
  ('mission', 'aps', 13, 'Principe de fondations et de structure'),
  ('mission', 'aps', 14, 'Plans APS : plans, coupes, façades, insertion'),
  ('mission', 'aps', 15, 'Notice descriptive et estimation sommaires'),
  ('mission', 'aps', 16, 'Planning prévisionnel de l''opération'),
  ('mission', 'aps', 17, 'APS validé par écrit par le maître d''ouvrage'),
  ('mission', 'aps', 18, 'Note d''honoraires de la phase'),
  ('mission', 'apd', 1, 'Programme définitif accepté par le maître d''ouvrage'),
  ('mission', 'apd', 2, 'Accord du maître d''ouvrage sur surfaces, volumes, fonctionnement, façades et coût'),
  ('mission', 'apd', 3, 'Plans APD, surfaces et numéros des locaux'),
  ('mission', 'apd', 4, 'Tableau des surfaces définitif'),
  ('mission', 'apd', 5, 'Matériaux, coloris et perspectives acceptés par le maître d''ouvrage'),
  ('mission', 'apd', 6, 'Estimation par lot comparée à l''enveloppe'),
  ('mission', 'apd', 7, 'Étude thermique RE2020 et attestation pour le dépôt du PC'),
  ('mission', 'apd', 8, 'Notices accessibilité et sécurité incendie (ERP)'),
  ('mission', 'apd', 9, 'Dossier de permis complet, signé par le maître d''ouvrage'),
  ('mission', 'apd', 10, 'PC (et permis de démolir) déposé, récépissé et date de fin d''instruction notés'),
  ('mission', 'apd', 11, 'Pièces complémentaires fournies dans le délai'),
  ('mission', 'apd', 12, 'Permis obtenu, affichage constaté, recours des tiers purgé'),
  ('mission', 'apd', 13, 'Prescriptions du permis reportées dans le projet'),
  ('mission', 'apd', 14, 'Note d''honoraires de la phase'),
  ('mission', 'pro', 1, 'Planning des études PRO et DCE établi et suivi'),
  ('mission', 'pro', 2, 'Contrats des BET complémentaires selon les besoins (acoustique, VRD, cuisine…)'),
  ('mission', 'pro', 3, 'Étude géotechnique G2 PRO'),
  ('mission', 'pro', 4, 'Plan de géomètre détaillé et plan des réseaux existants'),
  ('mission', 'pro', 5, 'Raccordements arrêtés avec les concessionnaires'),
  ('mission', 'pro', 6, 'Accès pompiers et voirie validés'),
  ('mission', 'pro', 7, 'Fondations et structure arrêtées'),
  ('mission', 'pro', 8, 'Liste des lots arrêtée'),
  ('mission', 'pro', 9, 'Liste des plans à produire et échelles'),
  ('mission', 'pro', 10, 'Plans VRD, espaces verts et réseaux'),
  ('mission', 'pro', 11, 'Plans des BET reçus et intégrés'),
  ('mission', 'pro', 12, 'Détails à grande échelle : façades, étanchéité, menuiseries, logement type'),
  ('mission', 'pro', 13, 'Plans vérifiés avec la liste « Contenu des plans » : cartouches, légendes, indices'),
  ('mission', 'pro', 14, 'Notice descriptive détaillée acceptée par le maître d''ouvrage'),
  ('mission', 'pro', 15, 'Estimation détaillée par lot'),
  ('mission', 'pro', 16, 'Observations du contrôleur technique traitées'),
  ('mission', 'pro', 17, 'Accord des assureurs sur les procédés non courants'),
  ('mission', 'pro', 18, 'PRO validé par écrit par le maître d''ouvrage'),
  ('mission', 'pro', 19, 'Note d''honoraires de la phase'),
  ('mission', 'dce', 1, 'Mode de dévolution arrêté : lots séparés, entreprise générale, groupement ; procédure'),
  ('mission', 'dce', 2, 'Limites de prestations entre lots'),
  ('mission', 'dce', 3, 'Règlement de la consultation : critères, délai, variantes'),
  ('mission', 'dce', 4, 'Acte d''engagement'),
  ('mission', 'dce', 5, 'CCAP : délais, pénalités, révision des prix, retenue de garantie'),
  ('mission', 'dce', 6, 'CCTP par lot'),
  ('mission', 'dce', 7, 'DPGF ou cadre de bordereau par lot'),
  ('mission', 'dce', 8, 'PGC du coordonnateur SPS joint'),
  ('mission', 'dce', 9, 'Rapport initial du contrôleur technique joint'),
  ('mission', 'dce', 10, 'Étude de sol et diagnostics joints'),
  ('mission', 'dce', 11, 'Planning prévisionnel des travaux joint'),
  ('mission', 'dce', 12, 'Estimation confidentielle par lot'),
  ('mission', 'dce', 13, 'DCE relu et validé par le maître d''ouvrage'),
  ('mission', 'dce', 14, 'Calendrier de consultation : remise des offres, visites de site'),
  ('mission', 'dce', 15, 'DCE mis en ligne ou envoyé aux entreprises consultées'),
  ('mission', 'dce', 16, 'Note d''honoraires de la phase'),
  ('mission', 'act', 1, 'Questions des entreprises répondues, rectificatifs diffusés à toutes'),
  ('mission', 'act', 2, 'Registre des offres reçues'),
  ('mission', 'act', 3, 'Candidatures vérifiées : qualifications, assurance décennale, attestations sociales et fiscales'),
  ('mission', 'act', 4, 'Rapport d''analyse des offres : quantités, omissions, réserves'),
  ('mission', 'act', 5, 'Variantes et options examinées'),
  ('mission', 'act', 6, 'Négociation menée si prévue'),
  ('mission', 'act', 7, 'Tableau des entreprises retenues et montants, comparé à l''estimation'),
  ('mission', 'act', 8, 'Choix du maître d''ouvrage ; lettres aux entreprises retenues et non retenues'),
  ('mission', 'act', 9, 'Mise au point des marchés : pièces réunies, plans rectifiés après variantes'),
  ('mission', 'act', 10, 'Marchés signés par les entreprises et le maître d''ouvrage'),
  ('mission', 'act', 11, 'Marchés diffusés'),
  ('mission', 'act', 12, 'Assurance dommages-ouvrage souscrite par le maître d''ouvrage'),
  ('mission', 'act', 13, 'Entreprises et montants des marchés saisis dans l''app (Entreprises & Lots)'),
  ('mission', 'act', 14, 'Note d''honoraires de la phase'),
  ('mission', 'prepa', 1, 'Ordre de service de démarrage : date et délai'),
  ('mission', 'prepa', 2, 'Déclaration d''ouverture de chantier déposée'),
  ('mission', 'prepa', 3, 'Déclaration préalable à l''inspection du travail (par le maître d''ouvrage)'),
  ('mission', 'prepa', 4, 'Panneau de chantier et affichage du permis'),
  ('mission', 'prepa', 5, 'DT-DICT faites par les entreprises'),
  ('mission', 'prepa', 6, 'Réunion de lancement : pièces du marché, organisation, jour des réunions'),
  ('mission', 'prepa', 7, 'PPSPS des entreprises remis au coordonnateur SPS'),
  ('mission', 'prepa', 8, 'Plan d''installation de chantier'),
  ('mission', 'prepa', 9, 'Constat d''huissier chez les voisins avant travaux'),
  ('mission', 'prepa', 10, 'Calendrier détaillé d''exécution signé par les entreprises'),
  ('mission', 'prepa', 11, 'Planning chantier saisi dans l''app'),
  ('mission', 'prepa', 12, 'Liste des plans d''exécution des entreprises et calendrier de remise'),
  ('mission', 'prepa', 13, 'Circuit de diffusion et de visa des plans'),
  ('mission', 'prepa', 14, 'Compte prorata : convention et gestionnaire désigné'),
  ('mission', 'prepa', 15, 'Réseaux supprimés ou consignés avant démolition'),
  ('mission', 'det', 1, 'Réunions de chantier tenues, comptes rendus diffusés'),
  ('mission', 'det', 2, 'Plans d''exécution des entreprises visés'),
  ('mission', 'det', 3, 'Plans d''architecte tenus à jour'),
  ('mission', 'det', 4, 'Échantillons, prototypes et logement témoin validés'),
  ('mission', 'det', 5, 'Matériaux et coloris confirmés'),
  ('mission', 'det', 6, 'Fondations contrôlées : géotechnique G3 / G4, avis du contrôleur technique'),
  ('mission', 'det', 7, 'Fiches techniques et PV d''essais conformes (DTU, réaction au feu…)'),
  ('mission', 'det', 8, 'Avis du contrôleur technique suivis'),
  ('mission', 'det', 9, 'Situations mensuelles vérifiées'),
  ('mission', 'det', 10, 'Travaux modificatifs : devis, FTM, accord du maître d''ouvrage'),
  ('mission', 'det', 11, 'Bilan financier prévisionnel tenu à jour'),
  ('mission', 'det', 12, 'Révision des prix calculée'),
  ('mission', 'det', 13, 'Avancement comparé au planning, retards notés'),
  ('mission', 'det', 14, 'Pénalités appliquées si besoin'),
  ('mission', 'det', 15, 'Raccordements des concessionnaires demandés et suivis'),
  ('mission', 'det', 16, 'SDIS et commissions consultés si besoin'),
  ('mission', 'det', 17, 'Mise en demeure en cas de défaillance d''une entreprise'),
  ('mission', 'det', 18, 'Compte prorata suivi'),
  ('mission', 'aor', 1, 'Calendrier des opérations préalables à la réception diffusé'),
  ('mission', 'aor', 2, 'Essais avant réception : autocontrôles, Consuel, test d''étanchéité à l''air'),
  ('mission', 'aor', 3, 'Rapport final du contrôleur technique'),
  ('mission', 'aor', 4, 'Commission de sécurité et d''accessibilité (ERP)'),
  ('mission', 'aor', 5, 'PV de réception signé, avec ou sans réserves'),
  ('mission', 'aor', 6, 'Réserves notifiées, délai de levée fixé'),
  ('mission', 'aor', 7, 'Levée des réserves constatée'),
  ('mission', 'aor', 8, 'DOE remis : plans, notices d''entretien et d''utilisation'),
  ('mission', 'aor', 9, 'DIUO remis par le coordonnateur SPS'),
  ('mission', 'aor', 10, 'Clés et matériel de maintenance remis au maître d''ouvrage'),
  ('mission', 'aor', 11, 'DAACT déposée avec les attestations RE2020 et accessibilité'),
  ('mission', 'aor', 12, 'Attestation de non-contestation de la conformité obtenue'),
  ('mission', 'aor', 13, 'Mémoires et décomptes généraux définitifs vérifiés'),
  ('mission', 'aor', 14, 'Compte prorata soldé'),
  ('mission', 'aor', 15, 'Sommes versées récapitulées avec le maître d''ouvrage, solde'),
  ('mission', 'aor', 16, 'Désordres suivis pendant l''année de parfait achèvement'),
  ('mission', 'aor', 17, 'Retenues de garantie et cautions libérées'),
  ('mission', 'aor', 18, 'Dossier de l''affaire archivé'),
  ('mission', 'aor', 19, 'Note d''honoraires finale'),
  ('plans', 'masse', 1, 'Implantation, reculs par rapport aux limites et à l''alignement'),
  ('plans', 'masse', 2, 'Altimétrie NGF : terrain naturel, terrain fini, angles du bâtiment, niveau 0,00'),
  ('plans', 'masse', 3, 'Raccordements : eau, électricité, gaz, télécoms / fibre'),
  ('plans', 'masse', 4, 'Évacuations EU, EV, EP : regards, fils d''eau ; gestion des eaux pluviales'),
  ('plans', 'masse', 5, 'Servitudes existantes'),
  ('plans', 'masse', 6, 'Bâtiments à démolir (pointillés)'),
  ('plans', 'masse', 7, 'Voiries, accès pompiers, stationnement dont PMR, cheminement accessible'),
  ('plans', 'masse', 8, 'Espaces verts ; arbres à conserver, abattre, planter'),
  ('plans', 'masse', 9, 'Clôtures, portails, local déchets, boîtes aux lettres'),
  ('plans', 'sous_sol', 1, 'Locaux et équipements : stationnement, caves, locaux techniques, local déchets, comptages'),
  ('plans', 'sous_sol', 2, 'Nature des murs, sols, plafonds ; parties isolées'),
  ('plans', 'sous_sol', 3, 'Ventilation, prises d''air du vide sanitaire'),
  ('plans', 'sous_sol', 4, 'Réseaux : regards, sections, fils d''eau ; drainage'),
  ('plans', 'sous_sol', 5, 'Cheminement des alimentations jusqu''aux gaines verticales'),
  ('plans', 'sous_sol', 6, 'Accès et passages entre compartiments du vide sanitaire'),
  ('plans', 'sous_sol', 7, 'Portes : nature et degré coupe-feu ; numérotation des caves'),
  ('plans', 'sous_sol', 8, 'Électricité : appareillage, éclairage, éclairage de sécurité'),
  ('plans', 'sous_sol', 9, 'Retombées, pentes, niveaux, cotation'),
  ('plans', 'sous_sol', 10, 'Renvois vers les détails, position des coupes'),
  ('plans', 'rdc', 1, 'Hall, sas, boîtes aux lettres, locaux vélos, locaux communs, commerces'),
  ('plans', 'rdc', 2, 'Nature des murs, sols, plafonds ; isolation'),
  ('plans', 'rdc', 3, 'Gaines techniques'),
  ('plans', 'rdc', 4, 'Accessibilité : cheminements, largeurs de portes, aires de rotation'),
  ('plans', 'rdc', 5, 'Appareillage électrique, points lumineux, émetteurs de chauffage'),
  ('plans', 'rdc', 6, 'Retombées, niveaux, cotation'),
  ('plans', 'rdc', 7, 'Renvois vers les détails, position des coupes'),
  ('plans', 'etages', 1, 'Locaux annexes et communs : celliers, locaux techniques, gaines, escalier, ascenseur'),
  ('plans', 'etages', 2, 'Nom et surface des pièces'),
  ('plans', 'etages', 3, 'Nature des murs, sols, plafonds ; retombées, hauteurs d''allège'),
  ('plans', 'etages', 4, 'Nomenclature des portes'),
  ('plans', 'etages', 5, 'Nomenclature des menuiseries extérieures, occultations et commandes'),
  ('plans', 'etages', 6, 'Appareillage électrique, points lumineux, tableau, prises de communication'),
  ('plans', 'etages', 7, 'Chauffage et eau chaude : émetteurs, générateur, ballon'),
  ('plans', 'etages', 8, 'Sanitaires et gaines : chutes EU / EV / EP, alimentations EF / EC'),
  ('plans', 'etages', 9, 'Ventilation : VMC, entrées d''air'),
  ('plans', 'etages', 10, 'Cuisines et placards équipés'),
  ('plans', 'etages', 11, 'Un plan par étage différent (terrasses, attiques)'),
  ('plans', 'etages', 12, 'Niveaux, cotation, renvois vers les détails, position des coupes'),
  ('plans', 'terrasse', 1, 'Accès et sécurité (garde-corps, lignes de vie)'),
  ('plans', 'terrasse', 2, 'Machinerie d''ascenseur, désenfumage'),
  ('plans', 'terrasse', 3, 'Souches, ventilations de chutes, extracteurs VMC (position, socle)'),
  ('plans', 'terrasse', 4, 'Descentes EP, trop-pleins, pentes'),
  ('plans', 'terrasse', 5, 'Relevés d''étanchéité sur acrotères et émergences'),
  ('plans', 'terrasse', 6, 'Équipements techniques, panneaux photovoltaïques'),
  ('plans', 'terrasse', 7, 'Complexe de toiture en coupe ; niveaux, cotation, détails'),
  ('plans', 'charpente', 1, 'Position et section des pièces de charpente, coupes nécessaires'),
  ('plans', 'charpente', 2, 'Ventilation de la charpente et des combles'),
  ('plans', 'charpente', 3, 'Accès aux combles et entre compartiments'),
  ('plans', 'charpente', 4, 'Isolation thermique'),
  ('plans', 'charpente', 5, 'Conduits et souches : VMC, fumées, ventilations de chutes'),
  ('plans', 'charpente', 6, 'Chéneaux, gouttières, descentes EP'),
  ('plans', 'charpente', 7, 'Relevés et abergements ; cotation, détails'),
  ('plans', 'coupes', 1, 'Hauteurs d''étages, niveaux NGF, épaisseurs des planchers'),
  ('plans', 'coupes', 2, 'Terrain naturel et terrain fini'),
  ('plans', 'coupes', 3, 'Composition des planchers, murs, dallages ; isolation des sous-faces'),
  ('plans', 'coupes', 4, 'Hauteurs de garde-corps et d''allèges'),
  ('plans', 'coupes', 5, 'Coffres de volets, seuils, menuiseries'),
  ('plans', 'coupes', 6, 'Position et sens des coupes reportés sur tous les plans'),
  ('plans', 'facades', 1, 'Planchers en pointillés, terrain naturel'),
  ('plans', 'facades', 2, 'Revêtements et teintes'),
  ('plans', 'facades', 3, 'Menuiseries, occultations, garde-corps et leur remplissage'),
  ('plans', 'facades', 4, 'Éléments non vus en coupe : boîtes aux lettres, éclairage extérieur'),
  ('plans', 'facades', 5, 'Rendu si utile'),
  ('plans', 'details', 1, 'Garde-corps, mains courantes, escaliers'),
  ('plans', 'details', 2, 'Tous les détails nécessaires à la compréhension du projet'),
  ('plans', 'reglementaire', 1, 'Acoustique'),
  ('plans', 'reglementaire', 2, 'Thermique RE2020 et étanchéité à l''air'),
  ('plans', 'reglementaire', 3, 'Ventilation'),
  ('plans', 'reglementaire', 4, 'Électricité'),
  ('plans', 'reglementaire', 5, 'Sécurité incendie : dégagements, désenfumage, degrés coupe-feu'),
  ('plans', 'reglementaire', 6, 'Accessibilité : logements, parties communes, ascenseur (passage du brancard)'),
  ('plans', 'reglementaire', 7, 'Garde-corps et fenêtres basses');
  end if;
end $$;

-- L'ancienne table de la migration 001, jamais utilisée : retirée si vide
-- (requête dynamique : nommée en clair, la table déjà retirée ferait échouer
-- le rejeu de la migration)
do $$
declare vide boolean;
begin
  if to_regclass('public.todos') is not null then
    execute 'select not exists (select 1 from public.todos)' into vide;
    if vide then drop table public.todos; end if;
  end if;
end $$;

notify pgrst, 'reload schema';
