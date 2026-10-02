# Jalons : titre lisible, roue d'actions, accroche à une barre

Validé avec Victor le 2026-10-02. Concerne les deux plannings (chantier, étude).

## Demande

1. Le champ du titre d'un jalon est trop étroit pour lire ce qu'on tape.
2. Un jalon doit pouvoir être accroché au début ou à la fin d'une barre ; il
   suit alors la barre quand elle est déplacée ou étirée.
3. Même ergonomie que les barres : toucher un jalon ouvre une roue d'actions.

Choix de Victor : on accroche aux barres **et aux segments** ; un jalon accroché
ne se déplace pas à la main (**Détacher** d'abord) ; un seul bouton
**Accrocher**, puis on touche la barre près de son début ou de sa fin.

## Comportement

- **Fenêtre Jalons** : le titre occupe sa propre ligne, pleine largeur ; date
  et couleur dessous. Ajout comme modification, dans les deux modales.
- **Roue d'un jalon** (toucher sa ligne ou son étiquette, zone de toucher
  élargie) : Réglages (ouvre la fenêtre sur ce jalon), Déplacer (non accroché),
  Accrocher (non accroché), Détacher (accroché), Supprimer.
- **Déplacer** : `EditionBarre` en mode move, au jour (chantier) ou à la semaine
  (étude) ; pastille d'écart et « Terminé ». `pointercancel` = annulation.
- **Accrocher** : bandeau « Touchez une barre près de son début ou de sa fin ».
  Le toucher suivant sur une barre de tâche/phase ou un segment : moitié gauche
  → début, moitié droite → fin. Échap / Annuler sort du mode.
- **Accroché** : petit signe de lien dans l'étiquette.

## Données (migration 053)

- `planning_jalons` : `ancre_tache_id bigint → planning(id) on delete set null`,
  `ancre_segment_id uuid → planning_segments(id) on delete set null`,
  `ancre_bord text check (ancre_bord in ('debut','fin'))`.
- `planning_etude_jalons` : `ancre_phase_id bigint → planning_etude_phases(id)
  on delete set null`, `ancre_segment_id uuid → planning_etude_segments(id) on
  delete set null`, `ancre_bord` idem.
- Un segment prime sur la tâche/phase si les deux sont renseignés (on n'en
  renseigne qu'un).
- `ancre_bord` sert aussi au dessin : `fin` place le jalon au **bord droit** de
  son jour / sa semaine. Il est conservé au détachement, pour que le jalon ne
  saute pas visuellement.
- Le code tolère l'absence des colonnes : sans elles, « Accrocher » est
  inactif, avec un message.

## Dates

- Chantier, jalon `debut` : date de début de la tâche / du segment ; `fin` :
  `dernierJourTache(début, durée, périodes)` (même fin que la barre dessinée).
- Étude, phase : `debut` = premier fragment, `fin` = dernière semaine
  travaillée (`finEffectivePhase` − 1 semaine). Segment : sa première semaine /
  `semaine_debut + duree − 1`.
- `date` (chantier) et `semaine/annee` (étude) restent **stockées** : exports,
  page de l'affaire, import les lisent sans rien savoir des ancres.

## Synchronisation

- Fonctions pures `jalonsARecaler(jalons, contexte)` dans chaque planning : la
  liste des jalons accrochés dont la date stockée diffère de celle de leur
  ancre (ancre introuvable = ignoré).
- Chaque planning applique cette liste après tout changement des barres
  (effet différé, hors geste en cours) : état local puis écriture. Couvre
  glissement, modale, propagation, fermetures, décalage, annulation.
- Pendant un glissement, l'écran calcule la position du jalon depuis la barre
  affichée (aperçu) : il suit le doigt.
- Barre supprimée : la base remet l'ancre à `null`, le jalon reste en place.

## Historique

- Accrocher, détacher, déplacer : une étape chacun.
- Chantier : `COLONNES_JALON` = date + colonnes d'ancre (toujours sans
  insertion ni suppression).
- Étude : les jalons entrent dans l'instantané (semaine, annee, ancres),
  mises à jour seulement.

## Autour

- `planDecalage` ne décale plus les jalons accrochés : ils suivent leur barre.
- Import : l'ancre est reportée sur la copie de sa barre (tables de
  correspondance existantes) ; barre non importée → jalon non accroché.

## Tests

`tests/jalons-ancres.test.js` : dates d'ancre (chantier et étude, fermetures),
`jalonsARecaler`, côté touché, décalage qui ignore les jalons accrochés,
remappage à l'import, colonnes d'historique.
