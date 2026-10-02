# Jalons accrochés — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** titre de jalon lisible, roue d'actions sur les jalons, accroche d'un jalon au début ou à la fin d'une barre (tâche, phase ou segment) dans les deux plannings.

**Architecture:** l'ancre est stockée sur le jalon (migration 053) ; sa date reste stockée et est recalée par une fonction pure (`jalonsARecaler`) appliquée par chaque planning après tout changement des barres. L'écran calcule la position depuis la barre affichée pour suivre les gestes en direct. Roue, poignée de déplacement et bandeau réutilisent `MenuRadial` / `EditionBarre` / `BandeauLien`.

**Tech Stack:** React 19, Supabase, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-02-jalons-accroches-design.md`

## Global Constraints

- Français partout (code métier, commentaires « pourquoi », commits `feat:`/`fix:`/`test:`).
- Styles inline ; animations dans `index.css` seulement.
- Gestes par événements pointeur ; `pointercancel` = annulation, rien d'écrit.
- Une action = une étape d'historique.
- Le code tolère l'absence des colonnes de la migration 053.
- Jamais de `Math.floor` sur des millisecondes ; dates chantier par `dernierJourTache` / `joursEntre`.
- `npm run build` et `npm test` verts avant chaque commit ; `npx eslint src` ≤ 73 problèmes.

---

### Task 1 : migration 053

**Files:** Create `supabase/migrations/053_jalons_ancres.sql`

- [ ] Colonnes (spec § Données), `add column if not exists`, contraintes `check` nommées et rejouables (`drop constraint if exists` puis `add`), `notify pgrst, 'reload schema'`.
- [ ] Commit `feat: jalons — colonnes d'accroche (migration 053)`.

### Task 2 : logique pure partagée et chantier

**Files:**
- Create `src/shared/planning/ancrage.js`
- Create `src/modules/chantier/planning/jalonsAncres.js`
- Modify `src/modules/chantier/planning/geometrie.js` (export `lendemain`, ajout `deplacerJalon`)
- Test `tests/jalons-ancres.test.js`

