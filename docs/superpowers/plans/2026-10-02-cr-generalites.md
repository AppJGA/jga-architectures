# Comptes rendus, chantier 2 : généralités — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** parties I à V saisies une fois par affaire (« Généralités »), importables d'une autre affaire, imprimées dans chaque CR ; un CR émis garde la version de son jour.

**Architecture:** une ligne par affaire (`affaire_generalites.contenu`, jsonb : parties → rubriques → paragraphes datés, marque de suite) ; copie dans `comptes_rendus.generalites` à l'émission. Toute la manipulation de l'arbre est pure (`generalitesLogique.js`, testée) ; l'écran est une vue du CR (« Généralités », tuile de l'accueil) qui édite un brouillon local et l'enregistre d'un bouton.

**Spec:** `docs/superpowers/specs/2026-10-02-comptes-rendus-refonte-design.md` (§ 2)

## Global Constraints

- Tolérer l'absence de la migration 055 (table ou colonne manquantes : message, pas de plantage).
- Règles RLS par `acces_affaire` (lecture) et `est_agence` (écriture), jamais « tout connecté ».
- Français ; tests `node --test` ; lint ≤ 73.

### Task 1 : migration 055
- [ ] `affaire_generalites` (clé : affaire), RLS, `updated_at` ; `comptes_rendus.generalites jsonb`.

### Task 2 : `generalitesLogique.js` + tests
- [ ] `normaliserGeneralites`, `aDuTexte`, `squeletteHabituel`, `copierPourImport`, `ajouter`, `modifier`, `supprimer`, `deplacer`, `prochainRomain`, `prochainCode`, `generalitesAImprimer`.

### Task 3 : données
- [ ] `useGeneralites(affaireId)` : lecture, enregistrement, sources d'import, disponibilité.
- [ ] Émission : copie dans le CR (`emettre(date, { generalites })`), avec repli sans la colonne.

### Task 4 : écran
- [ ] Vue « Généralités » (tuile de l'accueil) : éditeur, partir des titres habituels, import (confirmation), enregistrement ; lecture seule pour un CR émis (version du jour) et pour un intervenant.

### Task 5 : PDF
- [ ] Généralités après présences / avancement, avant les remarques ; sections générales vides retirées du PDF.

### Task 6 : vérification, CLAUDE.md, livraison
