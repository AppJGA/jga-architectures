# Module « État des lieux » — conception

Validée avec l'agence le 2026-11-17.

## 1. Le besoin

Faire l'état des lieux d'un bâtiment existant à partir de ses plans. Au
bureau, on charge les plans de l'existant et l'application en tire les
étages et les pièces. Sur place, avec la tablette, on lance une visite :
l'enregistrement audio démarre, on entre dans une pièce, on décrit à voix
haute finitions, dimensions et équipements, et on touche le plan pour situer
chaque élément. Claude rapproche la parole des points touchés et range tout
pièce par pièce. Au retour, on relit, puis on exporte un **DXF par calques**
et un **rapport PDF**.

Pas de géolocalisation : la pièce ouverte et les points touchés suffisent.
On peut même décrire une pièce sans y être.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Place | Module de la **phase Étude** du manifeste (`etat-des-lieux`), agence seule (jamais proposé à un extérieur). |
| Plans acceptés | **DXF** et **PDF vectorisé**. Un **DWG est refusé** avec un message clair (reconnu au contenu : en-tête `AC10xx`, pas seulement l'extension) : « Les fichiers DWG ne sont pas acceptés. Enregistrez le plan en DXF dans AutoCAD ou ArchiCAD (Fichier → Enregistrer sous → DXF), ou importez-le en PDF vectorisé. » La zone d'import annonce d'emblée les deux formats. Un PDF sans aucun trait vectoriel (scan) est refusé de même. |
| Un état des lieux | **Un par affaire**, complété en une ou plusieurs visites. |
| Pièces | Repérées à l'import (§ 4), contour corrigeable au bureau avant la visite. |
| Geste en visite | **Pièce d'abord** : toucher une pièce l'agrandit à tout l'écran (pincement possible pour plus de précision). Tout point posé appartient à la pièce ouverte, même sur une cloison. « Sortir de la pièce » ramène au plan de l'étage. Ce qui est dit hors pièce se rattache à l'étage. |
| Type d'élément | **Toucher puis parler**, barre d'icônes des calques visible pour préciser le type **si on veut** ; sinon Claude le déduit de la parole. |
| Fiche de pièce | Sol, murs, plafond, plinthes, hauteur sous plafond, état général / remarques. Pense-bête affiché dans la pièce. |
| Photos | Oui, rattachées à un point (compression et stockage des comptes rendus). |
| Enregistrement | **Lancé une fois**, jusqu'à « Terminer la visite » ; « Pause » possible. Découpé en interne à chaque entrée / sortie de pièce. |
| État de l'enregistrement | Bandeau rouge « ● Enregistrement · 12:34 » + jauge du niveau du micro. **Arrêté (pause, micro coupé, panne) → tout le plan grisé**, aucun point possible, grand bouton « Reprendre l'enregistrement ». |
| Analyse | **À chaque sortie de pièce** s'il y a du réseau ; sinon en attente et envoyée dès le retour du réseau (application ouverte). Revenir dans une pièce ajoute à ce qui a été dit ; la pièce est réanalysée en entier. |
| Couleur des pièces | Grise : pas visitée. Sablier : en attente d'analyse. Verte : fiche complète. Orange : rubrique manquante (« plafond non décrit »). |
| Relecture | Pièce par pièce : fiche et éléments proposés, Valider / Modifier / Écarter (comme les propositions de l'IA des CR ; modifier vaut validation). |
| Export | ZIP d'**un DXF par étage** (calques `EDL-…`) + **rapport PDF** pièce par pièce. |
| IA | API Claude, clé `ANTHROPIC_API_KEY` (organisation « JGA's Individual Org », crédits mensuels du forfait Max) ; transcription Mistral comme les CR. Jamais de clé en `VITE_`. |

## 3. Calques

Tous préfixés `EDL-` pour se suivre dans la liste et se distinguer des
calques d'origine.

| Calque | Contenu | Exemples de types |
|---|---|---|
| EDL-Pièces | nom, surface, hauteur sous plafond (texte dans la pièce) | — |
| EDL-Finitions | sol, murs, plafond, plinthes (texte dans la pièce) | — |
| EDL-Plomberie | symbole + libellé | lavabo, évier, baignoire, douche, WC, ballon d'eau chaude |
| EDL-Électricité | | interrupteur, prise, luminaire, tableau électrique |
| EDL-Chauffage | | radiateur, chaudière, thermostat |
| EDL-Ventilation | | bouche de VMC, grille, conduit |
| EDL-Menuiseries | | fenêtre, porte, placard |
| EDL-Occultations | | volet, store |
| EDL-Cotes | cotes dictées en texte à côté de l'élément (allège, ouverture) | — |
| EDL-Compteurs | | compteur d'eau, de gaz, d'électricité |
| EDL-Sécurité | | détecteur de fumée, éclairage de secours, extincteur |
| EDL-Désordres | | fissure, humidité, dégradation, matériau suspect (amiante, plomb) |
| EDL-Photos | repère numéroté de chaque photo | — |
| EDL-Fond de plan | traits et textes d'un PDF converti (seulement si le plan venait d'un PDF) | — |

La liste des calques et des types vit dans un seul fichier pur
(`calquesEdl.js`) : barre d'icônes, consignes de Claude, export DXF et
rapport la lisent. Un type de plus = une ligne.

## 4. Au bureau : préparer l'état des lieux (lot 1)

**Lecture du plan, sur l'appareil, sans IA** (`lecturePlanEdl.js`, pur) :

- **DXF** : lignes, polylignes, arcs, cercles, textes (MTEXT nettoyé comme
  l'analyseur réglementaire), blocs insérés ; unités d'après `$INSUNITS`.
  Un fichier peut contenir plusieurs étages côte à côte : on les sépare par
  regroupement des dessins éloignés, chaque groupe proposé comme un étage.
- **PDF vectorisé** : traits par la liste d'opérations de pdf.js (méthode
  déjà employée par le dossier pour Claude et l'aplatisseur), textes avec
  leur position. Une page = un étage proposé.
- Rendu de chaque étage en image (comme `conversionPlan.js`, 6 000 px au
  plus) pour l'affichage et la visite hors ligne.

**Échelle** : connue pour un DXF. Pour un PDF : l'échelle lue dans le
cartouche (« 1/100 ») est proposée ; sinon on la saisit, ou on trace une
longueur connue. **Contrôle** : la surface calculée de chaque pièce est
comparée à la surface écrite sur le plan ; un écart général signale une
échelle fausse.

**Pièces** :

1. Claude reçoit **la liste des textes avec leur position** (pas l'image :
   moins cher et plus sûr) et dit lesquels sont des noms de pièces, quelle
   surface va avec quel nom, et le nom de chaque étage.
2. Le **contour** se calcule par la géométrie (`contoursPieces.js`, pur) :
   les murs sont tracés sur une grille, épaissis pour fermer les baies de
   porte (≈ 90 cm), puis remplis depuis l'étiquette de la pièce ; le contour
   obtenu est simplifié en polygone. Deux étiquettes dans la même zone
   (grande ouverture) → zone partagée entre elles et signalée à vérifier.
3. À l'écran, chaque pièce en couleur sur le plan ; on déplace les coins,
   on renomme, on ajoute une pièce (toucher une zone sans nom calcule son
   contour), on en supprime.

« Préparer pour la visite » recopie sur la tablette images, pièces et
réglages (même principe que « Préparer pour le chantier »).

## 5. Sur place : la visite (lot 2)

- **Démarrer** : demande du micro, enregistrement continu, plan du premier
  étage. Sélecteur d'étage en haut.
- **Enregistrement** : le moteur des CR (`enregistreur.js`) — morceaux de
  3 minutes, rangés sur l'appareil seconde par seconde — reçoit une fonction
  `couper()` qui clôt le morceau en cours ; elle est appelée à chaque entrée
  et sortie de pièce. Les modules `audioLocal`, `transcription` et
  `useEnregistrementVisite` sont rendus indépendants du CR (une « visite »
  générique : CR ou état des lieux).
- **Journal de la visite** : chaque geste est noté avec son heure sur
  l'appareil — entrée / sortie de pièce, point posé (x, y, type choisi ou
  non), photo, pause / reprise. Les morceaux audio portent leur heure de
  début.
- **Points** : numérotés dans l'ordre de l'état des lieux ; un point se
  déplace ou se supprime ; une photo s'y rattache (bouton appareil photo).
- **Pense-bête** dans la pièce : Sol · Murs · Plafond · Plinthes · HSP,
  cochés d'après l'analyse quand elle est revenue.
- **Grisé** : décidé par les seuls événements du moteur d'enregistrement
  (pause, micro coupé, piste terminée, échec) : voile gris sur tout le plan
  et gestes bloqués, sauf « Reprendre l'enregistrement ».
- **Hors ligne** : tout geste passe par une file d'opérations comme le mode
  Visite des CR (identifiants décidés sur l'appareil, ordre de création =
  ordre d'envoi, doublon `23505` = succès), base IndexedDB à part
  `jga-edl`. Le moteur de synchro de l'app (`useMoteurSynchro`) envoie aussi
  cette file et les morceaux audio en attente.
- Écran plein, boutons de 44 px au moins, bande de `safe-area-inset-top`.

## 6. L'analyse (lot 3)

**Transcription** : chaque morceau part à `api/transcrire.js` ; on demande
les horodatages par segment (paramètre de Mistral à vérifier au début du
lot 2). Repli s'ils manquent : couper aussi un morceau à chaque point posé.

**Analyse d'une pièce** (`api/analyser-edl.js`, fonction serveur, compte
agence vérifié par `_agence.js`) : à la sortie de la pièce, ou au retour du
réseau, la pièce part avec :

- son nom, sa surface, les types de la liste des calques ;
- une **frise** : phrases transcrites et gestes intercalés par leur heure
  (« [10:32:14] point P7 posé, type Chauffage », « [10:32:15] « radiateur
  fonte sous la fenêtre, 80 de large » ») ;
- ce que la pièce avait déjà (une réanalyse repart de tout ce qui a été dit).

Claude rend, en sortie structurée (schéma JSON fixé côté serveur) : la
fiche de la pièce (sol, murs, plafond, plinthes, HSP, remarques), et les
éléments — type, calque, libellé, cotes, point rattaché (ou aucun),
extrait entendu, et `a_verifier` s'il hésite. La complétude de la fiche
(verte / orange) se calcule dans l'app, pas par Claude.

Modèle `claude-opus-5-5` avec les replis côté serveur (`fallbacks`)
activés ; coût estimé de quelques centimes par pièce, très en deçà des
100 $ mensuels.

**Relecture** au bureau : liste des pièces avec leur couleur ; une pièce
ouverte montre le plan agrandi avec ses points, la fiche modifiable et les
éléments proposés (surbrillance bleue des propositions, extrait entendu,
Valider / Modifier / Écarter). Un élément peut être rattaché à un autre
point ou déplacé sur le plan.

## 7. L'export (lot 4)

**DXF, un par étage, dans un ZIP** (`exportDxfEdl.js`, pur) :

- Plan d'origine **DXF** : le fichier d'origine, gardé (§ 8), auquel on
  ajoute les calques `EDL-`, des blocs de symboles et les entités, en
  respectant ses identifiants (`$HANDSEED`). Si un fichier d'origine
  résiste à l'ajout, repli : un DXF des seuls calques `EDL-` aux mêmes
  coordonnées, à insérer au point 0,0 du plan d'origine (signalé à l'écran).
- Plan d'origine **PDF** : traits et textes du PDF convertis à l'échelle sur
  `EDL-Fond de plan`, puis les mêmes calques.
- Chaque élément : un petit symbole (bloc par type, dessiné par le code) à
  son emplacement, avec « numéro · libellé ». Dans chaque pièce, nom,
  surface, HSP (EDL-Pièces) et finitions (EDL-Finitions). Les cotes dictées
  sont des textes, pas des lignes de cote.
- Contrôle de chaque fichier produit en le relisant avec notre propre
  lecteur (tests), puis essai à l'ouverture dans AutoCAD et ArchiCAD avec
  l'agence.

**Rapport PDF** (pdfmake, comme les CR) : page de garde (affaire, date,
rédacteur), par étage le plan avec les points numérotés, puis une fiche par
pièce : finitions, HSP, éléments numérotés par calque, photos.

## 8. Données (migration 077)

Toutes les tables reçoivent les droits d'API (`grant … to authenticated`,
`to service_role`), les règles « agence seule » et les règles restrictives
`peut_modifier_affaire` d'écriture (comme la 061).

