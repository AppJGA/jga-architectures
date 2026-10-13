# Carnet d'adresses : plusieurs interlocuteurs par organisation — conception

Validée avec l'agence le 2026-10-13.

## 1. Le besoin

Une même entreprise, un même bureau d'études ou un même maître d'ouvrage
intervient sur plusieurs affaires, mais pas toujours par la même personne.
Le carnet doit :

- tenir **plusieurs personnes par organisation**, gérées depuis la fiche de
  l'organisation ;
- laisser **chaque affaire choisir sa personne** : représentant d'un lot,
  contact de l'affaire (MOA, BET, contrôleur, CSPS…) ;
- **montrer où chaque personne intervient** (affaire et rôle), et pour une
  organisation toutes ses affaires, MOA et BET compris.

## 2. Ce qui existe (relevé du 2026-10-13)

- `entreprises` (migration 005) : fiche d'organisation, sans type.
  `interlocuteurs` : une personne appartient à une organisation
  (`entreprise_id`, en cascade). La base permet déjà plusieurs personnes par
  organisation ; l'écran du carnet ne permet pas de les gérer (il n'édite
  que la fiche).
- `lot_entreprises` : une entreprise et un représentant par lot
  (`interlocuteur_id`, lien par identifiant, sans `on delete`). Le
  représentant se crée ou se modifie (`InterlocuteurFormModal`), mais ne se
  **choisit** pas parmi les personnes connues.
- `affaire_interlocuteurs` (migration 016) : contacts de l'affaire par
  catégorie (`moa`, `moe`, `be`, `ct`, `csps`, `administration`, `autre`),
  **copiés** depuis le carnet (`RechercheCarnet`, `remplirDepuis`) sans lien ;
  `entreprise_id` existe mais n'est jamais écrit. Présences et remarques des
  comptes rendus visent ces lignes : la copie est l'historique.
- Le carnet ne compte les affaires d'une organisation que par les lots
  (`getUniqueAffaires`), rien pour une personne.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Lien | Un contact d'affaire est **relié par identifiant** à sa personne du carnet (`affaire_interlocuteurs.interlocuteur_id`, et `entreprise_id` renseigné). Deviner par les noms à l'affichage casse au moindre écart. |
| Copie | Les champs copiés restent : c'est ce qui s'affiche et s'imprime. Modifier une personne du carnet **ne modifie pas** les affaires. « Mettre aussi à jour le carnet » (sens affaire → carnet) reste tel quel. |
| Type d'organisation | `entreprises.type` : `entreprise`, `bet`, `moa`, `autre`. Déduit une fois : attributaire d'un lot → entreprise ; contact `be` → bet ; contact `moa` → moa ; sinon autre (premier rôle trouvé dans cet ordre : lot, be, moa). Modifiable sur la fiche. Filtre en tête du carnet. |
| Reprise | Un contact d'affaire existant est relié si prénom + nom + organisation retrouvent **une seule** personne du carnet (sans majuscules, accents ni espaces superflus). Sinon il reste non relié ; on le relie en le choisissant à nouveau. |
| Lots | En attribuant une entreprise à un lot : menu « Interlocuteur » (personnes de cette entreprise + « Nouvelle personne… »). Vaut pour ce lot de cette affaire seulement. |
| Suppression d'une personne | Refusée tant qu'elle est représentant d'un lot ou reliée à un contact d'affaire : la fenêtre liste ces affaires. Sinon, supprimée. Un contact d'affaire dont la personne disparaît (suppression de l'organisation) garde sa copie, lien remis à vide. |
| Maître d'ouvrage de la fiche d'affaire (`moa_*`) | Hors de ce chantier : il reste du texte. |
| Extérieurs | Le carnet leur reste fermé ; rien ne change à leurs règles. |

## 4. Base (migration 072)

