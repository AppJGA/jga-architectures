# Pièces écrites — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importer les CCTP (PDF) d'une affaire, les découper en articles, les chercher par mot-clé au bureau et sur la tablette (hors ligne), et proposer le lot correspondant.

**Architecture:** tout se calcule dans le navigateur. pdf.js extrait les fragments positionnés ; des fonctions pures (`piecesLogique.js`) en font des lignes, retirent le bruit, découpent les articles, lisent le lot, et cherchent. Supabase garde le texte (migration 061) ; IndexedDB en garde une copie pour la visite hors ligne.

**Tech Stack:** React 19, pdfjs-dist (déjà installé, chargé à la demande), Supabase, IndexedDB brut, node --test.

**Spec:** `docs/superpowers/specs/2026-10-06-pieces-ecrites-design.md`

## Global Constraints

- Aucune IA, aucun appel payant.
- Le PDF d'origine n'est pas gardé ; seul le texte découpé.
- Dépôt public : **aucun extrait réel de CCTP** dans le code ni les tests (textes inventés).
- Toute nouvelle table d'affaire : RLS agence seule + règles restrictives de la migration 060 (`peut_modifier_affaire`).
- Un code qui dépend de la migration 061 tolère son absence (message, pas de plantage).
- Français partout ; styles inline ; une fenêtre ne se ferme jamais au clic à côté.
- Les échantillons réels servent à régler les règles **hors dépôt** (`scratchpad/cctp/`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/modules/etude/pieces-ecrites/piecesLogique.js` | Pur : lignes d'une page, bruit, sommaire, articles, lot, indice, recherche, extrait |
| `tests/pieces-ecrites.test.js` | Tests de la logique, textes inventés |
| `src/modules/etude/pieces-ecrites/lecturePdf.js` | Navigateur : pdf.js à la demande → pages de fragments |
| `src/modules/etude/pieces-ecrites/piecesDonnees.js` | Supabase : lister, enregistrer (remplacement), supprimer ; copie IndexedDB (`jga-pieces`) |
| `src/modules/etude/pieces-ecrites/RecherchePieces.jsx` | Champ, filtre par lot, résultats surlignés, article entier |
| `src/modules/etude/pieces-ecrites/ImportPieces.jsx` | Fenêtre d'import : un ou plusieurs PDF, lot lu, choix rattacher / créer, aperçu |
| `src/modules/etude/pieces-ecrites/index.jsx` | Le module : liste des CCTP par lot, import, recherche |
| `supabase/migrations/061_pieces_ecrites.sql` | `pieces_ecrites`, `pieces_articles`, RLS |
| `src/modules/manifest.js`, `src/affaire/AffairePage.jsx` | Entrée du module (icône Documents) |
| `src/modules/chantier/comptes-rendus/ModeVisite.jsx` | Loupe → panneau de recherche, copie hors ligne à l'ouverture |

---

### Task 1 : logique pure de lecture et de recherche

**Interfaces (produit) :**

- `lignesDePage(items)` → `[{ texte, taille }]` — `items` = fragments pdf.js (`str`, `transform`), regroupés par ordonnée (écart ≤ 2), dans l'ordre.
- `retirerBruit(pages)` → pages sans les lignes répétées sur plus de 40 % des pages (texte normalisé : chiffres retirés, espaces réduits) ni les lignes de sommaire (`/(\.{4,}|_{4,}|…{2,})\s*\d+\s*$/`). `pages` = `[{ numero, lignes }]`.
- `decouperArticles(pages)` → `[{ numero, niveau, titre, texte, page, ordre }]`. Titre : `^(\d{1,2}(?:\.\d{1,3}){0,4})\.?\s+(\S.{1,150})$`, sans point final de phrase, numéro « en avant » par rapport au précédent (comparaison composante par composante, tolérance : un niveau plus profond, ou un frère supérieur, ou un parent supérieur). Moins de 3 articles → un article par page (`numero: null`, `titre: 'Page N'`).
- `lireLot(pages, nomFichier)` → `{ numero, nom } | null` — page 1, lignes triées par taille décroissante, motif `/\blot\s*(?:n\s*[°o]\s*)?(\d{1,3})\s*[-:–—]?\s*(.*)$/i` ; nom complété par la ligne suivante s'il finit par `-` ; repli sur le nom du fichier ; nom remis en casse de phrase.
- `lireIndice(pages, nomFichier)` → `'2' | 'B' | null` (`IND\s*(\w+)`, `Indice\s*:?\s*(\w+)`).
- `lirePiece({ pages, nomFichier })` → `{ lot, indice, articles, nbPages }` — enchaîne les précédentes.
- `chercherArticles(articles, requete, { lotId })` → `[{ article, score, extrait }]` — tous les mots (≥ 2 lettres, sans accents ni majuscules) dans titre + texte ; score titre > texte ; tri score puis ordre.
- `extrait(texte, mots, largeur = 160)` → `[{ texte, surligne }]` autour du premier mot trouvé.

- [ ] Écrire `tests/pieces-ecrites.test.js` (textes inventés) : regroupement en lignes ; en-tête répété retiré ; sommaire retiré ; découpage en articles (numéros, niveaux, texte, page) ; liste de quantités « 1 / 2 » non prise pour des articles ; repli par page ; lot lu sous les trois formes (« LOT 07 - X - Y », « Lot n°170 : X », « Lot N°080 X »), nom sur deux lignes, repli sur le fichier ; indice ; recherche (tous les mots, accents, titre d'abord, filtre lot) ; extrait surligné.
- [ ] Les lancer : échec (module absent).
- [ ] Écrire `piecesLogique.js`.
- [ ] Les lancer : succès. Régler les règles sur les 7 CCTP réels avec `scratchpad/cctp/essai.mjs` (hors dépôt) : lot lu juste pour les 7, nombre d'articles plausible, aucun en-tête restant.
- [ ] Commit `feat: pièces écrites — lecture et recherche des CCTP (logique)`.

### Task 2 : migration 061 et données

- [ ] `061_pieces_ecrites.sql` : deux tables (spec §4), index `pieces_articles(affaire_id)`, RLS « Agence » (`est_agence()`), règles restrictives « Collaborateurs : ajout/modification/suppression » avec `peut_modifier_affaire(affaire_id)` — même bloc que la 060. Rejouable. Vérifier dans PGlite (`scratchpad/pgtest`) : B hors affaire ne crée pas, lit ; A crée.
- [ ] `piecesDonnees.js` : `listerPieces(affaireId)` (pièces + articles, `{ disponible }` si la table manque), `enregistrerPiece({ affaireId, lotId, lu, articles, nomFichier, remplace })` (supprime l'ancienne pièce du lot, insère la pièce, puis les articles par paquets de 200), `supprimerPiece(id)`, `garderCopie(affaireId, donnees)` / `lireCopie(affaireId)` (IndexedDB `jga-pieces`, magasin `affaires`, clé `affaireId`).
- [ ] Commit `feat: pièces écrites — tables et données`.

### Task 3 : le module

- [ ] `lecturePdf.js` : `lirePdf(fichier)` → `{ pages: [{ numero, lignes }], nomFichier }` (pdf.js importé à la demande, `lignesDePage` par page, copie du tampon avant `getDocument`).
- [ ] `ImportPieces.jsx` : dépôt de PDF ; par fichier : lot lu, articles trouvés, aperçu des 5 premiers ; choix « Rattacher au lot … » (lots de l'affaire rapprochés par `cleNom`) / « Créer le lot » (numéro + nom modifiables, numéro libre proposé) ; avertissement si le lot a déjà un CCTP (remplacé) ; « Importer ». Création du lot puis `enregistrerPiece`.
- [ ] `RecherchePieces.jsx` (commun au module et au mode Visite) : champ, filtre lot, résultats groupés par lot, surlignage, article entier au toucher.
- [ ] `index.jsx` : en-tête (nombre de CCTP), « Importer des CCTP » (masqué en lecture seule), liste par lot (indice, date, articles, Supprimer), recherche. Message si la migration 061 manque.
- [ ] Manifeste : module `pieces-ecrites`, phase Étude, icône `FileText` → `IconeDocuments` dans `ICON_MAP`.
- [ ] Lint, tests, build ; essai navigateur avec un PDF inventé ; commit `feat: module « Pièces écrites » (import, lots, recherche)`.

### Task 4 : mode Visite

- [ ] `ModeVisite.jsx` : loupe « Pièces écrites » dans la barre (si l'affaire a des CCTP) → `Panneau` avec `RecherchePieces`.
- [ ] À l'ouverture de la visite avec réseau : `listerPieces` puis `garderCopie` ; sans réseau : `lireCopie`.
- [ ] CLAUDE.md ; lint, tests, build ; commit `feat: pièces écrites — recherche dans le mode Visite, hors ligne`.