| Table | Rôle |
|---|---|
| `edl_etats` | un par affaire (`unique(affaire_id)`), date, rédacteur |
| `edl_niveaux` | étage : nom, ordre, format d'origine, échelle / transformation plan → mètres, chemins de l'image et de la source |
| `edl_pieces` | étage, nom, contour (jsonb, en mètres), surface lue, fiche (jsonb), état d'analyse, `analyse_le` |
| `edl_points` | pièce (ou étage seul), x / y, numéro, type choisi, heure sur l'appareil |
| `edl_evenements` | journal de la visite (entrée, sortie, point, photo, pause, reprise) |
| `edl_enregistrements` | segments transcrits (texte seul, horodatés), par morceau |
| `edl_elements` | propositions puis éléments validés : pièce, point, calque, type, libellé, cotes, extrait, `a_valider`, `a_verifier` |
| `edl_photos` | point, chemin, miniature |

**Stockage** (offre gratuite plafonnée à 1 Go) : bucket privé `edl`, chemins
`<affaire_id>/…` comme partout. On garde l'image de chaque étage, les photos
compressées, et la **source** : le DXF d'origine **compressé** (gzip sur
l'appareil, nécessaire à l'export) ou, pour un PDF, ses traits et textes
extraits en JSON compressé (le PDF lui-même n'est pas gardé).
`fichiers_orphelins()` est étendue au bucket `edl`. Le son n'est jamais
gardé en ligne : effacé de l'appareil après transcription, comme les CR.

## 9. Ce qui se teste sans navigateur

Fichiers `*Logique.js` purs, `tests/etat-des-lieux.test.js`, sur plans
**inventés** (aucun plan réel dans le dépôt, public ; un DXF ArchiCAD et un
PDF de géomètre réels, fournis par l'agence, restent hors dépôt pour les
essais) :

- reconnaissance d'un DWG, d'un PDF sans vecteur ;
- lecture DXF (entités, unités, étages côte à côte) ;
- contours de pièces (portes fermées, grande ouverture partagée, pièce en
  L) et contrôle d'échelle par les surfaces ;
- frise de l'analyse (gestes et phrases intercalés, réanalyse) ;
- complétude de la fiche, couleur des pièces ;
- export DXF relu par le lecteur (calques, blocs, identifiants), et
  définition du rapport.

## 10. Découpage

1. **Préparer** : import DXF / PDF (DWG refusé), étages, pièces (Claude pour
   les noms, géométrie pour les contours), correction, échelle, consultation
   hors ligne.
2. **Visiter** : mode visite, enregistrement continu et découpé, journal,
   points, barre d'icônes, photos, voile gris, file hors ligne.
3. **Analyser** : transcription horodatée, analyse à la sortie de pièce,
   couleurs, relecture.
4. **Exporter** : DXF par calques, rapport PDF.

Chaque lot est livré, poussé et documenté dans `CLAUDE.md` avant le suivant.

## 11. Hors champ

- Lecture directe du DWG (format fermé ; bibliothèque lourde à licence
  contraignante pour un dépôt public).
- Plans scannés (sans vecteur).
- Redessiner les murs d'après les cotes dictées.
- Géolocalisation.
