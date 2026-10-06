# Pièces écrites — conception

Validée avec l'agence le 2026-10-06.

## 1. Le besoin

Les CCTP d'une affaire (PDF rédigés par des bureaux d'études différents, aux
mises en page différentes) sont importés dans l'app, découpés en articles et
cherchables par mot-clé — au bureau, et sur la tablette pendant les réunions de
chantier, même sans réseau. L'import propose de créer ou rattacher le lot
correspondant dans « Entreprises & Lots ».

Module « Pièces écrites », partie Étude du manifeste.

## 2. Décisions

| Sujet | Décision |
|---|---|
| IA | **Aucune** : les 7 CCTP d'exemple (5 affaires, plusieurs BET) sont des PDF texte, découpables par règles. L'IA reste une piste pour un document atypique, plus tard. |
| PDF d'origine | **Non gardé** : seul le texte découpé (≈ 100 Ko par CCTP), chaque article garde sa page. Rien sur le stockage de 1 Go. |
| Lot | **Proposé puis confirmé** : rattacher à un lot existant (rapproché par le nom, `cleNom`) ou créer le lot lu sur la couverture ; numéro et nom modifiables. |
| Sur chantier | **Loupe dans le mode Visite** : panneau de recherche par-dessus la visite ; CCTP emportés sur l'appareil à l'ouverture de la visite (hors ligne). |
| Versions | **Remplacer sans garder** : un nouveau CCTP d'un lot remplace l'ancien (après confirmation) ; date et indice notés. |
| Portée | **CCTP seulement** ; une colonne `type` laisse la place à d'autres pièces plus tard. |
| Droits | Agence seule ; écriture réservée aux collaborateurs de l'affaire (règle de la migration 060). Lecture pour toute l'agence. |

## 3. Lire un CCTP (navigateur, pur et testé)

Constats sur les exemples :

- Texte présent sur toutes les pages (aucun scan).
- Numérotation décimale des articles partout : `4`, `4.1`, `4.1.2`, `1.15.2`,
  `2.0` ; titres souvent en capitales.
- Un sommaire en tête : lignes terminées par des points de conduite ou des
  soulignés et un numéro de page (`4.2 PROFILE ALUMINIUM … 9`, `2.4 VENTILATION ____ 9`).
- En-têtes et pieds de page répétés sur presque chaque page, en petits
  caractères (« LOT 07 : METALLERIE … /22 », « Etabli par : … »).
- Le lot sur la couverture, en gros caractères, sous des formes variées :
  `LOT 07 - METALLERIE - SERRURERIE`, `Lot n°170 : PLOMBERIE CHAUFFAGE VENTILATION`,
  `Lot N°080 MENUISERIES EXTERIEURES PVC`, `LOT 2 - DEMOLITION - GROS ŒUVRE -`.

Étapes (`piecesLogique.js`) :

1. **Lignes** : pdf.js rend des fragments positionnés ; on les regroupe en
   lignes (même ordonnée), avec la taille de caractère et la page.
2. **Bruit** : une ligne (chiffres retirés, espaces normalisés) présente sur
   plus de 40 % des pages est un en-tête ou un pied de page → retirée. Les
   lignes de sommaire (points de conduite / soulignés + numéro final) aussi.
3. **Articles** : une ligne `^\d+(\.\d+)*\.?\s+<titre>` dont le titre n'est
   pas une phrase de corps (longueur raisonnable, ne finit pas par une page)
   ouvre un article ; le texte court jusqu'au suivant. Le numéro doit
   « avancer » (pas de retour à `1` au milieu d'une liste de quantités).
   Article = { numero, titre, niveau, texte, page, ordre }.
4. **Repli** : moins de 3 articles reconnus → un article par page
   (« Page 12 »), toujours cherchable.
5. **Lot** : sur la page 1, la ligne la plus grande qui correspond à
   `lot\s*(n°)?\s*(\d+)\s*[-:–]?\s*(.+)` (le nom peut continuer à la ligne
   suivante) ; à défaut, le nom du fichier ; à défaut, rien (choix manuel).
   L'indice (`IND2`, `Indice : 2`) est relevé s'il apparaît.

Les tests utilisent des textes inventés : **aucun extrait réel de CCTP dans
le dépôt** (public).

## 4. Données (migration 061)

```
pieces_ecrites   id, affaire_id, type ('cctp'), lot_id (null possible),
                 titre, lot_numero_lu, lot_nom_lu, indice, nom_fichier,
                 nb_pages, nb_articles, importe_le, importe_par
pieces_articles  id, piece_id (cascade), affaire_id, ordre, numero, niveau,
                 titre, texte, page
```

Un seul CCTP par lot : à l'import d'un lot déjà couvert, l'ancienne pièce est
supprimée (ses articles suivent en cascade). RLS : agence seule ; règles
restrictives d'écriture des collaborateurs (`peut_modifier_affaire`, 060).

## 5. Écrans

- **Module** (`etude/pieces-ecrites/`) : liste des CCTP par lot (titre,
  indice, date, nombre d'articles, Remplacer / Supprimer), bouton
  « Importer des CCTP », et la recherche.
- **Import** : un ou plusieurs PDF ; pour chacun, le lot lu, l'aperçu des
  premiers articles, le choix « Rattacher au lot … » / « Créer le lot … »
  (numéro et nom modifiables), l'alerte de remplacement ; « Importer ».
- **Recherche** (`chercherArticles`, pur) : chaque mot doit figurer dans
  l'article (titre ou texte), sans majuscules ni accents ; titre avant
  texte ; groupés par lot ; extrait autour du premier mot trouvé, mots
  surlignés ; filtre par lot ; article entier au toucher.
- **Mode Visite** : loupe dans la barre → panneau `Panneau` avec la même
  recherche. À l'ouverture de la visite (réseau), les articles de l'affaire
  sont copiés dans IndexedDB ; hors ligne, la recherche lit cette copie.

## 6. Lots

Choix proposé : un lot existant dont le nom correspond (`cleNom`), sinon la
création du lot lu (numéro lu, ou le premier libre si déjà pris). Création par
`useLotsEntreprises.createLot` ; aucune entreprise n'est créée.

## 7. Découpage

1. Lecture et découpage (logique pure + tests), migration 061, module :
   import avec choix du lot, liste, recherche.
2. Mode Visite : loupe, panneau de recherche, copie hors ligne.
