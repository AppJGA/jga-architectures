# « Gestion de l'application » — conception

Validée avec l'agence le 2026-10-22.

## 1. Le besoin

Un tableau de bord réservé à l'**administrateur** de l'app (compte
`profiles.est_admin`, migration 068) pour suivre ce qui compte au
quotidien, d'abord le **stockage** de l'offre gratuite de Supabase — et
décider à temps d'un passage à l'offre payante.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Accès | 5ᵉ bulle de l'accueil, « Gestion de l'application », **administrateur seul** (`estAdmin`) ; route `/gestion-application` gardée par `AdminSeul` (attend le profil, sinon renvoie à l'accueil). |
| Couleur | Gris ardoise `#4A5560` (règle « chaque partie a sa couleur »). |
| Accueil | 5 bulles sur une ligne en grand écran, sinon 3 + 2. |
| Contenu | Stockage, Comptes, Santé de l'app, Activité. Pas de chiffres de l'API de gestion de Supabase (bande passante) : rien à configurer. |
| Limites | Offre gratuite : **1 Go** de fichiers, **500 Mo** de base — constantes uniques (`LIMITES`), à changer le jour d'une autre offre. |
| Alerte | Au-delà de **80 %** des fichiers ou de la base, la bulle de l'administrateur porte un avertissement orange et le pourcentage. |
| Base | **Migration 074** : fonctions de lecture `security definer`, refusées à tout autre compte que l'administrateur. **Aucune table** (la règle des droits d'API de Supabase du 30 octobre ne la concerne pas). Sans elle, la page montre ce qu'elle peut. |

## 3. Migration 074 (fonctions de l'administrateur)

Chacune commence par refuser un appelant qui n'est pas administrateur
(`if not public.est_admin() then raise exception …`), est `security definer`
avec `search_path = ''`, révoquée de `public` / `anon`, exécutable par
`authenticated`.

- `admin_stockage()` → `(bucket, affaire_id, fichiers, octets)` : les objets
  de `storage.objects` groupés par dossier de stockage et par **premier
  dossier du chemin** (l'identifiant de l'affaire, règle de la 050 ; nul si
  ce n'est pas un identifiant).
- `admin_base()` → `(octets)` : `pg_database_size(current_database())`.
- `admin_comptes()` → `(id, email, prenom, nom, type_compte, est_associe,
  est_admin, cree_le, derniere_connexion, a_un_profil)` : `auth.users`
  joint à `profiles` (gauche : un compte sans profil apparaît).

## 4. Logique pure (`src/admin/gestionAppLogique.js`, testé)

- `LIMITES = { fichiers: 1 Go, base: 500 Mo }`, `SEUIL_ALERTE = 0.8`.
- `jauge(octets, limite) → { octets, limite, part, alerte }`.
- `parSorte(lignes) → [{ sorte, libelle, octets, fichiers }]` : photos,
  plans, PDF archivés, audio temporaire, photos d'affaires, autres.
- `parAffaire(lignes, affaires, n = 10) → [{ affaireId, libelle, octets }]`,
  du plus lourd au plus léger, fichiers hors affaire regroupés.
- `alerteAccueil(stockage, base) → null | { part, texte }`.
- `etatComptes(comptes) → { total, agence, exterieurs, associes, sansProfil }`.

## 5. Page (`src/admin/GestionApplicationPage.jsx`)

Quatre cartes :
- **Stockage** : jauges fichiers et base, détail par sorte, 10 affaires les
  plus lourdes, fichiers inutiles (`fichiers_orphelins()`) et « Nettoyer le
  stockage » (`nettoyerFichiers`, comme la page d'export).
- **Comptes** : tableau (nom, e-mail, agence / extérieur, associé,
  administrateur, dernière connexion) ; comptes sans profil en rouge, avec
  l'explication.
- **Santé** : version en ligne (commit et date de construction, injectés au
  build par Vite depuis les variables de Vercel) ; envois en attente sur
  cet appareil (file hors ligne) ; échéances pas encore envoyées à Notion
  (`notion_echeances` sans `page_id`, plus anciennes que le bail).
- **Activité** : affaires, visites, photos, plans, pièces écrites, comptes.

## 6. Tests

`tests/gestion-application.test.js` : jauges et seuil, regroupement par
sorte et par affaire, alerte d'accueil (fichiers, base, aucune), état des
comptes. Migration éprouvée dans un PostgreSQL de test (administrateur
servi, autre compte refusé, compte sans profil listé). Écran essayé sur
une page d'essai.

## 7. Hors portée

Bande passante et utilisateurs actifs (API de gestion de Supabase), état des
sauvegardes nocturnes (dépôt privé), actions sur les comptes.
