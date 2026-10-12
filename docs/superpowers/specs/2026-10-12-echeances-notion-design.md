# Échéances partagées avec Notion — conception

Validée avec l'agence le 2026-10-12. Remplace la décision du 2026-10-06
(« l'app envoie, Notion ne fait que recevoir ») : les deux côtés sont
désormais **à égalité**.

## 1. Le besoin

L'agence tient dans son Notion un planning hebdomadaire où les rendus à
venir sont notés sur des cartes, colonne « ECHEANCES RENDUS ». L'app a son
calendrier des rendus (Gestion d'agence) et les échéances des plannings.
Certaines affaires anciennes n'existent que dans Notion, et il ne servirait
à rien de les créer dans l'app.

On veut que :

- une échéance saisie dans Notion apparaisse dans le calendrier des rendus
  de l'app — et dans le planning de l'affaire quand l'affaire existe dans
  l'app ;
- une échéance créée, déplacée ou supprimée dans l'app le soit aussi dans
  Notion ;
- une affaire présente seulement dans Notion ait ses échéances dans le
  calendrier, sans création forcée d'affaire dans l'app ; une affaire
  présente seulement dans l'app (rare : Notion la précède presque toujours)
  ait quand même ses cartes dans Notion.

**Contrainte ferme : la structure de Notion ne change pas.** Ni nouvelle
base, ni nouvelle colonne, ni option ajoutée. L'app lit et écrit les cartes
telles que l'agence les tient. Elle a le droit d'ajouter, de modifier et de
mettre à la corbeille des cartes.

## 2. Ce qui existe dans Notion

Espace de l'agence, page « JGA Tableau de Bord » (relevé du 2026-10-12) :

- **Planning hebdomadaire** — une carte par tâche. Titre (« N° Affaire ») en
  texte libre : numéro d'affaire, lettres, phase, initiales, tâche, souvent
  une ou plusieurs dates (« 2699 ABC APD – Rendu APD 16/10 », « 2698 XYZ :
  Rendu PC 09/10/26 – Rendu PRO/DCE 20/11/26 »). Colonne **Jour**
  (multi-sélection) : les jours de la semaine en cours, « Dossiers en
  veille » et **« ECHEANCES RENDUS »**. Colonne **Semaine** (date), vide
  partout. Aucune relation vers la base des affaires.
- **Atelier ETUDE & CHANTIER** — une ligne par affaire. Titre
  « Référence » en texte libre, commençant (sauf exception) par le numéro à
  4 chiffres (« 2699 - ABC », « 2697 NOM LONG »). Sert ici à nommer les
  affaires absentes de l'app.

Les identifiants de ces deux bases **n'entrent pas dans le dépôt** (public) :
variables Vercel `NOTION_PLANNING_SOURCE` et `NOTION_ATELIER_SOURCE`, à côté
de `NOTION_TOKEN`.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Source Notion | Les seules cartes du Planning hebdomadaire dont **Jour contient « ECHEANCES RENDUS »**. La « Date de fin » d'Atelier n'est pas une échéance. |
| Affaire | Reconnue par le **premier numéro à 4 chiffres** de la carte (les « !!! », « ??? » de tête ignorés) et le début de `code_affaire`. Les lettres diffèrent parfois d'un côté à l'autre : elles ne comptent pas. Nom d'une affaire absente de l'app : la Référence d'Atelier de même numéro, sinon le début de la carte. |
| Dates lues | « 16/10 », « 16/10/26 », « 16/10/2026 », « 6/1 » ; heure ignorée (« 15/10 11h »). Sans année : l'année qui met la date **au plus près de la création de la carte**. Formulation vague (« fin novembre ») ou date impossible : la carte va dans « À dater ». |
| Plusieurs dates | Une carte à N dates donne N échéances, chacune avec le morceau de texte qui l'entoure. Elles sont **en lecture seule dans l'app**, avec la mention « carte à plusieurs dates · à modifier dans Notion ». |
| Carte à une date | Modifiable des deux côtés. Déplacée dans l'app : l'app remplace la date dans le texte (même format) et remplit Semaine ; le reste du texte n'est pas touché. |
| Créée dans l'app | Nouvelle carte, Jour = « ECHEANCES RENDUS », titre **« 2699 ABC – Rendu PRO 16/10/26 »**, Semaine = la date. Une affaire absente de Notion n'empêche rien : la carte ne se rattache à aucune ligne d'Atelier. |
| Échéance de Notion, affaire dans l'app | Devient une vraie échéance de son planning, d'étude ou de chantier selon la phase de l'affaire (même règle que `ModaleJalon`). |
| Planning d'étude | Raisonne par semaine. Une date Notion du mercredi donne sa semaine ISO ; déplacée d'une semaine dans l'app, la carte garde **son jour de la semaine** (mercredi → mercredi suivant). Une échéance d'étude née dans l'app part au vendredi, comme au calendrier. |
| Échéance accrochée | Envoyée comme les autres ; la carte suit quand la barre bouge. Si Notion change sa date, elle est **décrochée** et prend la date de Notion. |
| Toutes les échéances | Toutes celles des deux plannings de toutes les affaires partent vers Notion, internes comprises. |
| Suppression dans Notion | Carte à la corbeille, archivée ou **sortie de la colonne** « ECHEANCES RENDUS » : l'échéance **à venir** disparaît de l'app ; une échéance passée reste (un ménage dans Notion n'efface pas l'historique des plannings). |
| Suppression dans l'app | La carte part à la corbeille de Notion (récupérable 30 jours). Pas pour une carte à plusieurs dates (lecture seule). |
| Pas de doublon | Une échéance de l'app pas encore liée et une date de carte pas encore liée, **même affaire, même date** (même semaine à l'étude), sont reliées l'une à l'autre au lieu de créer une carte et une échéance de plus. C'est ce qui évite, au premier passage, de doubler tous les rendus déjà notés des deux côtés. |
| Conflit | Les deux côtés ont changé depuis la dernière synchronisation : **le plus récent l'emporte** (heure de modification de la carte contre celle de l'échéance, migration 071). |
| Quand | Notion → app : à l'ouverture du calendrier des rendus (toutes les affaires), à l'ouverture d'un planning (son affaire), sur « Actualiser depuis Notion ». App → Notion : quelques secondes après chaque changement d'échéance, par comparaison. Pas de synchronisation programmée (le plan gratuit de Vercel n'en permet qu'une par jour). |
| Qui | Tout compte d'agence ; jamais un extérieur. Un compte en lecture seule ne fait que lire. |
| Sans réseau | Rien ne part, rien ne crie ; la comparaison suivante rattrape. |

