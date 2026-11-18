# État des lieux — lot 4 « Exporter » : plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal :** l'état des lieux relu sort en un ZIP : par étage, un **DXF par calques `EDL-…`** (symboles usuels, textes des pièces et des finitions) qui s'importe facilement dans ArchiCAD, et un **rapport PDF** pièce par pièce.

**Architecture :** tout se fabrique dans le navigateur, sans IA ni appel payant. Un catalogue pur de **symboles** (`symbolesEdl.js`) sert au DXF (blocs), à l'écran (SVG) et au PDF (dessin sur canevas). Un **écrivain DXF** pur (`exportDxfEdl.js`) produit un DXF texte **R12 (AC1009)** — le format le plus largement relu, sans identifiants ni objets à tenir — aux **coordonnées et unités du plan d'origine**, encodé en Windows-1252 ; chaque fichier produit est **relu par notre propre lecteur** (`lireDxf`) dans les tests. Le **rapport** est défini par une fonction pure (`rapportEdlLogique.js`, définition pdfmake) et fabriqué par pdfmake chargé à la demande, comme les comptes rendus. Un écran « Export » du module assemble le ZIP (`fflate`).

**Tech Stack :** React 19 + Vite, Supabase (lecture seule ici), pdfmake (déjà utilisé par les CR), fflate, `node --test`.

**Spec :** `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` § 3 (calques, symboles usuels), § 7 (export), § 9.

## Décisions (rulings du contrôleur, 2026-11-18)

- **Pas d'écriture dans le DXF d'origine.** Le § 7 prévoit d'ajouter les calques au fichier d'origine, avec un repli « DXF des seuls calques `EDL-` aux mêmes coordonnées » si l'ajout résiste. Les plans d'origine de l'agence pèsent jusqu'à 150 Mo, en R14 comme en 2018 : y insérer des entités en respectant `$HANDSEED` est fragile. On livre donc par étage **deux DXF** : `…-EDL.dxf` (les seuls calques `EDL-`, à **fusionner** dans le projet ArchiCAD — mêmes coordonnées, même unité que le plan d'origine) et `…-EDL-avec-plan.dxf` (les mêmes calques + le plan existant **allégé** du lot « plans vectoriels », sur les calques d'origine, pour une consultation autonome). Coût si faux : l'agence fusionne un fichier au lieu d'en ouvrir un ; à revoir après l'essai d'import dans ArchiCAD.
- **Ce qui part dans le DXF et le PDF** : les éléments **validés** (`a_valider = false`) ; option « Inclure les propositions non validées » (marquées « à valider » dans le PDF, sur un calque `EDL-À valider` dans le DXF). Un point typé en visite sans élément devient un élément de son type (libellé = type) ; un point ni typé ni rattaché à un élément n'est pas dessiné dans le DXF et figure dans le PDF en « points sans élément ».
- **Orientation** : les plans sont souvent tournés ; un symbole est tourné comme la pièce (angle du plus long côté du contour, ramené à ±45°).

## Global Constraints

- Français partout ; styles inline et charte (`--affaire-accent`, bordures 0,5 px, angles 2–3 px, ambre `#FFFBEB` / `#92400E`, rouge `#B8412C`) ; fenêtres jamais fermées au clic à côté ; cibles de 44 px.
- **Dépôt public** : aucun nom réel, aucun plan ni donnée réels dans les tests (données inventées).
- **Aucun appel payant** dans ce lot.
- DXF : R12 ASCII (`$ACADVER AC1009`), fins de ligne `\r\n`, codes de groupe sur 3 caractères alignés comme les DXF d'AutoCAD, `$INSUNITS` et coordonnées dans **l'unité du plan d'origine** (`edl_niveaux.unites_par_metre` : 1 = m, 100 = cm, 1000 = mm ; `$INSUNITS` 6 / 5 / 4), `$DWGCODEPAGE ANSI_1252`, texte encodé en Windows-1252 (caractère hors table → `?`). Les calques portent les noms de `calquesEdl.js` (`EDL-Pièces`…), une couleur ACI par calque. Les symboles sont des `BLOCK` nommés `EDL_<CODE>` (ASCII, majuscules, `-` → `_`), insérés par `INSERT` (échelle selon l'unité, rotation de la pièce). Textes en `TEXT` (pas de `MTEXT` en R12).
- Tout fichier produit est **relu par `lireDxf`** dans les tests (calques, blocs, insertions, textes, unité, accents).
- Géométrie : mètres, repère du plan d'origine (y vers le haut) → coordonnée DXF = mètre × `unites_par_metre`.
- `npm test` vert, `npm run build` réussi, ESLint sans problème ajouté (~72 préexistants). Commits `feat:` / `fix:` / `test:` / `docs:` finissant par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne jamais pousser.

---

### Task 1 : Catalogue des symboles usuels