- `alter table entreprises add column if not exists type text not null
  default 'autre' check (type in ('entreprise','bet','moa','autre'))`, puis
  la déduction (mise à jour d'après `lot_entreprises` et
  `affaire_interlocuteurs.categorie` via les personnes reliées après la
  reprise, et via l'organisation copiée quand elle retrouve une seule fiche).
- `alter table affaire_interlocuteurs add column if not exists
  interlocuteur_id uuid references interlocuteurs(id) on delete set null` ;
  index sur `interlocuteur_id` et `entreprise_id`.
- `lot_entreprises.interlocuteur_id` : la contrainte devient `on delete set
  null` (sinon supprimer une organisation échoue sur ses représentants) ;
  la suppression d'une personne utilisée reste refusée **par l'écran**.
- Reprise des contacts existants en SQL : comparaison
  `lower(regexp_replace(trim(x), '\s+', ' ', 'g'))` sur prénom, nom et
  organisation (raison sociale), accents retirés par `translate` (pas
  d'extension `unaccent` supposée) ; relié seulement si une seule personne
  correspond ; `entreprise_id` renseigné en même temps.
- Règles : aucune nouvelle table. `entreprises` et `interlocuteurs` gardent
  leurs règles (agence ; lecture des extérieurs limitée par la 050).
- Rejouable. Sans la migration, l'app tolère l'absence des colonnes
  (`type`, `interlocuteur_id`) : écriture retentée sans elles, filtre par
  type masqué.

## 5. Écrans

**Carnet** (`src/pages/CarnetAdressesPage.jsx`)

- Filtre par type (Toutes, Entreprises, Bureaux d'études, Maîtres
  d'ouvrage, Autres) à côté des filtres actuels ; type affiché sur la carte
  et la ligne, choisi dans la fenêtre de la fiche.
- Fiche d'une organisation : toutes ses personnes, « + Ajouter une
  personne », crayon et corbeille par personne (prénom, nom, fonction,
  téléphone, e-mail, principal). Fenêtre fermée par ✕, Annuler, Échap
  seulement.
- Sous chaque personne : ses affaires et son rôle — « 2618-LVV ·
  représentant lot 02 Gros œuvre », « 2521-SGP · Bureau d'études » — avec
  lien vers l'affaire.
- Organisation : toutes ses affaires, par les lots et par les contacts
  d'affaire reliés (à elle ou à une de ses personnes).

**Lots d'une affaire** (`src/modules/chantier/lots-entreprises/`)

- `EntrepriseAssignModal` : menu « Interlocuteur » des personnes de
  l'entreprise choisie, + « Nouvelle personne… » (ouvre
  `InterlocuteurFormModal`, qui crée et sélectionne).

**Contacts de l'affaire** (`InterlocuteursEditeur`, `RechercheCarnet`,
`carnet.js`)

- Choisir une personne dans la recherche remplit le formulaire et garde
  `interlocuteur_id` / `entreprise_id` ; choisir une organisation seule
  garde `entreprise_id`. Modifier ensuite les champs à la main garde le
  lien (la copie diverge, c'est le cas « Mettre aussi à jour le carnet »).
- « Ajouter au carnet d'adresses » (`verserAuCarnet`) relie le contact à la
  personne créée ou retrouvée.
- Un contact retrouvé par valeurs (`chercherDansCarnet`) et encore non
  relié est relié à l'enregistrement.

## 6. Logique pure (testée)

`src/pages/carnetLiensLogique.js` (ou à côté de `carnetLogique.js`) :

- `affairesDePersonne(personneId, { lots, contacts })` et
  `affairesDOrganisation(entrepriseId, { lots, contacts, personnes })` →
  `[{ affaire, role, libelle }]`, triées, sans doublon ;
- `personneSupprimable(personneId, usages)` ;
- `typeDeduit(entreprise, { lots, contacts })` ;
- `libelleType(type)`, `TYPES_ORGANISATION`.

La reprise est en SQL ; la même règle de comparaison (`cleComparaison`) est
dupliquée en JS pour le lien à l'enregistrement — modifier les deux
ensemble.

## 7. Hors de ce chantier

- Le maître d'ouvrage de la fiche d'affaire (`affaires.moa_*`).
- Mettre à jour les affaires depuis le carnet.
- Fusionner deux fiches d'organisation en double.

## 8. Mise en service

1. Passer `supabase/migrations/072_carnet_interlocuteurs.sql`.
2. Vérifier dans le carnet le type déduit des organisations et les liens
   repris (affaires sous chaque personne) ; corriger à la main ce qui reste.
