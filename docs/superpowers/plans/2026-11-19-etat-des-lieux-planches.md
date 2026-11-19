# État des lieux — planches A3 « report relevé » (PDF et Word) : plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal :** le rapport d'état des lieux prend la forme des planches que l'agence a montrées en exemple (« 10-1 EXISTANT - Plan R-1 - report relevé », PDF + Word « symboles déplaçables », gardés hors dépôt dans `~/Downloads/Relevés/`) : **une planche A3 paysage par étage**, plan existant au **1/100** (1/200 si l'étage ne tient pas), **symboles seuls** (sans numéro ni texte) colorés par famille et tournés contre leur mur, multiplicateur « ×n » pour les prises, **légende encadrée** des seuls symboles utilisés, **cartouche** de l'agence. Les fiches par pièce restent, **en annexe** après les planches. Le Word reprend les planches avec le plan en fond verrouillé et **chaque symbole en image flottante déplaçable** (nommée d'après son type), la légende en image flottante à part.

**Décisions de l'agence (2026-11-19) :** fiches gardées en annexe ; symboles seuls sur la planche (pas de « P7 ») ; A3 au 1/100, 1/200 si trop grand.

**Architecture :** une fonction pure **`misePlanche`** décide tout ce qui est sur une planche (échelle, passage mètres → mm papier, place de la légende, contenu du cartouche, liste des symboles avec position papier, angle, quantité, couleur, nom). Le **dessin** (canevas, contexte 2D injecté, sans DOM) et le **Word** lisent cette même mise : ce qui est dans le PDF est ce qui est dans le Word. Le PDF mêle A4 (garde, fiches) et A3 (planches) : pdfmake ne sait pas changer de format en cours de document, donc **garde et fiches sont deux documents pdfmake A4, les planches des pages A3 posées par pdf-lib, le tout assemblé par pdf-lib** (pied de page « … page n / N » écrit par pdf-lib sur les pages A4).

**Tech Stack :** React 19 + Vite, pdfmake (A4), pdf-lib 1.17 (déjà en dépendance, chargé à la demande), docx 9.15.2 (épinglé), canevas 2D, `node --test`.

**Spec :** `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` § 7 (export) ; ce plan en est l'avenant (demande du 2026-11-19).

## Global Constraints

- Français partout (code métier, commentaires qui disent pourquoi, messages). Styles inline, charte du module (`--affaire-accent`, bordures 0,5 px, angles 2–3 px, ambre `#FFFBEB` / `#92400E`). Cibles de 44 px.
- **Dépôt public** : aucun nom, plan ni donnée réels dans le code ou les tests (données inventées). Les exemples de l'agence restent hors dépôt.
- **Aucun appel payant** dans ce travail.
- **Mêmes règles partout** : ce qui part dans le DXF, le PDF et le Word passe par les mêmes fonctions (`elementsAExporter`, `ficheExportEdl.js`, `numeroterPhotos`, `suiteRapportEdl`, nouvelles `orientationElement` / `quantiteElement` / `misePlanche`). Ne jamais décider un contenu dans un seul format.
- Rapport PDF : Roboto n'a que le latin courant, tout texte venu de la base passe par `texteLatin`. Pied ajouté par pdf-lib en Helvetica (WinAnsi) : passer aussi par `texteLatin`.
- Dessin : contexte 2D injecté (`ctx`), aucune dépendance au DOM dans les fichiers de logique et de dessin ; testé avec un contexte enregistreur (voir `tests/etat-des-lieux-export-pdf.test.js`, `new Proxy({}, …)`).
- iPad : un canevas ≤ 16 Mpx ; libérer chaque canevas après encodage (`libererCanevas`) ; garder les images en Blob tant que la fabrication continue.
- `npm test` vert, `npm run build` réussi, `npx eslint src` sans problème ajouté (72 préexistants). Commits `feat:` / `fix:` / `test:` / `docs:` finissant par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Ne jamais pousser** (le contrôleur pousse).

---

### Task 1 : Types d'éléments de l'exemple, couleurs par famille, orientation contre le mur, quantité

