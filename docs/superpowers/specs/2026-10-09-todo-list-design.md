# To-do list d'une affaire — conception

Validée avec l'agence le 2026-10-09 (liste à relire, section 7).

## 1. Le besoin

Pour une phase donnée, pouvoir vérifier que **tout ce qu'il y a à faire** a été
fait, et le cocher. La base est la fiche « Contrôle d'avancement des études et
de la direction des travaux » (Dossiers pratiques d'Architectes, dossier n° 6,
années 1980 — carnet de bord de l'agence, pages 13 à 20), remise aux
dénominations actuelles (loi MOP, CCAG Travaux, RE2020…), et la liste
« Indications devant figurer dans les plans d'exécution » (pages 21 à 23).

Trois usages :

1. **Mission** : la liste type de l'agence, phase par phase, de l'engagement
   à la clôture.
2. **Quotidien** : les tâches courantes d'une affaire (« Reprendre la façade
   nord suite à la réunion MOA ») — savoir si une modification a été faite,
   par qui et quand.
3. **Contenu des plans** : vérifier un jeu de plans avant de le diffuser.

Chaque liste, phase ou tâche se **partage par un lien** aux collaborateurs de
l'affaire.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Périmètre | **Toute la mission** : Engagement, ESQ, APS, APD et PC, PRO, DCE, ACT, Préparation de chantier, DET, AOR et clôture. Module visible dans la partie Étude **et** la partie Chantier de l'affaire. |
| Liste type | **Enregistrée dans Supabase**, remplie au départ par la migration 066 avec la liste de la section 7, puis modifiable dans l'app (ajouter, renommer, réordonner, supprimer). Rien de la liste dans le code. |
| Phases et rubriques | Fixées dans le code (`todoLogique.js`) : ce sont les cases où se rangent les articles, pas des articles. |
| Ajout depuis une affaire | À l'affaire seule, ou aussi à la liste type (case « Ajouter aussi à la liste type de l'agence »). |
| Article inutile pour une affaire | « Sans objet » : grisé, ne compte plus. |
| Suppression d'un article de la liste type | Disparaît de toutes les affaires, **sauf** là où il était coché, annoté ou « sans objet » : il y reste, grisé, avec la mention « retiré de la liste type ». Suppression douce (`supprime_le`), jamais d'effacement de ligne. |
| Tâche du quotidien | Texte + personne chargée (collaborateur de l'affaire) + échéance facultative + note. |
| Coche | Note **qui** a coché et **quand** (« Fait par Victor le 09/10 »), pour toute liste. |
| Partage | Lien copié (liste, phase ou tâche), ouvert **après connexion**. Collaborateurs de l'affaire : cochent. Autres comptes de l'agence : lecture seule (règle de la migration 060). Intervenants extérieurs : rien. |
| Contenu des plans | Une liste par affaire ; « Recommencer la vérification » décoche tout (après confirmation) pour l'indice suivant. |
| Ancienne table `todos` (001) | Jamais utilisée : supprimée par la migration **si elle est vide**. |

## 3. À l'écran

Module `src/modules/etude/todo/` (remplace la page d'attente), déclaré dans
les deux phases du manifeste, même `path` (`todo`).

En tête, trois onglets : **Mission**, **Quotidien**, **Contenu des plans**, et
à droite « Modifier la liste type » (agence) et l'icône de lien.

**Mission**

- Une rangée de phases (pastilles avec compteur « 12 / 18 », verte quand tout
  est fait). La phase ouverte par défaut se déduit de la phase de l'affaire
  (section 5).
- Chaque article : case, texte, et dessous « Fait par Victor le 09/10 » ;
  menu ⋯ : note, sans objet, copier le lien, supprimer (article propre à
  l'affaire seulement).
- « + Ajouter un article » en fin de phase.
- Les articles grisés (sans objet, retirés de la liste type) en bas de la phase.

**Quotidien**

- Champ d'ajout rapide en tête (texte, Entrée), puis personne et échéance
  facultatives.
- Tâches à faire d'abord (en retard en rouge), puis les faites, repliées, avec
  qui et quand.
- Filtre « Mes tâches » (personne chargée = moi).

**Contenu des plans**

- Rubriques (plan masse, sous-sol, étages…) dépliables, compteur par rubrique.
- « Recommencer la vérification » en bas.

**Modifier la liste type** (fenêtre, agence seule) : choix de la liste et de
la phase / rubrique, articles dans l'ordre, renommer en place, glisser pour
réordonner, ajouter, supprimer (avec rappel : « reste visible dans les
affaires où il était coché »).

**Tuile du tableau de bord** : compteur de la phase en cours et nombre de
tâches du quotidien en retard.

Fenêtres : jamais fermées au clic à côté (règle de l'agence). Lecture seule :
`ZoneConsultation` et boutons masqués, comme les autres modules.

## 4. Données (migration 066)

```
todo_modele                        -- liste type, commune à l'agence
  id uuid pk default gen_random_uuid()
  liste text check (liste in ('mission','plans'))
  groupe text not null             -- code de phase (mission) ou de rubrique (plans)
  texte text not null
  ordre integer not null
  supprime_le timestamptz          -- suppression douce
  created_by uuid default auth.uid(), created_at timestamptz default now()

todo_elements                      -- tout ce qui appartient à une affaire
  id uuid pk default gen_random_uuid()
  affaire_id uuid not null references affaires on delete cascade
  type text check (type in ('modele','article','tache'))
  modele_id uuid references todo_modele   -- type 'modele' : état d'un article type
  liste text, groupe text, texte text     -- type 'article' (et 'tache' : texte)
  responsable_id uuid references auth.users, echeance date   -- type 'tache'
  fait_le timestamptz, fait_par uuid references auth.users
  sans_objet boolean default false, note text
  ordre integer
  created_by uuid default auth.uid(), created_at, updated_at
  unique (affaire_id, modele_id)
```

- Un article type n'a de ligne dans une affaire **que lorsqu'on y touche**
  (coche, note, sans objet) : `upsert` sur `(affaire_id, modele_id)`. Une
  affaire neuve ne recopie rien.
- Droits : `todo_modele` lu et écrit par `est_agence()` ; `todo_elements`
  par `est_agence()`, plus les règles **restrictives** d'écriture
  `peut_modifier_affaire(affaire_id)` (bloc de la migration 060).
- La migration insère la liste de la section 7 (`liste`, `groupe`, `texte`,
  `ordre`), puis retire `todos` si elle est vide.
- Sans la migration : le module affiche « La to-do list n'est pas encore
  installée » au lieu d'une erreur.

## 5. Logique pure (`todoLogique.js`, `tests/todo.test.js`)

- `PHASES_MISSION`, `RUBRIQUES_PLANS` : codes, libellés, ordre.
- `articlesAffiches(modele, elements)` : fusion liste type + état de
  l'affaire + articles propres ; retire les articles supprimés jamais touchés,
  garde grisés ceux qui l'ont été.
- `compteur(articles)` : faits / à faire, hors sans objet.
- `phaseParDefaut(phaseAffaire, compteurs)` : esq → Engagement puis ESQ ;
  avp → APS puis APD ; pro → PRO ; dce → DCE puis ACT ; chantier →
  Préparation puis DET ; livree → AOR. La première de ces phases qui a encore
  quelque chose à faire ; sinon la dernière.
- `tachesTriees(taches, aujourdhui)` : à faire (retard d'abord, puis par
  échéance), puis faites (plus récentes d'abord) ; `enRetard`.
- `lienPartage(origine, affaireId, { onglet, phase, tache })` et sa lecture.

## 6. Partage par lien

Adresse : `/affaires/<id>/todo?onglet=mission&phase=apd` ou
`…?onglet=quotidien&tache=<id>` (la tâche est mise en évidence et amenée à
l'écran). Copiée par `navigator.clipboard`, avec un avis « Lien copié ». La
page de connexion ramène à l'adresse demandée (à vérifier dans
`RequireAuth` au moment du plan).

## 7. La liste réécrite — à relire

Légende : *(nouveau)* = absent de la fiche d'origine ; entre crochets, le
numéro de la fiche d'origine.

### 7.1 Mission

**Engagement**

1. Fiche de l'affaire renseignée : maître d'ouvrage, interlocuteurs, adresse du terrain [0]
2. Programme et enveloppe financière du maître d'ouvrage recueillis [0, 1.2]
3. Proposition d'honoraires envoyée [0]
4. Contrat de maîtrise d'œuvre signé : mission, phases, honoraires, délais [1.10]
5. Contrat déclaré à l'Ordre, attestation d'assurance jointe [1.10]
6. Équipe de maîtrise d'œuvre constituée (BET structure, fluides, thermique, économiste, acousticien…) [1.9]
7. Contrats de cotraitance ou sous-traitance signés, missions et honoraires répartis [1.10]
8. Budget des études et planning d'étude établis (suivi financier et planning de l'app) [1.12]

**ESQ — Esquisse**

1. Visite du terrain et reportage photo [1.1]
2. Relevé de géomètre commandé : topographie, altimétrie, limites [1.4, 2.7]
3. Règles d'urbanisme analysées : PLU(i), hauteur, reculs, emprise, stationnement, espaces verts [1.5]
4. Servitudes recherchées (droit privé et utilité publique) [1.3]
5. Certificat d'urbanisme demandé si utile [1.7]
6. Contraintes du site vérifiées : risques (PPR, argiles), ABF, archéologie préventive *(nouveau)*
7. Étude géotechnique G1 demandée au maître d'ouvrage [1.6] *(loi ELAN)*
8. Diagnostics de l'existant demandés en réhabilitation : amiante, plomb, structure *(nouveau)*
9. Programme précisé avec le maître d'ouvrage [1.2, 1.8]
10. Esquisses et plan masse [1.11]
11. Tableau des surfaces : surface de plancher, SHAB, emprise au sol [1.8]
12. Estimation sommaire comparée à l'enveloppe [1.8]
13. Assurance dommages-ouvrage et contrôle technique rappelés au maître d'ouvrage [1.13, 1.14]
14. Esquisse présentée et validée par écrit par le maître d'ouvrage [1.15]
15. Note d'honoraires de la phase [1.16]

**APS — Avant-projet sommaire**

1. Concessionnaires consultés : eau, assainissement, Enedis, GRDF, télécoms / fibre, réseau de chaleur [2.1]
2. Gestion des eaux pluviales à la parcelle étudiée *(nouveau)*
3. Rendez-vous préalables : service urbanisme, ABF, SDIS, accessibilité, gestionnaire de voirie [2.2]
4. Compte rendu de chaque rendez-vous diffusé [2.3]
5. Accord de principe de l'urbanisme sur le plan masse [2.4, 2.5]
6. Contrôleur technique désigné par le maître d'ouvrage, missions définies [2.17, 3.3]
7. Coordonnateur SPS désigné par le maître d'ouvrage [3.28]
8. Étude géotechnique G2 AVP commandée [2.6]
9. Voisins : état des mitoyens, mitoyenneté, clôtures, servitudes [2.10]
10. Démolition : permis de démolir prévu, diagnostics amiante / plomb / déchets (PEMD) [2.9]
11. Encombrements techniques donnés par les BET [2.13]
12. Pré-étude thermique RE2020 *(nouveau)*
13. Principe de fondations et de structure [2.15]
14. Plans APS : plans, coupes, façades, insertion [2.16]
15. Notice descriptive et estimation sommaires [2.18]
16. Planning prévisionnel de l'opération
17. APS validé par écrit par le maître d'ouvrage [2.14]
18. Note d'honoraires de la phase [2.21]

**APD et PC — Avant-projet définitif et permis de construire**

1. Programme définitif accepté par le maître d'ouvrage [2.12]
2. Accord du maître d'ouvrage sur surfaces, volumes, fonctionnement, façades et coût [3.2]
3. Plans APD, surfaces et numéros des locaux [3.21]
4. Tableau des surfaces définitif [3.22]
5. Matériaux, coloris et perspectives acceptés par le maître d'ouvrage [3.25]
6. Estimation par lot comparée à l'enveloppe [2.18]
7. Étude thermique RE2020 et attestation pour le dépôt du PC *(nouveau)*
8. Notices accessibilité et sécurité incendie (ERP) [2.2]
9. Dossier de permis complet, signé par le maître d'ouvrage [2.19]
10. PC (et permis de démolir) déposé, récépissé et date de fin d'instruction notés [2.19, 2.9]
11. Pièces complémentaires fournies dans le délai *(nouveau)*
12. Permis obtenu, affichage constaté, recours des tiers purgé *(nouveau)*
13. Prescriptions du permis reportées dans le projet [3.23]
14. Note d'honoraires de la phase

**PRO — Projet**

1. Planning des études PRO et DCE établi et suivi [3.1]
2. Contrats des BET complémentaires selon les besoins (acoustique, VRD, cuisine…) [3.9]
3. Étude géotechnique G2 PRO [3.6]
4. Plan de géomètre détaillé et plan des réseaux existants [3.7]
5. Raccordements arrêtés avec les concessionnaires [3.5]
6. Accès pompiers et voirie validés [3.4]
7. Fondations et structure arrêtées [3.10, 3.11]
8. Liste des lots arrêtée [3.12]
9. Liste des plans à produire et échelles [3.13]
10. Plans VRD, espaces verts et réseaux [3.13]
11. Plans des BET reçus et intégrés [3.15]
12. Détails à grande échelle : façades, étanchéité, menuiseries, logement type [3.8, 3.17]
13. Plans vérifiés avec la liste « Contenu des plans » : cartouches, légendes, indices [3.19, 3.20]
14. Notice descriptive détaillée acceptée par le maître d'ouvrage [3.26]
15. Estimation détaillée par lot [3.34]
16. Observations du contrôleur technique traitées [5.7]
17. Accord des assureurs sur les procédés non courants [5.20]
18. PRO validé par écrit par le maître d'ouvrage
19. Note d'honoraires de la phase [3.35]

**DCE — Dossier de consultation des entreprises**

1. Mode de dévolution arrêté : lots séparés, entreprise générale, groupement ; procédure [3.27]
2. Limites de prestations entre lots [3.28]
3. Règlement de la consultation : critères, délai, variantes [4.5]
4. Acte d'engagement *(nouveau)*
5. CCAP : délais, pénalités, révision des prix, retenue de garantie [3.30, 5.9]
6. CCTP par lot [3.28]
7. DPGF ou cadre de bordereau par lot [4.5, 3.31]
8. PGC du coordonnateur SPS joint [3.28]
9. Rapport initial du contrôleur technique joint *(nouveau)*
10. Étude de sol et diagnostics joints *(nouveau)*
11. Planning prévisionnel des travaux joint [5.8]
12. Estimation confidentielle par lot [3.34]
13. DCE relu et validé par le maître d'ouvrage [3.33]
14. Calendrier de consultation : remise des offres, visites de site [4.5]
15. DCE mis en ligne ou envoyé aux entreprises consultées [3.32, 3.33]
16. Note d'honoraires de la phase

**ACT — Assistance pour la passation des marchés**

1. Questions des entreprises répondues, rectificatifs diffusés à toutes [4.6]
2. Registre des offres reçues [4.7]
3. Candidatures vérifiées : qualifications, assurance décennale, attestations sociales et fiscales [3.27]
4. Rapport d'analyse des offres : quantités, omissions, réserves [4.8, 4.11]
5. Variantes et options examinées [4.10]
6. Négociation menée si prévue *(nouveau)*
7. Tableau des entreprises retenues et montants, comparé à l'estimation [4.12, 4.13]
8. Choix du maître d'ouvrage ; lettres aux entreprises retenues et non retenues [4.14, 4.15]
9. Mise au point des marchés : pièces réunies, plans rectifiés après variantes [5.1, 5.2]
10. Marchés signés par les entreprises et le maître d'ouvrage [5.16]
11. Marchés diffusés [5.17]
12. Assurance dommages-ouvrage souscrite par le maître d'ouvrage [5.12, 5.13]
13. Entreprises et montants des marchés saisis dans l'app (Entreprises & Lots) *(nouveau)*
14. Note d'honoraires de la phase [5.22]

**Préparation de chantier**

1. Ordre de service de démarrage : date et délai [5.18]
2. Déclaration d'ouverture de chantier déposée [6.6]
3. Déclaration préalable à l'inspection du travail (par le maître d'ouvrage) [6.6]
4. Panneau de chantier et affichage du permis *(nouveau)*
5. DT-DICT faites par les entreprises [6.5]
6. Réunion de lancement : pièces du marché, organisation, jour des réunions [6.2]
7. PPSPS des entreprises remis au coordonnateur SPS [6.3]
8. Plan d'installation de chantier [6.14]
9. Constat d'huissier chez les voisins avant travaux [6.27]
10. Calendrier détaillé d'exécution signé par les entreprises [6.8, 6.10]
11. Planning chantier saisi dans l'app *(nouveau)*
12. Liste des plans d'exécution des entreprises et calendrier de remise [6.15]
13. Circuit de diffusion et de visa des plans [6.2]
14. Compte prorata : convention et gestionnaire désigné [6.42]
15. Réseaux supprimés ou consignés avant démolition [6.5, 6.28]

**DET — Direction de l'exécution des travaux**

1. Réunions de chantier tenues, comptes rendus diffusés [6.20, 6.33]
2. Plans d'exécution des entreprises visés [6.30]
3. Plans d'architecte tenus à jour [6.13, 6.31]
4. Échantillons, prototypes et logement témoin validés [6.35 à 6.39]
5. Matériaux et coloris confirmés [6.40]
6. Fondations contrôlées : géotechnique G3 / G4, avis du contrôleur technique [6.26]
7. Fiches techniques et PV d'essais conformes (DTU, réaction au feu…) [6.29, 6.32]
8. Avis du contrôleur technique suivis
9. Situations mensuelles vérifiées [6.21]
10. Travaux modificatifs : devis, FTM, accord du maître d'ouvrage [6.22]
11. Bilan financier prévisionnel tenu à jour [6.22]
12. Révision des prix calculée [6.23]
13. Avancement comparé au planning, retards notés [6.19, 6.44]
14. Pénalités appliquées si besoin [6.44, 6.45]
15. Raccordements des concessionnaires demandés et suivis [6.24]
16. SDIS et commissions consultés si besoin [6.25]
17. Mise en demeure en cas de défaillance d'une entreprise [6.43]
18. Compte prorata suivi [6.46]

**AOR et clôture**

1. Calendrier des opérations préalables à la réception diffusé [7.2]
2. Essais avant réception : autocontrôles, Consuel, test d'étanchéité à l'air *(nouveau)*
3. Rapport final du contrôleur technique [7.8]
4. Commission de sécurité et d'accessibilité (ERP) [7.9]
5. PV de réception signé, avec ou sans réserves [7.12]
6. Réserves notifiées, délai de levée fixé [7.11, 7.13]
7. Levée des réserves constatée [7.23]
8. DOE remis : plans, notices d'entretien et d'utilisation [7.5, 7.12]
9. DIUO remis par le coordonnateur SPS *(nouveau)*
10. Clés et matériel de maintenance remis au maître d'ouvrage [7.6, 7.7]
11. DAACT déposée avec les attestations RE2020 et accessibilité [7.14, 7.15]
12. Attestation de non-contestation de la conformité obtenue [7.15]
13. Mémoires et décomptes généraux définitifs vérifiés [7.16, 7.18]
14. Compte prorata soldé [7.18, 7.20]
15. Sommes versées récapitulées avec le maître d'ouvrage, solde [7.21]
16. Désordres suivis pendant l'année de parfait achèvement *(nouveau)*
17. Retenues de garantie et cautions libérées [7.23]
18. Dossier de l'affaire archivé [7.24]
19. Note d'honoraires finale [7.22]

Retirés de la fiche d'origine : réservation de ligne téléphonique (4.1),
fiche statistique d'agence (2.20, 5.21, 7.19), dessin à 0,02 et « dessous »
(3.14, 3.17, 3.18), calendrier d'appartement témoin (6.11), ligne polygonale
(6.19), comités de gestion du prorata trimestriels (6.46, fondu dans
« Compte prorata suivi »).

### 7.2 Contenu des plans

**Plan masse**

1. Implantation, reculs par rapport aux limites et à l'alignement
2. Altimétrie NGF : terrain naturel, terrain fini, angles du bâtiment, niveau 0,00
3. Raccordements : eau, électricité, gaz, télécoms / fibre
4. Évacuations EU, EV, EP : regards, fils d'eau ; gestion des eaux pluviales
5. Servitudes existantes
6. Bâtiments à démolir (pointillés)
7. Voiries, accès pompiers, stationnement dont PMR, cheminement accessible
8. Espaces verts ; arbres à conserver, abattre, planter
9. Clôtures, portails, local déchets, boîtes aux lettres

**Sous-sol et vide sanitaire**

1. Locaux et équipements : stationnement, caves, locaux techniques, local déchets, comptages
2. Nature des murs, sols, plafonds ; parties isolées
3. Ventilation, prises d'air du vide sanitaire
4. Réseaux : regards, sections, fils d'eau ; drainage
5. Cheminement des alimentations jusqu'aux gaines verticales
6. Accès et passages entre compartiments du vide sanitaire
7. Portes : nature et degré coupe-feu ; numérotation des caves
8. Électricité : appareillage, éclairage, éclairage de sécurité
9. Retombées, pentes, niveaux, cotation
10. Renvois vers les détails, position des coupes

**Rez-de-chaussée**

1. Hall, sas, boîtes aux lettres, locaux vélos, locaux communs, commerces
2. Nature des murs, sols, plafonds ; isolation
3. Gaines techniques
4. Accessibilité : cheminements, largeurs de portes, aires de rotation
5. Appareillage électrique, points lumineux, émetteurs de chauffage
6. Retombées, niveaux, cotation
7. Renvois vers les détails, position des coupes

**Étages**

1. Locaux annexes et communs : celliers, locaux techniques, gaines, escalier, ascenseur
2. Nom et surface des pièces
3. Nature des murs, sols, plafonds ; retombées, hauteurs d'allège
4. Nomenclature des portes
5. Nomenclature des menuiseries extérieures, occultations et commandes
6. Appareillage électrique, points lumineux, tableau, prises de communication
7. Chauffage et eau chaude : émetteurs, générateur, ballon
8. Sanitaires et gaines : chutes EU / EV / EP, alimentations EF / EC
9. Ventilation : VMC, entrées d'air
10. Cuisines et placards équipés
11. Un plan par étage différent (terrasses, attiques)
12. Niveaux, cotation, renvois vers les détails, position des coupes

**Toiture terrasse**

1. Accès et sécurité (garde-corps, lignes de vie)
2. Machinerie d'ascenseur, désenfumage
3. Souches, ventilations de chutes, extracteurs VMC (position, socle)
4. Descentes EP, trop-pleins, pentes
5. Relevés d'étanchéité sur acrotères et émergences
6. Équipements techniques, panneaux photovoltaïques *(nouveau)*
7. Complexe de toiture en coupe ; niveaux, cotation, détails

**Charpente et couverture**

1. Position et section des pièces de charpente, coupes nécessaires
2. Ventilation de la charpente et des combles
3. Accès aux combles et entre compartiments
4. Isolation thermique
5. Conduits et souches : VMC, fumées, ventilations de chutes
6. Chéneaux, gouttières, descentes EP
7. Relevés et abergements ; cotation, détails

**Coupes**

1. Hauteurs d'étages, niveaux NGF, épaisseurs des planchers
2. Terrain naturel et terrain fini
3. Composition des planchers, murs, dallages ; isolation des sous-faces
4. Hauteurs de garde-corps et d'allèges
5. Coffres de volets, seuils, menuiseries
6. Position et sens des coupes reportés sur tous les plans

**Façades**

1. Planchers en pointillés, terrain naturel
2. Revêtements et teintes
3. Menuiseries, occultations, garde-corps et leur remplissage
4. Éléments non vus en coupe : boîtes aux lettres, éclairage extérieur
5. Rendu si utile

**Détails**

1. Garde-corps, mains courantes, escaliers
2. Tous les détails nécessaires à la compréhension du projet

**Contrôles réglementaires**

1. Acoustique
2. Thermique RE2020 et étanchéité à l'air
3. Ventilation
4. Électricité
5. Sécurité incendie : dégagements, désenfumage, degrés coupe-feu
6. Accessibilité : logements, parties communes, ascenseur (passage du brancard)
7. Garde-corps et fenêtres basses

## 8. Hors champ

- Coche automatique d'après les autres modules (PC déposé d'après un jalon,
  CR émis…) : piste pour plus tard.
- Accès sans compte et accès des intervenants extérieurs.
- Historique des passages de « Contenu des plans ».
