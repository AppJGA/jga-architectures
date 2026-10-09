# Gestion d'agence — conception

Validée avec l'agence le 2026-10-09.

## 1. Le besoin

Un espace réservé aux **associés** de l'agence, ouvert depuis l'accueil par
une 4e bulle « Gestion d'agence ». Il réunit des outils de pilotage ; deux
pour commencer :

1. **Calendrier des rendus** : tous les jalons des plannings de toutes les
   affaires, dans un calendrier par mois, pour voir les prochaines échéances.
2. **Suivi des tâches** : les tâches « À faire » (to-do list, onglet
   `quotidien`) de toutes les affaires, avec la possibilité d'en ajouter.

D'autres outils s'ajouteront au fur et à mesure.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Qui est associé | Colonne `profiles.est_associe` (migration 067). Premiers associés désignés dans l'éditeur SQL de Supabase (aucun nom dans le dépôt, public) ; ensuite, page « Associés » de Gestion d'agence. Seul un associé (ou l'éditeur SQL) change la case. |
| Accès | Bulle visible des seuls associés ; routes `/gestion-agence/*` gardées par `AssocieSeul` (renvoi à l'accueil). Les données lues (jalons, tâches) restent celles que toute l'agence lit déjà : rien de secret n'est ajouté à la base. `est_associe()` est créée pour les outils futurs qui en auront besoin. |
| Structure | Comme la Boîte à outils : page d'accueil à tuiles, outils déclarés dans `src/gestion/manifest.js`. |
| Notion | L'envoi vers Notion reste prévu, plus tard ; le calendrier de l'app ne le remplace pas. |
| Jalon d'étude | Placé **le vendredi** de sa semaine ISO, marqué « S42 ». |
| Jalon de chantier | À sa date. |
| Portée | Toutes les affaires, filtre « Mes affaires ». Écriture (cocher, ajouter une tâche) réservée aux affaires modifiables par l'associé (`peut_modifier_affaire`, migration 060) : les autres se lisent seulement. |

## 3. Écrans

**Accueil** : bulle 04 « Gestion d'agence » (`associe: true` dans `MODULES`),
filtrée par `estAssocie`.

**`/gestion-agence`** : en-tête, tuiles des outils (calendrier, tâches,
associés).

**Calendrier des rendus** (`/gestion-agence/calendrier`)

- Grille du mois, lundi en premier, semaines complètes (jours des mois
  voisins pâlis) ; « ‹ », « Aujourd'hui », « › ». Aujourd'hui entouré.
- Dans chaque jour : les jalons (pastille de sa couleur, code de l'affaire,
  libellé ; « S42 » pour l'étude). Au-delà de 3, « + n ».
- À droite (dessous sur tablette en portrait) : **prochaines échéances**,
  30 jours à partir d'aujourd'hui, la plus proche en tête, avec « dans 3 j ».
- Filtres : « Mes affaires » / « Toutes » ; « Étude », « Chantier ».
- Clic sur un jalon : planning de son affaire (`planning-etude` ou
  `planning-chantier`).

**Suivi des tâches** (`/gestion-agence/taches`)

- Groupes par affaire (code et nom, lien vers sa to-do list), groupes ayant
  des retards en tête ; dans un groupe, l'ordre de `tachesTriees`.
- Filtres : « Mes affaires », personne chargée, « En retard seulement ».
- Case à cocher (« Fait par … le … ») et ajout (affaire parmi les
  modifiables, texte, personne, échéance) par les fonctions de
  `todoDonnees.js`. Affaire non modifiable : cases désactivées, mention
  « Lecture seule ».

**Associés** (`/gestion-agence/associes`) : comptes de l'agence, interrupteur
« Associé » ; on ne peut pas se retirer soi-même (éviter de perdre l'accès
par erreur).

## 4. Données (migration 067)

- `profiles.est_associe boolean not null default false`.
- `est_associe()` : `security definer`, comme `est_agence()`.
- Déclencheur sur `profiles` : `est_associe` ne change que si l'auteur est
  associé, ou sans session (éditeur SQL).
- Commentaire de fin : la requête à coller pour désigner les premiers
  associés par leur adresse e-mail.

Lectures : `planning_jalons` (date), `planning_etude_jalons` (semaine,
année), `todo_elements` (type `tache`), `affaires`, `affaire_collaborateurs`,
`profiles`. Le profil se lit en `select('*')` pour tolérer l'absence de la
colonne.

## 5. Logique pure (`src/gestion/gestionLogique.js`, `tests/gestion.test.js`)

- `vendrediSemaineIso(semaine, annee)` → `AAAA-MM-JJ`.
- `rendus(jalonsChantier, jalonsEtude, affaires)` → événements
  `{ id, date, libelle, couleur, affaire, origine: 'chantier'|'etude', semaine? }`.
- `grilleMois(annee, mois)` → semaines de 7 jours `{ date, duMois }`.
- `parJour(evenements)`, `prochaines(evenements, aujourdhui, jours = 30)`.
- `affairesModifiables(affaires, collaborateurs, utilisateurId)` : même
  règle que `peut_modifier_affaire` (propriétaire ou collaborateur, ou
  affaire sans collaborateur).
- `mesAffaires(collaborateurs, utilisateurId)`.
- `groupesTaches(taches, affaires, filtres, aujourdhui)`.

## 6. Hors champ

- Envoi vers Notion (projet distinct, en attente de l'accès).
- Jalons réalisés / facturation.
- Outils futurs de Gestion d'agence.
