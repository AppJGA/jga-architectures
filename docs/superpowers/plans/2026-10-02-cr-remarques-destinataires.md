# Comptes rendus, chantier 1 : remarques par destinataire — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** toute remarque des parties VI et VII a un destinataire et se range seule ; saisie rapide (dernier destinataire proposé) ; suite (▶) en touchant une remarque, avec son propre statut.

**Architecture:** on garde le stockage par sections, qui porte la reprise, la file hors ligne et le PDF. Chaque CR reçoit deux sections typées : `equipe` (VI) et `entreprises` (VII), créées à la demande. Le destinataire choisi décide de la section (lot → VII, interlocuteur → VI) ; le regroupement par lot / par rôle se calcule (`remarquesLogique.js`, pur et testé). Les autres sections (I à V, intervenants) s'affichent comme avant, jusqu'au chantier 2.

**Tech Stack:** React 19, Supabase, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-02-comptes-rendus-refonte-design.md` (§ 1)

## Global Constraints

- Français partout ; commentaires « pourquoi ».
- Toute écriture de visite passe par `executerOperation` (hors ligne) ; identifiants décidés sur l'appareil.
- Code tolérant à l'absence de la migration 054 tant qu'elle n'est pas passée.
- Boutons de 44 px au moins ; panneaux ancrés en haut.
- `npm test`, `npm run build` verts ; `npx eslint src` ≤ 73 problèmes.

### Task 1 : migration 054
- [ ] `type_section` accepte `equipe` et `entreprises` ; les sections VI / VII existantes (titres d'origine) prennent ces types.
- [ ] Déclencheur `cr_remarque_suivi` : une sous-remarque a son statut normalisé, `est_clos` et `date_cloture` déduits (sans numéro ni `suivi_id`) ; anciennes sous-remarques closes → `fait`.

### Task 2 : `remarquesLogique.js` + tests
- [ ] `PARTIES_REMARQUES`, `sectionsAMettreEnPlace(sections)`, `typePourDestinataire(cle)`, `cleDestinataire(r)`, `libelleRole(interlocuteur)`, `groupesDestinataires(section, { lots, interlocuteurs })`, `choixDestinataires({ lots, interlocuteurs })`, `destinataireParDefaut(memo, choix)`, `champsDestinataire(cle)`.

### Task 3 : reprise, visite, retard
- [ ] `preparerReprise` recopie statut et échéance des sous-remarques ; `estEnRetard` vaut pour une sous-remarque ; `groupesVisite` découpe VI / VII par destinataire. Tests.

### Task 4 : données
- [ ] `useCompteRendu` : lots de l'affaire (tous) exposés ; `assurerPartiesRemarques()` crée VI / VII manquantes (brouillon, agence) ; appelée à l'ouverture du CR.

### Task 5 : tablette
- [ ] `PanneauRemarque` : destinataire obligatoire (agence), préselection mémorisée par CR, section déduite ; modification : changer de destinataire déplace la remarque.
- [ ] `PanneauSuite` : liste des suites (statut modifiable), nouvelle suite (texte, statut, Pour le, « Clore la remarque d'origine »), bouton Modifier.
- [ ] Carte : toucher le texte ouvre la suite ; titres de groupe avec « + ».

### Task 6 : ordinateur
- [ ] Éditeur : sections `equipe` / `entreprises` groupées par destinataire, « + » par groupe, clic sur une remarque → suite ; « Nouvelle remarque » → même panneau.

### Task 7 : PDF
- [ ] VI / VII : un intertitre par destinataire ; suites avec statut et échéance.

### Task 8 : vérification, CLAUDE.md, livraison