**Interfaces (produites):**
- `ancrage.js` : `bordTouche(clientX, rect) → 'debut'|'fin'` (moitié gauche/droite) ; `estAncre(jalon) → boolean` (un des ids d'ancre non nul) ; `ancrageDisponible(jalons) → boolean` (`'ancre_bord' in` un jalon).
- `jalonsAncres.js` : `dateAncre(jalon, { tasks, segments, periodes }) → 'YYYY-MM-DD'|null` ; `jalonsARecaler(jalons, ctx) → [{ id, date }]` ; `champsAccroche({ type: 'task'|'segment', id }, bord) → { ancre_tache_id, ancre_segment_id, ancre_bord }` ; `CHAMPS_DETACHE = { ancre_tache_id: null, ancre_segment_id: null }`.
- `geometrie.js` : `deplacerJalon({ date, dx, geo }) → Date` (jour le plus proche ; semaine : `round(dx / (weekWidth/7))` jours ; mois : `jourSousXMois(…, Math.round)`).

- [ ] Tests d'abord : début / fin de tâche (fin = `dernierJourTache`, fermeture comprise), segment prioritaire, ancre introuvable → null, jalon non accroché → null ; `jalonsARecaler` ne renvoie que les dates différentes ; `bordTouche` ; `champsAccroche` met l'autre id à null ; `deplacerJalon` vue jour (arrondi au jour le plus proche, sens du geste).
- [ ] Implémentation, tests verts, commit `feat: jalons — calcul des dates d'accroche (chantier)`.

### Task 3 : logique pure étude

**Files:** Create `src/modules/etude/planning/jalonsAncresEtude.js`, tests dans `tests/jalons-ancres.test.js`.

**Interfaces:** `semaineAncre(jalon, { phases, segments, periodes }) → { semaine, annee }|null` (phase : premier fragment / dernière semaine travaillée ; segment : `semaine_debut` / `+ duree − 1`) ; `jalonsARecalerEtude(jalons, ctx) → [{ id, semaine, annee }]` ; `champsAccrocheEtude({ type: 'phase'|'segment', id }, bord)` ; `CHAMPS_DETACHE_ETUDE`.

- [ ] Tests : phase coupée par une fermeture (fin reculée), changement d'année, segment, introuvable.
- [ ] Implémentation, commit `feat: jalons — calcul des semaines d'accroche (étude)`.

### Task 4 : historique, décalage, import

**Files:** `chantier/planning/snapshotDiff.js` (`COLONNES_JALON` + ancres), `etude/planning/snapshotDiffEtude.js` (`COLONNES_JALON_ETUDE`, collection `jalons` en mises à jour seules), `chantier/planning/decalage.js` (ignorer `estAncre`), `chantier/planning/importPlanning.js` + `importEcriture.js`, `etude/planning/importPlanningEtude.js` + `importEcritureEtude.js` (ancre remappée par les tables de correspondance ; absente de la source → non transmise).

- [ ] Tests : diff jalon avec changement d'ancre → update ; décalage n'emporte pas un jalon accroché ; import remappe l'ancre et la lâche si la barre n'est pas importée ; diff étude.
- [ ] Mettre à jour `tests/decalage.test.js` / `tests/import-planning.test.js` si leurs attentes changent.
- [ ] Commit `feat: jalons accrochés — historique, décalage et import`.

### Task 5 : fenêtres Jalons (titre pleine largeur, ouverture sur un jalon)

**Files:** `chantier/planning/JalonModal.jsx`, `etude/planning/JalonEtudeModal.jsx`.

- [ ] Ligne d'ajout et ligne de modification : titre sur sa propre ligne (`width: 100%`), date + couleur + boutons dessous.
- [ ] Prop `jalonInitialId` : la ligne de ce jalon s'ouvre en modification.
- [ ] Commit `feat: jalons — titre lisible dans la fenêtre des jalons`.

### Task 6 : roue des jalons (partagé)

**Files:** `shared/planning/MenuRadial.jsx`, `shared/planning/positionsPetales.js`, `tests/menu-radial.test.js`.

- [ ] `ACTIONS` par défaut inchangées pour les barres ; nouvelles actions `accrocher`, `detacher` (icônes) ; `actionsJalon(ancre) → ['params','move','accrocher','del'] | ['params','detacher','del']`.
- [ ] Libellés : article masculin pour `jalon` ; `BandeauLien` accepte `texte`.
- [ ] Test : `actionsJalon` et écart positif entre pétales.
- [ ] Commit `feat: roue d'actions des jalons`.

### Task 7 : chantier — écran et synchronisation

**Files:** `chantier/planning/GanttTimeline.jsx`, `chantier/planning/GanttChart.jsx`.

- [ ] Timeline : `selectionJalon { jalonId, mode: 'menu'|'move'|'accroche' }` exclusive des autres sélections ; zone de toucher élargie (`data-jalonid`) ; position = barre affichée (aperçu compris) ; bord `fin` → `getX(lendemain)` ; signe de lien ; roue ; déplacement (`deplacerJalon`, aperçu, `pointercancel`) ; mode accroche (barres et segments non glissables, `bordTouche` sur le rectangle touché) ; Échap.
- [ ] GanttChart : `handleJalonModif(id, changes, label)` (instantané, local, écriture, échec → `retirerDernier` + `signalerEchec`) ; accrocher (refus clair sans migration) / détacher / supprimer (confirmation) / réglages ; effet de recalage différé (attend chargements, ignore un geste de segment en cours).
- [ ] `npm run build`, essai à l'écran.
- [ ] Commit `feat: planning chantier — jalons accrochés aux barres`.

### Task 8 : étude — écran et synchronisation

**Files:** `etude/planning/GanttEtudeTimeline.jsx`, `etude/planning/GanttEtude.jsx`, `shared/hooks/usePlanningEtude.js` (exposer `setJalons`).

- [ ] Mêmes éléments qu'en tâche 7, à la semaine ; jalons dans l'instantané et dans `appliquerSnapshot`.
- [ ] Commit `feat: planning d'étude — jalons accrochés aux barres`.

### Task 9 : vérification et livraison

- [ ] `npm test`, `npm run build`, `npx eslint src`.
- [ ] Essai à l'écran des deux plannings (navigateur), migration absente comprise.
- [ ] CLAUDE.md : paragraphe « Jalons accrochés » ; compte de tests.
- [ ] Commit, push.
