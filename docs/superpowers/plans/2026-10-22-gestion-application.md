# « Gestion de l'application » — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une page réservée à l'administrateur (5ᵉ bulle de l'accueil) qui montre stockage, comptes, santé et activité de l'app, avec une alerte d'accueil à 80 % du stockage gratuit.

**Architecture:** trois fonctions de lecture SQL réservées à l'administrateur (migration 074, aucune table), une logique pure testée (`gestionAppLogique.js`), une couche de lecture (`gestionAppDonnees.js`) tolérante à l'absence de la 074, la page et la bulle.

**Tech Stack:** React 19, Supabase (RPC), Vite (`define`), `node --test`, PGlite pour la migration.

**Spec:** `docs/superpowers/specs/2026-10-22-gestion-application-design.md`

## Global Constraints

- Administrateur seul : `estAdmin` côté écran, `est_admin()` dans chaque fonction SQL.
- Limites : 1 Go de fichiers, 500 Mo de base, alerte à 80 % — une seule source (`LIMITES`, `SEUIL_ALERTE`).
- Couleur de la partie : `#4A5560`. Français partout, styles inline.
- Aucune table créée ; fonctions `security definer`, `search_path = ''`, révoquées de `public` et `anon`.
- `npm run build`, `npm test` avant commit ; commit et push.

---

### Task 1 : migration 074

**Files:** Create `supabase/migrations/074_gestion_application.sql`.

- [ ] `admin_stockage()` returns table `(bucket text, affaire_id uuid, fichiers bigint, octets bigint)` — `storage.objects` groupé par `bucket_id` et premier dossier du chemin, converti en uuid seulement s'il en a la forme.
- [ ] `admin_base()` returns bigint — `pg_database_size(current_database())`.
- [ ] `admin_comptes()` returns table `(id, email, prenom, nom, type_compte, est_associe, est_admin, cree_le, derniere_connexion, a_un_profil)` — `auth.users` left join `public.profiles`.
- [ ] Chaque fonction : `if not public.est_admin() then raise exception 'Réservé à l''administrateur' using errcode = '42501'; end if;`, `revoke all … from public, anon`, `grant execute … to authenticated`.
- [ ] Test PGlite hors dépôt : rejouée deux fois ; administrateur servi ; autre compte refusé ; compte sans profil listé ; objets regroupés par affaire.
- [ ] Commit.

### Task 2 : logique pure

**Files:** Create `src/admin/gestionAppLogique.js`, `tests/gestion-application.test.js`.

**Produces :** `LIMITES`, `SEUIL_ALERTE`, `jauge(octets, limite) → { octets, limite, part, alerte }`, `parSorte(lignes) → [{ sorte, libelle, octets, fichiers }]`, `parAffaire(lignes, affaires, n) → [{ affaireId, libelle, octets, fichiers }]`, `alerteAccueil({ fichiers, base }) → null | { part, texte }`, `etatComptes(comptes) → { total, agence, exterieurs, associes, sansProfil }`.

- [ ] Tests puis implémentation ; tests verts ; commit.

### Task 3 : données, page, route, bulle

**Files:** Create `src/admin/gestionAppDonnees.js`, `src/admin/GestionApplicationPage.jsx` ; Modify `src/core/router/AppRouter.jsx` (route + `AdminSeul`), `src/pages/HomePage.jsx` (5ᵉ bulle, grille 5 / 3 + 2, alerte), `src/modules/chantier/comptes-rendus/NettoyageStockage.jsx` (`onErreur` facultatif), `vite.config.js` (`VITE_COMMIT`, `VITE_CONSTRUIT_LE`).

- [ ] `chargerGestion()` : `admin_stockage`, `admin_base`, `admin_comptes` (null chacun si la 074 manque), affaires (code, nom), compteurs (`head: true`) de `affaires`, `comptes_rendus`, `cr_photos`, `affaire_plans`, `pieces_ecrites`, `profiles` ; échéances Notion en attente (`page_id` nul, `updated_at` plus ancien que `BAIL_MS`) ; envois en attente de l'appareil (`toutesOperations`).
- [ ] Page : cartes Stockage (jauges, par sorte, 10 affaires, nettoyage), Comptes (tableau, sans profil en rouge), Santé (version, file, Notion), Activité ; message si la 074 manque.
- [ ] Bulle « Gestion de l'application » (`admin: true`), alerte via `espace_stockage_utilise()` + `admin_base()`.
- [ ] Build, essai à l'écran, commit.

### Task 4 : livraison

- [ ] Tests, build, eslint ; CLAUDE.md ; commit, push ; rappeler la migration 074.
