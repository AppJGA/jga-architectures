# DPGF dans les pièces écrites — conception

Validée avec l'agence le 2026-10-19.

## 1. Le besoin

Importer, à côté des CCTP, les DPGF (décomposition du prix global et
forfaitaire) des bureaux d'études, en Excel ou en PDF. On les **consulte**
(tableau des articles, unités, quantités), on les **cherche**, et chaque
ligne est **reliée à l'article du CCTP** de même numéro : en lisant un
article du CCTP, on voit ses quantités dessous. Au bureau et en visite de
chantier, sans réseau, comme les CCTP.

Module « Pièces écrites » (`src/modules/etude/pieces-ecrites/`).

## 2. Décisions

| Sujet | Décision |
|---|---|
| Usage | **Consulter et lier au CCTP.** Ni comparaison des offres, ni suivi financier (plus tard, si besoin). |
| Version | **DPGF vierges du DCE seulement** : on garde unités et quantités, **jamais les prix** (colonnes P.U. et montant ignorées). |
| Formats | Excel (.xls, .xlsx) et PDF. **L'Excel est préféré** : importés ensemble pour un même lot, le PDF est écarté. |
| PDF mixte | Un PDF peut contenir le CCTP **et** le tableau du DPGF : les pages à tableau donnent le DPGF, les autres le CCTP. |
| IA | **Aucune**, comme les CCTP : règles, testées. |
| Fichier d'origine | **Non gardé** : seules les lignes lues (stockage plafonné à 1 Go). |
| Lien CCTP ↔ DPGF | **Calculé à l'affichage**, jamais enregistré : même lot, même numéro d'article. L'ordre des imports ne compte pas ; les CCTP déjà importés n'ont rien à refaire. |
| Présentation | **Une tuile par lot**, boutons « CCTP » et « DPGF ». Lignes du DPGF **toujours affichées** sous l'article dans la lecture du CCTP. |
| Recherche | Couvre aussi les lignes de DPGF, marquées « DPGF ». |
| Visite | Copie sur l'appareil avec les CCTP ; le bouton « CCTP » du mode Visite devient « Pièces écrites ». |
| Versions | Un nouveau DPGF d'un lot remplace l'ancien DPGF de ce lot — **jamais son CCTP**. |
| Droits | Ceux de la migration 061 : agence seule, écriture des collaborateurs de l'affaire (060). |

## 3. Constats sur les exemples

9 DPGF d'exemple (2 affaires, 4 mises en page de bureaux d'études), gardés
**hors du dépôt** (`Desktop/PERSO/Exemples DPGF`). Aucun extrait réel dans
le dépôt ni dans les tests : il est public.

- **Feuilles** : une page de garde (adresses, phase, dossier), une feuille
  de tableau, parfois un récapitulatif par chapitre. Seule la feuille dont
  une ligne d'en-tête nomme désignation **et** quantité est lue.
- **En-tête** variable : `Désignation | U | Quantité | Prix unitaire en € |
  Montant en €`, `Code | Désignation | Unité | Qté | P.U. HT | MONTANT`,
  `Art. | Désignation | U | Quantité | Prix | Total Euros`, ou en-tête
  `U. | Q. | P. U. | TOT.` **répété** au-dessus de chaque groupe de lignes.
  Les colonnes changent de place (désignation en B ou en C) ; un libellé
  d'en-tête peut être posé dans une colonne voisine de ses valeurs.
- **Numéro d'article** : dans sa colonne (`5.1`, `6.2.1.1`, `2.1`, `3.0`),
  ou **en tête de la désignation** (`3.1 RAGREAGE SUR …`,
  `4.3.3.1 Dépose et …`). Les numéros sont ceux des articles du CCTP.
  Un numéro lu comme nombre par Excel perd son zéro final (`1.10` → `1.1`) :
  on lit le **texte affiché** de la case, pas sa valeur.
- **Lignes sans numéro**, rattachées à l'article au-dessus : détail chiffré
  (`reprise de plinthes | ml | 22`), localisation (`Boulangerie | M2 |
  73,53`), description (`Localisation : ensemble des …`), sous-titre
  (`Prises de courant`, `Type T4`).
