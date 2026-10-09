# Gestion d'agence — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Espace « Gestion d'agence » réservé aux associés : calendrier des rendus, suivi des tâches, gestion des associés.

**Architecture:** Migration 067 (`profiles.est_associe`, `est_associe()`, verrou). Logique pure dans `src/gestion/gestionLogique.js` (testée) ; lectures dans `gestionDonnees.js` ; écrans dans `src/gestion/`, outils déclarés dans `src/gestion/manifest.js` ; route gardée par `AssocieSeul`.

**Tech Stack:** React 19, Supabase, node --test.

**Spec:** `docs/superpowers/specs/2026-10-09-gestion-agence-design.md`

## Global Constraints

- Français partout ; styles inline ; fenêtres jamais fermées au clic à côté.
- Code tolérant à l'absence de la migration 067 (profil lu en `select('*')`, `est_associe` absent = faux).
- Aucun nom réel dans le dépôt (public).
- `npm test` et `npm run build` avant chaque commit ; push en fin.

## Tâches

### Task 1 : logique pure + tests
- [ ] `tests/gestion.test.js` : vendredi d'une semaine ISO (dont semaine 1 à cheval sur deux années, semaine 53), événements fusionnés, grille d'un mois commençant un dimanche, prochaines échéances (bornes incluses, tri), affaires modifiables (sans collaborateur, extérieur exclu), groupes de tâches (retards en tête, filtres personne / en retard / mes affaires).
- [ ] `src/gestion/gestionLogique.js`. Tests verts. Commit.

### Task 2 : migration 067
- [ ] Colonne, fonction, déclencheur, droit d'exécution, requête d'amorçage en commentaire.
- [ ] Rejouée deux fois dans PGlite ; un non-associé ne peut pas se promouvoir, un associé peut promouvoir. Commit.

### Task 3 : accès
- [ ] `AuthProvider` : profil en `select('*')`, `estAssocie` (gardé sur l'appareil comme le type).
- [ ] Accueil : bulle 04 filtrée ; `AppRouter` : routes `/gestion-agence` et `/gestion-agence/:outil` sous `AssocieSeul` ; `AppShell` sans colonne latérale ; `retourLogique` (+ test) : Accueil ← Gestion d'agence ← un outil.

### Task 4 : écrans
- [ ] `GestionPage.jsx` (tuiles), `manifest.js`, `gestionDonnees.js`.
- [ ] `CalendrierRendus.jsx`, `SuiviTaches.jsx`, `Associes.jsx`.
- [ ] Essai dans le navigateur (base simulée). Build, tests, CLAUDE.md, commit, push.