**Files :**
- Modify : `src/modules/etude/etat-des-lieux/calquesEdl.js` (types), `export/symbolesEdl.js` (symboles, `orientationElement`, `quantiteElement`, `TYPES_MURAUX`), `export/rapportEdlLogique.js` (`COULEURS_CALQUES`), `export/exportDxfEdl.js` et `export/planRapportEdl.js` (utiliser `orientationElement` au lieu de `orientationPiece` pour l'angle des symboles)
- Test : `tests/etat-des-lieux-export.test.js` (symboles), `tests/etat-des-lieux-export-dxf.test.js` si une rotation attendue change, nouveau bloc dans `tests/etat-des-lieux-export.test.js` pour orientation et quantité

**Types ajoutés** (calque `electricite` sauf mention ; libellés de la légende de l'exemple) : `rj45` « Prise informatique RJ45 », `applique` « Point lumineux en applique », `dalle` « Luminaire plafond carré (dalle) », `reglette` « Luminaire linéaire (réglette) », `goulotte` « Goulotte électrique », `baie-brassage` « Baie de brassage ». Garder `luminaire` (« Luminaire », plafonnier rond : cercle barré d'une croix). `detecteur-fumee` (sécurité) garde son code ; son symbole devient celui de l'exemple (rond noir à point central, « DAAF » n'est plus écrit dans le symbole). Chaque nouveau type a son symbole dans `SYMBOLES`, taille fixe, dessiné comme la légende de l'exemple : RJ45 = petit rectangle avec « RJ » ; applique = cercle barré d'une croix avec un petit trait vers le mur ; dalle = carré barré de ses deux diagonales ; réglette = rectangle allongé 0,9 × 0,15 m barré de ses diagonales (taille réelle) ; goulotte = deux traits parallèles de 0,9 m (taille réelle) ; baie de brassage = rectangle 0,6 × 0,6 hachuré. Le test « aucun type sans symbole » doit rester vert. Les consignes de Claude et la barre de la visite lisent `calquesEdl.js` : rien d'autre à faire pour eux (vérifier que leurs tests passent).

**Couleurs par famille** (`COULEURS_CALQUES`, utilisées par planche, légende, fiches) — calées sur l'exemple : électricité `#1565C0` (bleu), sécurité `#1F1B17` (noir), désordres `#8E44AD` (violet), plomberie `#0E7490`, chauffage `#C2410C`, ventilation `#2A8A4E`, menuiseries `#6B4E2E`, occultations `#6B6B6B`, compteurs `#6B3FA0`. `COULEUR_PROPOSITION` (bleu de l'IA) reste distinct de l'électricité : les propositions sur une planche sont dessinées dans la couleur de leur famille **entourées d'un cercle pointillé** (`COULEUR_PROPOSITION`), et la légende ajoute l'entrée « à valider ».

**`TYPES_MURAUX`** (Set exporté) : interrupteur, prise, rj45, applique, goulotte, tableau-electrique, baie-brassage, radiateur, thermostat, lavabo, evier, wc, ballon-eau-chaude, chaudiere, grille, compteur-eau, compteur-gaz, compteur-electricite, extincteur, eclairage-secours (n'y mettre que des codes qui existent dans `calquesEdl.js` — test).

**`orientationElement({ type, x, y }, piece)` → degrés.** Type mural et point à moins de 0,8 m d'un côté du contour de sa pièce : angle du côté le plus proche, retourné de 180° si besoin pour que l'axe local +y du symbole pointe **vers l'intérieur de la pièce** (le dos du symbole contre le mur) ; sinon `orientationPiece(piece.contour)` ; sans pièce, 0. Vérifier sur chaque symbole mural que son « dos » est bien du côté −y local (le redessiner sinon) : c'est la convention de ce travail, à écrire en tête de `symbolesEdl.js`. Le DXF (`exportDxfEdl.js`, `angleDe` / repères) et le rapport (`marquesElements`) utilisent cette même fonction ; les tests de placement d'étiquettes doivent rester verts (adapter les attentes d'angle si un test fixait l'angle de la pièce pour un type mural, en le disant dans le rapport).

**`quantiteElement(e)` → entier ≥ 1**, lu dans le libellé (`e.libelle`, insensible à la casse et aux accents) : « ×3 », « x3 », « x 3 », « 3 prises », « trois prises », « double » → 2, « triple » → 3, « quadruple » → 4 ; nombres en lettres de deux à six ; sinon 1. Seulement pour les types `prise`, `rj45` (renvoyer 1 pour les autres). Pas de migration.

Commit : `feat: état des lieux — types et symboles de l'exemple de l'agence, symboles contre leur mur, quantité des prises`.

---

### Task 2 : Mise en page d'une planche (pur)

**Files :**
- Create : `src/modules/etude/etat-des-lieux/export/plancheEdl.js` (pur, sans DOM)
- Test : `tests/etat-des-lieux-export-planche.test.js`

**Constantes :** `FORMAT_A3 = { nom: 'A3', largeur: 420, hauteur: 297 }` (mm, paysage) ; marge 8 mm ; cartouche en bas, hauteur 24 mm, sur toute la largeur utile ; `ECHELLES = [100, 200, 250, 500, 1000]` ; symbole à taille fixe **4,5 mm sur le papier** quelle que soit l'échelle (les symboles `taille: 'reelle'` restent à l'échelle du plan) ; `DPI_PLANCHE = 200`.