- **Sans quantité chiffrée** : `PM`, `CP` (compris dans les prix),
  `Inclus en armoire`, ou rien (titre de chapitre).
- **À écarter** : préambule et abréviations avant le premier article ;
  sous-totaux (`Sous Total …`, `3.2 - COFFRETS … - TOTAL H.T. ……` posé dans
  la colonne du montant), totaux HT, TVA, TTC ; signature après le total
  (`Fait à`, `L'entreprise`, `Cachet et signature`) ; lignes vides de
  formules.
- **PDF** : texte présent ; colonnes alignées à des abscisses fixes ; la
  quantité d'une désignation sur plusieurs lignes est posée **entre deux
  de ses lignes** de texte. Montants vierges écrits `- €`. En-tête et pied
  de page répétés.

## 4. Lire un DPGF Excel (`dpgfLogique.js`, pur et testé)

La lecture du fichier (SheetJS, déjà dans les dépendances, chargé à la
demande) donne pour chaque feuille une grille de cases `{ texte, valeur }`
(`texte` = ce qu'Excel affiche). Tout le reste est pur :

1. **Feuille** : la première dont une ligne contient « désignation » et
   « quantité / qté / q. » (sans accents ni majuscules).
2. **Colonnes** : d'après cette ligne d'en-tête — numéro (`art`, `code`,
   `n°`, sinon la colonne à gauche de la désignation qui porte des
   numéros), désignation, unité (`u`, `u.`, `unité`), quantité. Chaque
   colonne est **recalée sur les valeurs** des lignes qui suivent : la
   colonne d'unité est celle où tombent les textes courts (`m2`, `ens`,
   `ml`…), celle de quantité celle des nombres. Désignation = textes des
   cases entre le numéro et l'unité, mis bout à bout. P.U. et montant ne
   sont pas lus.
3. **Repli** : colonnes introuvables → l'écran d'import demande « quelle
   colonne est la désignation / l'unité / la quantité » d'après un aperçu.
4. **Lignes** : on commence au premier numéro d'article ; un en-tête répété
   est sauté ; une ligne de sous-total ou de total est écartée ; le dernier
   total (HT / TTC) arrête la lecture.
5. **Une ligne** = `{ numero, article, niveau, designation, unite,
   quantite, quantiteTexte, titre, ordre }` :
   - `numero` : le sien (colonne ou tête de désignation, retiré de la
     désignation), sinon nul ;
   - `article` : son numéro, ou celui de la dernière ligne numérotée
     au-dessus (rattachement) ;
   - `quantite` : nombre ; `quantiteTexte` : `PM`, `CP`, texte de la case
     d'unité ou de quantité qui n'est pas un nombre ;
   - `titre` : numérotée sans quantité (chapitre, article à détails).

## 5. Lire un DPGF PDF (même fichier, pur et testé)

On repart des lignes de pdf.js déjà produites pour les CCTP
(`lignesDePage`, `retirerBruit`), **avec les abscisses des fragments**.

1. **Page à tableau** : une ligne d'en-tête (au moins trois de : unité,
   quantité, prix / P.U., total / montant) ou au moins trois lignes qui
   portent une unité suivie d'un nombre dans la moitié droite de la page.
2. **Colonnes** : abscisses de l'en-tête ; à défaut, celles des unités et
   quantités relevées sur la page. Montants (`- €`) ignorés.
3. **Lignes** : une ligne qui commence par un numéro ou un tiret ouvre une
   ligne de DPGF ; les lignes de texte suivantes sans unité ni quantité la
   continuent ; une unité + quantité **sans texte** va à la ligne de DPGF
   en cours (elle est posée au milieu de sa désignation). Mêmes exclusions
   qu'en Excel.
4. **PDF mixte** : pages à tableau → DPGF ; autres pages (couverture
   comprise) → CCTP par `decouperArticles`. Si les deux sortent, l'import
   propose deux pièces pour le même lot.

## 6. Données (migration 073)

- `pieces_ecrites.type` accepte `'dpgf'` (contrainte `check` élargie).
  `nb_articles` compte les lignes d'un DPGF.