**Files :**
- Create : `src/modules/etude/etat-des-lieux/export/symbolesEdl.js` (pur)
- Create : `src/modules/etude/etat-des-lieux/export/SymboleEdl.jsx` (SVG d'un symbole) et `PlancheSymboles.jsx` (tous les symboles, par calque, avec leur nom et leur taille — pour la relecture par l'agence)
- Test : `tests/etat-des-lieux-export.test.js`

**`symbolesEdl.js` :**
- `SYMBOLES` : un symbole par code de type de `calquesEdl.js` (test : aucun type sans symbole). Un symbole = `{ taille: 'reelle' | 'fixe', primitives: [...] }`, primitives en **mètres** autour de l'origine (point d'insertion), y vers le haut : `{ ligne: [[x,y],[x,y]] }`, `{ polyligne: [[x,y]…], ferme }`, `{ cercle: [cx, cy, r] }`, `{ arc: [cx, cy, r, debutDeg, finDeg] }`, `{ texte: 'T', pos: [x,y], hauteur }`.
  - **Appareils à leur taille réelle**, vus de dessus (conventions de plan) : lavabo ~0,60 × 0,45 (cuvette ovale), évier ~1,20 × 0,60 (deux bacs), baignoire 1,70 × 0,70, douche 0,90 × 0,90 (bac + diagonales), WC 0,40 × 0,65 (réservoir + cuvette), ballon d'eau chaude cercle Ø 0,55, radiateur 0,80 × 0,10 (rectangle à ailettes), chaudière 0,45 × 0,35.
  - **Symboles à taille fixe**, lisibles au 1/100 et au 1/50 (~0,30 m) : électricité selon l'usage français (NF C 15-100) — interrupteur (cercle + trait incliné), prise de courant (demi-cercle + trait), point lumineux (cercle barré d'une croix), tableau électrique (rectangle hachuré) ; thermostat (cercle + « T ») ; VMC (cercle + flèche), grille (rectangle à barreaux), conduit (cercle double) ; compteurs (cercle + lettre E / G / ⚡ → « E », « G », « EL ») ; sécurité (détecteur : cercle + « DF », éclairage de secours : rectangle + « BAES », extincteur : triangle + « EX ») ; menuiseries (fenêtre : double trait, porte : arc d'ouverture, placard : rectangle à croix) ; occultations (volet : trait épais pointillé, store : zigzag) ; désordres (fissure : ligne brisée, humidité : gouttes, dégradation : étoile, matériau suspect : triangle « ! »).
- `orientationPiece(contour)` → degrés (angle du plus long côté, ramené dans ]-45°, 45°]).
- `primitivesPlacees(code, { x, y, angle })` → primitives transformées en mètres (pour le canevas du PDF et l'écran).
- `symboleSvg(code)` → `{ viewBox, elements }` (données pures que `SymboleEdl.jsx` dessine).

**Tests :** couverture des types, tailles (boîte de chaque symbole : appareils à ± 20 % des dimensions ci-dessus, fixes ≤ 0,35 m), orientation (rectangle tourné de 10° → 10°, de 100° → 10°), placement (translation + rotation).

Commit : `feat: état des lieux — export : symboles usuels (catalogue, planche)`.

---

### Task 2 : Écrivain DXF par calques

**Files :**
- Create : `src/modules/etude/etat-des-lieux/export/exportDxfEdl.js` (pur ; encodage Windows-1252 dans `encodageDxf.js` si utile)
- Test : `tests/etat-des-lieux-export-dxf.test.js`

**API :** `elementsAExporter({ pieces, points, elements, inclurePropositions })` → `[{ id, pieceId, x, y, calque, type, libelle, cotes, numero, aValider }]` (règles des Décisions) ; `genererDxfEdl({ niveau, pieces, elementsExport, photos, unitesParMetre, plan = null })` → `string` ; `encoderDxf(texte)` → `Uint8Array` (cp1252).

**Contenu :**
- En-tête (`$ACADVER`, `$INSUNITS`, `$DWGCODEPAGE`, `$EXTMIN` / `$EXTMAX`), `TABLES` (`LTYPE` CONTINUOUS, `LAYER` : un par calque `EDL-` utilisé + `EDL-À valider` si besoin + calques d'origine si `plan`, `STYLE` STANDARD), `BLOCKS` (un `EDL_<CODE>` par type utilisé, primitives × `unitesParMetre`), `ENTITIES`.
- **EDL-Pièces** : contour de chaque pièce (`POLYLINE` fermée), et au centre : nom (+ numéro), surface (« 12,5 m² », écrite ou calculée), HSP si connue (« HSP 2,50 »).
- **EDL-Finitions** : sous le nom, « Sol : … », « Murs : … », « Plafond : … », « Plinthes : … » (lignes `TEXT`, champs vides omis).
- **Éléments** : `INSERT` du bloc sur le calque du type, rotation `orientationPiece`, puis un `TEXT` « numéro · libellé » à côté ; **EDL-Cotes** : les cotes dictées en `TEXT` sous le libellé ; un élément sans point est écrit en texte dans sa pièce (liste sous les finitions) ; propositions non validées sur `EDL-À valider`.
- **EDL-Photos** : un petit cercle numéroté « Ph n » au point de chaque photo.
- `plan` (fichier vectoriel allégé décodé, `decoderVecteurs`) : traits en `LINE` / `POLYLINE` sur leur calque d'origine (noms rendus valides pour R12 : 31 caractères, caractères interdits remplacés), masses en `POLYLINE` fermées, textes en `TEXT`.
- Hauteurs de texte en mètres converties : nom 0,20 m, finitions et libellés 0,12 m.

**Tests (relecture par `lireDxf`) :** calques présents et nommés, blocs définis une fois et insérés au bon endroit (coordonnées × unité, cm et m), rotation, accents (« Électricité », « Pièces » relus à l'identique), propositions sur `EDL-À valider` seulement si demandé, élément sans point en texte, point typé sans élément exporté, `plan` présent / absent, fichier sans élément (pièces seules) valide.

Commit : `feat: état des lieux — export : DXF par calques EDL- (R12, unités du plan d'origine)`.

---

### Task 3 : Rapport PDF

**Files :**
- Create : `src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js` (pur : `definitionRapportEdl({ affaire, etat, niveaux, pieces, elementsExport, photos, images, redacteur, date })` → définition pdfmake)
- Create : `src/modules/etude/etat-des-lieux/export/genererRapportEdl.js` (navigateur : images puis pdfmake, `chargerPdfMake` des CR)
- Test : `tests/etat-des-lieux-export-pdf.test.js`

**Contenu :** page de garde (code et nom de l'affaire, adresse, « État des lieux », date, rédacteur, photo de couverture si `affaires.photo_url` comme les CR) ; **par étage**, une page paysage avec le plan (image JPEG fabriquée sur canevas : plan allégé du fichier vectoriel, contours des pièces, symboles et numéros des éléments — `primitivesPlacees`) ; puis **une fiche par pièce** : nom, surface, HSP, finitions (tableau), éléments **numérotés et groupés par calque** (numéro, libellé, cotes, « à valider » le cas échéant), remarques, photos des points (miniatures JPEG, `imagePourPdf` des CR), « points sans élément ». Roboto : pas de symboles hors latin courant (pas de ▶ ✓). Pied de page « Affaire · État des lieux · page n / N ».

**Tests :** structure de la définition (garde, une page plan par étage, une fiche par pièce visitée, éléments groupés par calque dans l'ordre de `calquesEdl.js`, propositions marquées, pièce non visitée omise ou signalée), aucun caractère hors latin courant dans les textes produits.

Commit : `feat: état des lieux — export : rapport PDF pièce par pièce`.

---

### Task 4 : Écran « Export » et ZIP

**Files :**
- Create : `src/modules/etude/etat-des-lieux/export/ExportEdl.jsx`, `export/exportDonnees.js` (lecture de tout ce qu'il faut : étages avec `unites_par_metre`, `chemin_vecteurs`, pièces, points, éléments, photos ; liens signés des photos et des fichiers vectoriels via `obtenirLiens`)
- Modify : `src/modules/etude/etat-des-lieux/index.jsx` — troisième onglet « Export » (à côté de « Pièces » / « Relecture », `?vue=export`).

**Écran :** étages à exporter (cases, tous cochés), « Inclure les propositions non validées » (décoché ; ambre si des propositions restent : « N éléments à valider ne seront pas exportés »), « DXF avec le plan existant » (coché), « Rapport PDF » (coché) ; bouton « Préparer l'export » → progression (« Étage RDC : DXF… », « Rapport : images… ») → téléchargement `AAAA-MM-JJ-<code affaire>-etat-des-lieux.zip` (`telechargerBlob` des CR, `zipSync` de fflate, DXF encodés cp1252) ; une **planche des symboles** repliable (« Symboles utilisés — à relire par l'agence ») ; une note : « Dans ArchiCAD : Fichier → Fusionner → choisir le DXF `…-EDL.dxf` (même unité et mêmes coordonnées que le plan d'origine). » Lecture seule : l'export reste possible (il ne modifie rien). Hors ligne : « L'export demande du réseau (photos, plans). »

Commit : `feat: état des lieux — écran d'export (ZIP : DXF par étage et rapport PDF)`.

---

### Task 5 : Documentation et vérification finale

- `CLAUDE.md`, section « État des lieux » : puce **Export (lot 4)** (rulings ci-dessus, R12 cp1252, unités, deux DXF par étage, rapport, planche des symboles à relire) ; nombre de tests.
- Spec § 7 : ce qui a été fait et pourquoi (pas d'écriture dans le DXF d'origine).
- `npm test`, `npm run build`, `npx eslint src`.

Commit : `docs: état des lieux — lot 4 (export) dans CLAUDE.md et la conception`.