**`misePlanche({ niveau, pieces, elementsExport, boiteVecteurs = null, affaire, date, redacteur, numero, indice, inclurePropositions })`** → objet sérialisable :
- `format`, `zone` (rectangle mm du dessin : au-dessus du cartouche), `echelle` (première de `ECHELLES` qui fait tenir l'emprise des pièces + 1,5 m de marge, à défaut celle des vecteurs, dans `zone`), `transform` : `{ mmParMetre, origineM: [x, y], origineMm: [x, y] }` avec `versMm([x, y]) → [xMm, yMm]` exportée à part (`versMmPlanche(transform, pt)`, **y du papier vers le bas**), plan centré dans `zone`.
- `symboles` : un par élément exporté qui a une position, `{ cle, elementId, code (type, ou null), calque, nom (libellé du type, sinon du calque), xMm, yMm, angle (orientationElement, en degrés, sens du plan) , quantite (quantiteElement), aValider, couleur (couleurCalque), tailleMm: { largeur, hauteur, ancre: [dx, dy] } }` — la taille est celle de la boîte des primitives tournées à la taille papier (fixe : 4,5 mm pour le plus grand côté de la boîte non tournée ; réelle : à l'échelle), `ancre` = position du point d'insertion dans cette boîte (pour poser une image flottante du Word). Plusieurs éléments au même point : décalés par `decalagesSymboles` comme le DXF. Clé d'image `cle` = `${code}|${angle arrondi à 5°}|${quantite}|${aValider ? 1 : 0}` (les images identiques du Word sont partagées).
- `legende` : `{ titre: 'LÉGENDE – ÉTAT DES LIEUX <ÉTAGE EN MAJUSCULES>', groupes: [{ calque, libelle, couleur, entrees: [{ code, libelle }] }] }` — seulement les types présents sur la planche, groupes dans l'ordre de `CALQUES`, entrées dans l'ordre du calque ; entrée « Prise de courant (×n : nb de prises) » quand une prise a `quantite > 1` ; entrée « à valider » s'il y a une proposition ; `note` : « Relevé du <date> (<rédacteur>). Positions relevées sur site, à vérifier. » ; `coin` (`'haut-droite'` par défaut, sinon le coin de `zone` dont la légende recouvre le moins les contours des pièces et les symboles) et `cadreMm` (x, y, largeur, hauteur estimées : 2 colonnes, 5 mm par entrée, titre 9 mm, note 7 mm, largeur 150 mm, moins si une seule colonne suffit).
- `cartouche` : `{ affaire (nom), adresse, code, echelle: '1:100', format: 'A3', phase: 'EDL', date (JJ/MM/AAAA), indice, numero, titre: 'EXISTANT - Plan <étage>' }` (textes par `texteLatin`), et `cases` : la grille du cartouche en mm (comme l'exemple : bloc affaire + adresse à gauche ; colonnes Affaire / Échelle / Format puis Phase / Date / Indice sur deux lignes ; numéro en grand ; titre ; logo à droite).

**Tests :** échelle 1/100 pour un étage de 30 × 20 m, 1/200 pour 60 × 40 m, 1/500 pour 150 m ; plan centré ; `versMmPlanche` (y retourné) ; symbole fixe = 4,5 mm à toutes les échelles, réglette à l'échelle ; quantité et angle repris de Task 1 ; légende réduite aux types utilisés, ordre des calques, entrée ×n, entrée « à valider » ; coin de légende qui évite un bâtiment posé en haut à droite ; cartouche ; même entrée → même sortie.

Commit : `feat: état des lieux — mise en page des planches A3 (échelle, légende, cartouche)`.

---

### Task 3 : Dessin d'une planche, de sa légende et d'un symbole (canevas, sans DOM)

**Files :**
- Create : `src/modules/etude/etat-des-lieux/export/dessinPlancheEdl.js`
- Test : `tests/etat-des-lieux-export-planche.test.js` (contexte enregistreur)

**API (tout en pixels pour `pxParMm`, `DPI_PLANCHE / 25.4` par défaut) :**
- `dessinerPlanche(ctx, mise, { vecteurs = null, fond = null, logo = null, pxParMm, avecSymboles = true, avecLegende = true })` : fond blanc ; plan existant (vecteurs par `dessinerVecteurs` de `vecteursEdlLogique.js` dans le repère de `mise.transform`, traits fins noirs/gris comme l'exemple, masses pochées ; à défaut l'image `fond` de l'étage placée par son cadrage) ; **pas** de contours de pièces en couleur ni de désignations (le plan d'origine porte déjà noms, surfaces, HSP) ; si `avecSymboles`, chaque symbole (`dessinerSymbole`) ; si `avecLegende`, la légende à `mise.legende.cadreMm` ; le cartouche (cadre, filets 0,25 mm, textes Arial/Helvetica ; logo si fourni, sinon « JGA » en texte).
- `dessinerSymbole(ctx, symbole, { centrePx: [x, y], pxParMm })` : primitives de `SYMBOLES[code]` tournées de `symbole.angle` (attention : y du papier vers le bas, l'angle du plan est trigonométrique — inverser le sens), à la taille de `symbole.tailleMm`, trait 0,35 mm de `symbole.couleur` ; « ×n » à droite si `quantite > 1` (police 2,2 mm, même couleur, non tournée) ; proposition : cercle pointillé `COULEUR_PROPOSITION` autour ; élément sans type : losange plein de sa couleur.
- `dessinerLegende(ctx, legende, { origineMm, pxParMm })` : comme l'exemple — cadre noir 0,5 mm, bandeau noir avec le titre en blanc gras, deux colonnes (titre de groupe gris gras, puis symbole + libellé), séparateur vertical, note en bas sous un filet.
- `tailleImageSymbole(symbole, pxParMm)` → `{ largeur, hauteur, centre: [x, y] }` en pixels, pour fabriquer l'image d'un seul symbole (Word), ×n compris, transparente.

**Tests :** un enregistreur de contexte vérifie : les symboles tracés à leur position (centre attendu ± 1 px), absents si `avecSymboles: false` ; la légende absente si `avecLegende: false` ; « ×3 » écrit pour une prise triple ; le titre de la légende et le titre du cartouche écrits ; aucun appel hors du canevas (coordonnées dans [0, largeur] × [0, hauteur]).

Commit : `feat: état des lieux — dessin des planches, de la légende et des symboles`.

---

### Task 4 : Rapport PDF assemblé (garde A4, planches A3, fiches A4 en annexe)

**Files :**
- Modify : `export/rapportEdlLogique.js` (`definitionRapportEdl` → deux définitions : `definitionGardeEdl(params)` et `definitionFichesEdl(params)` ; les pages `plan` de `suiteRapportEdl` ne produisent plus de page pdfmake — la planche les remplace ; pas de `footer` pdfmake) ; `suiteRapportEdl` inchangée sinon.
- Create : `export/assemblageRapportEdl.js` (pdf-lib, testable dans Node) : `assemblerRapport({ garde: octets PDF, planches: [{ jpeg: octets, largeurMm, hauteurMm }], fiches: octets PDF | null, pied: texte })` → octets PDF : pages de la garde, une page A3 paysage par planche (image pleine page), puis les fiches ; pied « <pied> · page n / N » (Helvetica 7 pt, gris `#5E5854`, à 36 pt du bord gauche, 22 pt du bas) sur toutes les pages A4, N = nombre total de pages ; métadonnées titre/auteur.
- Modify : `export/genererRapportEdl.js` : par étage, la mise (`misePlanche`, numéro et indice reçus des réglages), un canevas A3 à `DPI_PLANCHE` (≤ 16 Mpx : vérifier, sinon réduire le dpi) dessiné par `dessinerPlanche` (avec symboles et légende) → JPEG (qualité 0,85) ; extraits de pièce et photos comme aujourd'hui ; garde et fiches par pdfmake ; assemblage par `assemblerRapport` (pdf-lib chargé par `import()`). Le plan d'étage A4 actuel (`imagePlan` sur `cadragePlan`) disparaît. `fabriquerWord` reçoit en plus, par étage, la mise et une image de **fond sans symboles ni légende** (JPEG, même canevas redessiné avec `avecSymboles: false, avecLegende: false`), une image PNG de la **légende seule** et une PNG transparente par **clé de symbole** (`tailleImageSymbole`) — fabriquées une fois, gardées en Blob.
- Test : `tests/etat-des-lieux-export-pdf.test.js` (adapter : plus de page `plan-…` dans les définitions ; garde et fiches séparées ; le contenu des fiches inchangé), nouveau test d'assemblage (pdf-lib dans Node : PDF A4 inventés de 1 et 2 pages + 2 planches JPEG minimales → 5 pages, tailles A4/A3 dans le bon ordre, texte du pied présent sur les pages A4 seulement).

Commit : `feat: état des lieux — rapport PDF : planches A3 par étage, fiches en annexe`.

---

### Décisions de l'agence, deuxième temps (2026-11-19)

L'agence a montré une **synthèse par pièce** qui lui convient (artefact « 2135-NOD — Rapport d'état des lieux avec description des matériaux et installations », hors dépôt) : en tête des **chiffres clés** et des **points d'attention**, puis **un tableau par niveau**, une ligne par pièce, colonnes **Pièce · Sol · Mur · Plafond · Bloc porte (huisserie, vantail, quincaillerie) · Équipements · Points particuliers** ; chaque matériau porte un **statut** : *Conserver* (vert `#3F7D3A`, étiquette cernée), *Rafraîchir* (remise en état sans dépose : peinture, reprise, rebouchage — texte `#8E5508`, cerne pointillé `#B7700A`), *Déposer* (dépose, remplacement, suppression — blanc sur `#B9481B`), *À préciser* (rien n'est dit — gris `#5A554F`, cerne tireté `#938980`). Équipements et points particuliers : sans statut. Choix de l'agence : **ces tableaux remplacent les fiches d'une page par pièce** (rapport : garde, planches A3, tableaux par niveau, **photos en annexe**) ; **statuts proposés par l'analyse**, modifiables en relecture ; **chiffres clés et points d'attention calculés par l'app** (aucun appel payant).

---

### Task 5 : Fiche de pièce — statuts et bloc porte

**Files :**
- Modify : `src/modules/etude/etat-des-lieux/analyse/analyseEdlLogique.js` (`RUBRIQUES_FICHE`, bornes, consignes et schéma JSON de la fiche, `completudeFiche` inchangée : la porte n'est pas obligatoire), `api/analyser-edl.js` si le schéma y est recopié, `analyse/FicheRelecture.jsx` (un menu de statut à côté de Sol, Murs, Plafond, Plinthes et Bloc porte ; trois champs Huisserie / Vantail / Quincaillerie), `export/ficheExportEdl.js` (statuts et porte suivent la règle « fiche proposée écartée »), `export/exportDxfEdl.js` (ligne de finition « Sol : Carrelage (Conserver) » ; « Porte : huisserie bois, vantail bois, … (Rafraîchir) » si renseignée).
- Create : `src/modules/etude/etat-des-lieux/statutsEdl.js` (pur) : `STATUTS = [{ code: 'conserver', libelle: 'Conserver', … couleurs }, { code: 'rafraichir', … }, { code: 'deposer', … }, { code: 'a-preciser', … }]`, `statutDe(fiche, rubrique)` → code (`'a-preciser'` si absent ou inconnu, et si la rubrique est vide), `libelleStatut(code)`.
- Test : `tests/etat-des-lieux-analyse-ia.test.js` (schéma, consignes), `tests/etat-des-lieux-relecture-analyse.test.js` si concerné, nouveau `tests/etat-des-lieux-statuts.test.js`, DXF.

**Forme de la fiche** (jsonb `edl_pieces.fiche`, **aucune migration**) : les rubriques texte restent (`sol`, `murs`, `plafond`, `plinthes`, `hsp`, `remarques`) ; s'ajoutent `porte: { huisserie, vantail, quincaillerie }` (textes courts, `""` si rien) et `statuts: { sol, murs, plafond, plinthes, porte }` (codes de `STATUTS`, ou `null`). Une ancienne fiche sans ces clés se lit telle quelle (statuts « À préciser », porte vide). **Consignes à Claude** : un statut par rubrique d'après ce qui est dit (« à repeindre », « à reprendre », « reboucher » → rafraichir ; « à remplacer », « à déposer », « à supprimer », « hors service » → deposer ; « bon état », « à garder » → conserver ; rien de dit sur l'état → null) ; bloc porte décrit d'après ce qui est dit (un bloc porte « bois » = huisserie et vantail bois ; « métallique » = huisserie métallique, vantail bois) ; la fiche actuelle (corrigée par l'agence) garde ses statuts sauf si la frise les contredit clairement. Le schéma JSON imposé accepte `null` (`anyOf`). En relecture, **modifier un statut vaut validation** de la fiche, comme le reste.

Commit : `feat: état des lieux — statuts des matériaux et bloc porte dans la fiche (analyse, relecture, DXF)`.

---

### Task 6 : Rapport PDF — synthèse, tableaux par niveau, annexe photos

**Files :**
- Create : `src/modules/etude/etat-des-lieux/export/tableauxEdlLogique.js` (pur) :
  - `lignesTableau({ pieces visitées d'un niveau, elementsExport, photos numérotées, points, inclurePropositions })` → `[{ piece: { designation, numero, surface, hsp }, sol: [{ texte, statut }], mur: […], plafond: […], porte: { huisserie, vantail, quincaillerie, statut } | null, equipements: [texte], particuliers: [texte] }]` — sol : sol puis plinthes (« Plinthes : … ») ; mur : murs ; plafond : plafond ; équipements = éléments exportés hors désordres, regroupés par type avec leur nombre (« 3 prises de courant », quantités de `quantiteElement`), cotes et « Ph n » à la suite ; points particuliers = désordres (libellé, cotes, « Ph n ») puis `remarques` de la fiche. Les propositions suivent la règle habituelle (marquées « à valider » si incluses). Une rubrique vide : `[]` (affichée « Non décrit »).
  - `syntheseRapport({ etages, lignes })` → `{ chiffres: [{ valeur, libelle }], attention: [{ titre, texte }] }` : chiffres — pièces relevées (détail par niveau), éléments à déposer sur éléments décrits (rubriques statuées « Déposer » / rubriques renseignées), à rafraîchir, à préciser, désordres relevés ; points d'attention — par niveau : les désordres (pièce : libellé), puis les rubriques à déposer (pièce : rubrique, texte), puis les rubriques « À préciser » non vides (« à vérifier »). Au plus 5 entrées, regroupées par thème (Désordres, À déposer, À vérifier), textes tronqués proprement.
- Modify : `export/rapportEdlLogique.js` — `definitionGardeEdl` porte en plus, sous le tableau des étages, les **chiffres clés** (grands nombres, filet orange au-dessus, comme l'artefact) et l'encadré **Points d'attention** (fond `#F4F1EE`, filet orange à gauche) ; `definitionFichesEdl` est remplacée par `definitionTableauxEdl` (**A3 paysage**, un tableau par niveau : titre du niveau précédé d'un carré orange, ligne de comptes « 21 locaux · 0 à déposer · 17 à rafraîchir · … », en-tête répété à chaque page, une ligne par pièce insécable, étiquettes de statut dessinées comme l'artefact, légende « Lecture du tableau » une fois avant le premier tableau, note « Sources » à la fin) et `definitionPhotosEdl` (A4 portrait, « Annexe — Photos », par niveau puis pièce, 3 par rangée, légende « Ph n · pièce · élément », comme `lignePhotos`). La page « Hors pièces » devient une ligne « Hors pièces » en fin de tableau du niveau. Extraits de plan par pièce : supprimés (les planches les remplacent ; ne plus les dessiner dans `genererRapportEdl.js`).
- Modify : `export/genererRapportEdl.js` et `export/assemblageRapportEdl.js` : garde (A4) + planches (A3) + tableaux (A3) + photos (A4) ; pied sur les pages A4 **et** A3 de tableaux (pas sur les planches, qui ont leur cartouche) — adapter `assemblerRapport` pour recevoir une suite de documents `{ octets, pied: true|false }` ou `{ planches }`.
- Test : `tests/etat-des-lieux-export-tableaux.test.js` (nouveau), `tests/etat-des-lieux-export-pdf.test.js` (adapter), test d'assemblage.

Commit : `feat: état des lieux — rapport : synthèse, tableaux par niveau avec statuts, photos en annexe`.

---

### Task 7 : Rapport Word — planches à symboles déplaçables, tableaux, photos

**Files :**
- Modify : `export/rapportWordEdl.js`
- Test : `tests/etat-des-lieux-export-word.test.js`

Même suite que le PDF : **garde** (A4 portrait, chiffres clés et points d'attention en vrai texte) ; **par étage une section A3 paysage, marges 0, pied vide**, un paragraphe d'images **flottantes** positionnées par rapport à la page (`floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset }, wrap: { type: TextWrappingType.NONE }, allowOverlap: true }`, offsets en EMU = mm × 36 000) : le **fond** (planche sans symboles ni légende, pleine page, `behindDocument: true, lockAnchor: true`, `altText` « Fond de plan <titre> »), la **légende** (PNG à `legende.cadreMm`, `altText` « Légende »), puis **chaque symbole** (PNG de sa clé, posé pour que son point d'insertion tombe sur `xMm, yMm` : image à `(xMm − centre[0]/pxParMm, yMm − centre[1]/pxParMm)`, `altText` = nom du type) ; puis les **tableaux par niveau** en A3 paysage (vrais tableaux Word, en-tête répété, statuts en étiquettes de couleur : texte coloré gras sur fond clair, Déposer blanc sur `#B9481B`), légende « Lecture du tableau », note Sources ; puis l'**annexe photos** en A4 portrait. Même contenu que le PDF : tout vient de `suiteRapportEdl`, `misePlanche`, `lignesTableau`, `syntheseRapport`. `documentWordEdl` reçoit `planches: [{ niveauId, mise, fond, legende, symboles: Map cle → octets PNG }]` (fabriqués par `genererRapportEdl`). Un étage sans fond : section quand même, symboles posés, texte « Plan indisponible ».

**Tests :** XML relu (fflate) : section A3 (`w:pgSz w:w="23811" w:h="16838" w:orient="landscape"`, marges 0) d'un étage à 3 symboles dont 2 identiques → 1 + 1 + 3 `wp:anchor`, la première `behindDoc="1"` et `locked="1"`, les symboles `behindDoc="0"` / `locked="0"`, `descr` = nom du type, positions EMU attendues ; 2 images de symbole dans `word/media` ; tableau d'un niveau : en-têtes des 7 colonnes, une ligne par pièce, statuts écrits ; annexe photos ; pied paginé absent des planches.

Commit : `feat: état des lieux — rapport Word : planches à symboles déplaçables, tableaux, photos`.

---

### Task 8 : Fenêtre d'export, documentation

**Files :**
- Modify : `export/ExportEdl.jsx`, `export/exportFenetreLogique.js` (réglages `indice` (texte, vide par défaut → date du jour au cartouche) et `numeros` (niveauId → texte, défaut « EDL-1 », « EDL-2 »… dans l'ordre des étages) ; `cleRapport` les inclut ; mémorisés par affaire sur l'appareil, lecture/écriture sous try/catch) ; section « Planches » de la fenêtre : un champ « Indice » et un champ « N° » par étage coché (44 px de haut) ; l'onglet « Rapport PDF » montre le PDF assemblé (pages A3 et A4 mêlées : vérifier que l'aperçu pdf.js les réduit à la largeur).
- Modify : `CLAUDE.md` (section État des lieux, puce Export : planches, assemblage pdf-lib, tableaux et statuts, Word à symboles flottants, `orientationElement`, `quantiteElement`, nouveaux types ; nombre de tests), conception `2026-11-17-etat-des-lieux-design.md` § 7 (avenant du 2026-11-19).
- Test : `tests/etat-des-lieux-export-fenetre.test.js` (réglages par défaut, clé du rapport qui change avec l'indice et un numéro).

Commit : `feat: état des lieux — fenêtre d'export : numéros et indice des planches` puis `docs: …`.