- Nouvelle table `pieces_dpgf_lignes` : `id`, `piece_id` (cascade),
  `affaire_id`, `ordre`, `numero`, `article`, `niveau`, `designation`,
  `unite`, `quantite numeric`, `quantite_texte`, `titre boolean`, `page`.
  Règles : le même bloc que la 061 (agence ; restrictives
  `peut_modifier_affaire` en écriture).
- **Remplacement par lot et par type** : `enregistrerPiece` ne retire plus
  que la pièce du **même type** pour le lot. Aujourd'hui il retire tout ce
  qui est rattaché au lot : importer un DPGF effacerait le CCTP.
- **Sans la 073** : le module marche comme aujourd'hui ; les fichiers Excel
  et les pages DPGF sont refusés à l'import avec un message (« migration 073
  à passer ») ; la lecture tolère l'absence de la table.
- Copie sur l'appareil (`jga-pieces`) : les lignes de DPGF y entrent avec
  pièces et articles ; une copie ancienne sans elles reste lisible.

## 7. Lien CCTP ↔ DPGF (`dpgfLogique.js`, testé)

- Un DPGF se relie au CCTP **du même lot** (`lot_id`). Sans lot, pas de lien.
- Clé d'un numéro : espaces retirés, point final retiré, zéros de tête
  retirés par niveau, segments `.0` finaux retirés (`3.0` ≡ `3`,
  `01.2` ≡ `1.2`, `2.1.` ≡ `2.1`).
- Une ligne va sous l'article du CCTP dont la clé égale celle de son
  `article`. Une ligne sans article correspondant reste dans le DPGF et
  est comptée (« N lignes sans article dans le CCTP »).

## 8. Écrans

- **Tuiles** : une par lot (et une par pièce sans lot) : nom du lot, puis
  « CCTP · 32 articles · ind. B » et « DPGF · 85 lignes » ; boutons
  **CCTP** et **DPGF** (absent si la pièce manque), chacun avec sa
  corbeille (hors lecture seule).
- **Lecture d'un DPGF** (`LecteurDpgf.jsx`, plein écran, mêmes règles que
  `LecteurCctp` : portail, ✕ / Échap, bande de la barre d'état, couleur de
  la phase) : tableau Art. | Désignation | U | Qté ; titres en gras selon
  le niveau ; sommaire des titres ; repères de page pour un DPGF lu en
  PDF ; compte des lignes sans article. Une ligne reliée offre « Lire dans
  le CCTP » (ouvre `LecteurCctp` sur l'article).
- **Lecture d'un CCTP** : sous le texte de chaque article, petit tableau
  gris de ses lignes de DPGF (désignation, unité, quantité).
- **Recherche** : les lignes de DPGF trouvées sont groupées sous leur pièce,
  marquées « DPGF », avec unité et quantité ; toucher une ligne ouvre la
  lecture du DPGF sur elle.
- **Import** (« Importer des CCTP et DPGF ») : accepte `.pdf`, `.xls`,
  `.xlsx` ; par fichier : nature lue (CCTP, DPGF, CCTP + DPGF), lot
  proposé (`proposerLot`, comme les CCTP), aperçu des premières lignes du
  DPGF, choix des colonnes si la lecture a échoué. PDF et Excel du même
  DPGF dans un même import : le PDF est décoché, avec la raison.
- **Mode Visite** : bouton « Pièces écrites » ; même recherche, mêmes
  lectures.
- Le dossier pour Claude (conformité) n'emporte pas les DPGF.

## 9. Tests

Sur tableaux inventés (`tests/dpgf.test.js`) : colonnes à des places
différentes, libellé d'en-tête décalé, en-tête répété, numéro en tête de
désignation, numéro `1.10` gardé tel quel, lignes rattachées, `PM` / `CP`,
sous-totaux et totaux écartés, arrêt après le total, PDF dont la quantité
tombe entre deux lignes de texte, page à tableau reconnue dans un PDF
mixte, clés de numéros, lien au CCTP et lignes sans article,
remplacement par type. Avant livraison : les 9 exemples passés hors dépôt,
lignes relues contre les fichiers.

## 10. Hors portée

Prix et DPGF remplis par les entreprises, comparaison des offres,
marché de base du suivi financier, export du DPGF.