## 4. Écrans

**Calendrier des rendus** (`CalendrierRendus.jsx`)

- Les échéances venues de Notion portent une petite marque Notion ; celles
  d'une carte à plusieurs dates, en plus, « plusieurs dates · à modifier dans
  Notion », et leur fenêtre ne propose ni modification ni suppression.
- Une affaire absente de l'app s'affiche sous sa référence d'Atelier ; ses
  échéances ne mènent à aucune page.
- En tête : « Actualiser depuis Notion » et l'heure de la dernière lecture ;
  « Notion injoignable » si la lecture échoue (le calendrier reste affiché
  avec ce que l'app connaît).
- Sous la grille : **« À dater »**, les cartes sans date lisible, avec leur
  texte et un lien vers la carte.
- « + Échéance » : `ChoixAffaire` propose aussi les affaires d'Atelier
  absentes de l'app (marquées Notion). Une échéance posée sur l'une d'elles
  n'existe que dans le registre et sa carte.
- Le PDF du mois reprend les échéances Notion comme les autres.

**Plannings d'étude et de chantier**

- Marque Notion sur l'étiquette d'une échéance liée à une carte.
- Carte à plusieurs dates : la roue n'offre ni Déplacer, ni Accrocher, ni
  Supprimer (mention « à modifier dans Notion ») ; « Décaler tout le
  planning » l'ignore, comme une échéance accrochée.

**Notion** : rien ne change à l'écran, sinon les cartes ajoutées ou mises à
jour par l'app.

## 5. Construction

### 5.1 Passeur Notion (`api/notion.js`, fonction Node Vercel)

Seul détenteur de `NOTION_TOKEN`. Vérifie la session Supabase et
`est_agence()` comme `api/transcrire.js` (401 / 403). Ne décide de rien.

- `lire` : toutes les cartes « ECHEANCES RENDUS » (requête de la source de
  données filtrée sur Jour, pages de 100 suivies jusqu'au bout), avec id,
  titre brut, Semaine, `created_time`, `last_edited_time`, et les
  références d'Atelier (titre seul). Option `numero` : cartes et références
  dont le titre contient ce numéro (ouverture d'un planning), plus les
  cartes déjà liées (`pages`) que ce filtre n'a pas rendues, relues une à
  une — un numéro effacé le temps de le retaper ne fait pas croire à une
  carte supprimée. La réponse dit si la lecture
  est **complète** : une lecture interrompue ne doit jamais faire croire à
  des cartes supprimées.
- `ecrire` : une liste d'opérations (`creer`, `modifier` titre + Semaine,
  `corbeille`), jouées une à une (Notion admet 3 requêtes par seconde), au
  plus 10 par appel ; le client relance pour la suite. Rend, par opération,
  l'id de la carte et son `last_edited_time`, ou l'erreur.
- API Notion version `2025-09-03` (sources de données). Une variable
  manquante : 503 « Notion non configuré », que l'écran traite comme
  « Notion injoignable ».

### 5.2 Registre (migration 071)

Table `notion_echeances` — une ligne par date lue dans une carte, ou par
carte « À dater » :

| Colonne | Rôle |
|---|---|
| `id` uuid | décidé sur l'appareil |
| `page_id` text | la carte ; `null` le temps de la créer (réservation) |
| `rang` int | position de la date dans la carte |
| `numero` text | les 4 chiffres |
| `reference` text | nom affiché pour une affaire absente de l'app |
| `affaire_id` uuid | `on delete set null` : supprimer une affaire dans l'app n'efface pas ses cartes |
| `origine` text, `jalon_id` bigint | l'échéance du planning (`etude` / `chantier`), unique ensemble |
| `libelle` text | morceau de texte de la date |
| `date_synchro` date | la date sur laquelle les deux côtés étaient d'accord la dernière fois ; `null` = « À dater » |
| `texte_carte` text, `nb_dates` int | pour la lecture seule et l'affichage |
| `notion_modifie_le` timestamptz | `last_edited_time` vu à la dernière synchronisation |
| `created_at`, `updated_at` | |

`unique (page_id, rang)`. Règles : lecture et écriture `est_agence()`
(un collaborateur qui déplace une échéance dans son planning tient le
registre à jour). Pas de règle restrictive par affaire : une ligne peut
n'avoir aucune affaire.

La même migration ajoute `modifie_le timestamptz` (déclencheur `before
update`, défaut `now()`) à `planning_jalons` et `planning_etude_jalons`.

**Sans la migration**, la synchronisation est éteinte (table absente,
`PGRST205` / `42P01`) : aucun appel à Notion, aucune marque, rien ne casse.

### 5.3 Logique pure (`src/shared/notion/echeancesNotionLogique.js`, testée)

- `lireCarte(titre, creeLe)` → `{ numero, dates: [{ date, texte, debut,
  fin, libelle }], aDater }`.
- `nomAffaireNotion(numero, references)`.
- `titreCarte({ code, libelle, date })` → « 2699 ABC – Rendu PRO 16/10/26 ».
- `remplacerDate(titre, ancienne, nouvelle)` : même format, reste intact.
- `dateEtude(semaine, annee, jourDeReference)` : date gardant le jour de la
  semaine d'origine ; vendredi par défaut.
- `planSynchro({ cartes, lectureComplete, registre, jalons, affaires,
  aujourdhui })` → opérations, sans rien écrire :
  - côté app : créer, déplacer (décrocher si accrochée), supprimer une
    échéance ; créer ou mettre à jour une ligne du registre ;
  - côté Notion : créer, réécrire, mettre à la corbeille une carte.
  Rapprochement d'une carte relue avec le registre : par `page_id` puis par
  date, puis par rang (une date ajoutée au milieu d'une carte ne décale pas
  les autres). Ensuite seulement, les restes non liés des deux côtés sont
  reliés par affaire et date (règle « Pas de doublon ») ; ce qui reste
  après donne des créations. Les règles de la section 3 s'y appliquent
  toutes.

Tests (`tests/echeances-notion.test.js`) sur des cartes **inventées** :
aucun texte réel de Notion dans le dépôt.

### 5.4 Orchestration (`src/shared/notion/synchroEcheances.js`)

`synchroniser({ affaireId? })` : lit Notion par le passeur, lit registre et
échéances, calcule `planSynchro`, applique côté app (Supabase, chemins
habituels), puis côté Notion, puis note dans le registre les ids de carte et
`last_edited_time` rendus. Une seule synchronisation à la fois sur
l'appareil (Web Locks, comme `horsLigne/synchro.js`). Doublons entre deux
appareils : la ligne du registre est réservée (`page_id` null, unique sur
`origine, jalon_id`) avant de créer la carte ; seul celui qui l'a réservée
la crée.

Déclenchement : `CalendrierRendus` à l'ouverture et sur « Actualiser » ;
chaque planning à l'ouverture et 3 s après tout changement de ses échéances
(effet différé, comme le recalage des échéances accrochées : aucun chemin de
modification à compléter). Hors ligne : pas d'appel.

## 6. Ce qui reste en dehors

- L'ancienne synchronisation des **phases** d'étude avec Notion
  (`useNotionSync`, `useNotionGantt`, serveur local `VITE_GANTT_SERVER`) :
  inopérante sur le site, laissée en l'état ; à retirer à part.
- Les colonnes de jours et « Dossiers en veille » du Planning hebdomadaire.
- Personne en charge, couleur, type de rendu : pas de colonne pour eux dans
  Notion.
- Un avis en temps réel de Notion (webhooks) : plus tard si le besoin se
  fait sentir.
- Une faute de frappe dans une date (« 16/1O ») échappe à la lecture : la
  carte va dans « À dater » si elle n'a aucune autre date.

## 7. Mise en service

1. Passer la migration 071 dans l'éditeur SQL de Supabase.
2. Ajouter dans Vercel (Production) `NOTION_PLANNING_SOURCE` et
   `NOTION_ATELIER_SOURCE` (valeurs données par Claude, hors dépôt).
3. Vérifier qu'un propriétaire de l'espace Notion a bien ouvert la page
   « JGA Tableau de Bord » à la connexion « Application JGA » : sinon le
   passeur répond « Notion injoignable ».
4. Première ouverture du calendrier : toutes les cartes sont lues ; les
   échéances existantes de l'app partent en cartes. Contrôler la liste
   « À dater » et quelques cartes avant d'annoncer la fonction à l'agence.
