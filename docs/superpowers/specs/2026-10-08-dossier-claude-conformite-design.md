# Dossier pour Claude — conformité plans / CCTP

Conception validée avec Victor le 2026-10-08, après deux essais réels faits dans la
conversation. Une affaire de 11 logements en phase DCE a été analysée lot par lot ;
pièces et résultats sont gardés hors du dépôt. Le format a ensuite été rejoué dans
un projet claude.ai, avec un lot et le CCTP commun, puis le rapport complet.

## But

Repérer avant la consultation les écarts entre les plans et les CCTP d'une affaire :
- ouvrages dessinés mais non décrits, ou l'inverse ;
- quantités, dimensions et localisations qui ne concordent pas ;
- doublons et oublis entre lots ;
- copier-coller d'autres opérations ;
- pièces manquantes.

Le rendu attendu est un Excel à quatre onglets : Tableau de bord, Écarts à lever,
Analyse complète, Légende.

## Principe : l'app prépare, Claude analyse

**Aucun appel d'API.** L'analyse se fait dans un **projet claude.ai** de l'abonnement
Team de l'agence. Le projet est partagé et porte les consignes.

L'app ne fait que **fabriquer le dossier** à remettre à Claude. C'est l'essentiel de
la qualité constatée aux essais :
- le texte des plans avec la **position** et la **couleur** de chaque annotation ;
- les CCTP **découpés par article** avec leur page.

Claude rend lui-même l'Excel ; il l'a fait sans difficulté aux essais.

Pas de retour des résultats dans l'app pour l'instant (pas d'historique ni de suivi
de levée). On l'ajoutera si l'usage le demande.

## Parcours

Module **Pièces écrites** d'une affaire → bouton **« Préparer le dossier pour
Claude »** → fenêtre (règles des fenêtres de l'app : pas de fermeture au clic à
côté) :

1. **Rappel des CCTP** enregistrés pour l'affaire : lot, indice, nombre d'articles.
   Les lots de l'affaire **sans CCTP** sont signalés.
2. **Dépôt des PDF des plans**, par glisser ou par choix de fichiers. Ils sont lus
   sur l'appareil et **rien n'est enregistré** : ni Supabase (stockage plafonné à
   1 Go) ni copie locale.
3. **« Fabriquer le dossier »**. Une progression s'affiche, plan par plan, puis
   `Dossier Claude - <code affaire>.zip` est téléchargé.
4. Un **texte explicatif** remplace alors le formulaire :
   « Le dossier est prêt. Ouvrez le projet Claude, démarrez une nouvelle conversation, glissez-y les quatre fichiers du dossier (décompressé) et écrivez par exemple « Analyse le CCTP commun » ou « Analyse le lot 080 », puis « Rapport complet ». »

   Il est suivi d'un bouton **« Ouvrir le projet Claude »**, qui ouvre un nouvel
   onglet sur l'adresse du projet. Les fichiers ne peuvent pas être déposés
   automatiquement : un site n'a pas le droit d'en glisser dans un autre.
5. Un lien discret, **« Consignes du projet »**, affiche les consignes, leur numéro
   de version et un bouton « Copier ». Il ne sert qu'à créer le projet ou à le
   mettre à jour quand les consignes changent.

Le module garde son règlement : agence seule. La lecture seule (migration 060) ne
gêne pas, puisque rien n'est écrit.

## Le dossier (ZIP)

| Fichier | Contenu | Source |
|---|---|---|
| `1 - Sommaire.md` | Affaire (code, nom, adresse, maître d'ouvrage, phase), version des consignes, tableau des CCTP (lot, fichier, indice, pages, articles), tableau des plans (n°, titre, format, page dans le PDF réuni), lots sans CCTP, pièces jamais fournies par l'app (DPGF, CCAP, AE, diagnostics) | `affaires`, `lots`, `pieces_ecrites`, plans déposés |
| `2 - CCTP.md` | Tous les CCTP, CCTP commun en tête puis par numéro de lot, chacun précédé d'un en-tête (lot, fichier, indice, pages, articles) ; chaque article en `§numéro TITRE [p.page]` puis son texte, phrases recollées (`recomposerTexte`) | `pieces_articles` (`numero`, `titre`, `texte`, `page`) |
| `3 - Plans (texte).md` | Mode d'emploi en tête (repère des coordonnées, couleurs, « / »), puis pour chaque plan et chaque page : `=== titre ===`, `--- page n : L×H mm ---`, une ligne par annotation `(x,y) [couleur] texte` | PDF déposés, lus par pdf.js |
| `4 - Plans.pdf` | Les PDF déposés réunis dans l'ordre du sommaire | pdf-lib, déjà au projet |

Le CCTP commun se reconnaît à son lot absent, ou à un titre ou nom de fichier
contenant « CCTPC » ou « commun ». Les plans sont rangés par le numéro en tête du
nom de fichier, sinon par nom. Le titre d'un plan est son nom de fichier sans
l'extension.

Taille constatée sur l'essai : 26 plans pour 6 Mo de PDF, 60 000 caractères de
texte de plans et 215 000 de CCTP. Cela passe dans une conversation claude.ai.
Au-delà de **30 Mo** de PDF réunis (limite d'un fichier sur claude.ai), l'app le
signale et propose l'Aplatisseur de plan (allègement vectoriel) ; le dossier se
fabrique quand même.

## Lecture des plans

Elle reprend la méthode de l'extraction de référence des essais (PyMuPDF). Le
nouveau fichier `lecturePlans.js` lit les PDF dans le navigateur ; tous les calculs
sont dans le module pur `dossierClaudeLogique.js`, testé.

1. **Fragments** : texte et position par `getTextContent`, converties en mm depuis
   le **coin haut gauche** (1 point = 25,4/72 mm, axe y retourné).
2. **Couleur** : pdf.js ne donne pas la couleur des fragments. On suit la liste
   d'opérations (`getOperatorList`) : la couleur de remplissage courante est
   attachée à chaque opération d'écriture de texte, puis rapprochée des fragments.
   Le rapprochement se fait par l'ordre, sinon par la position recalculée avec la
   matrice de texte suivie, comme le fait déjà `traitsHorizontaux` pour les traits.
   **C'est le point à risque** : il est traité en premier (voir « Ordre de
   réalisation »).
3. **Nom de couleur** (`nomCouleur(r, g, b)`) : mêmes seuils que la référence —
   rouge, bleu, vert, orange, magenta, rien pour le noir et les gris.
4. **Lignes** : fragments regroupés en lignes, une couleur par ligne (celle du plus
   grand nombre de caractères).
5. **Fusion** des lignes d'un même bloc : même couleur, ligne suivante 6 mm plus
   bas au plus, écart horizontal de 12 mm au plus, recherche parmi les 20
   dernières. Textes joints par « / ».
6. Tri de haut en bas, puis de gauche à droite.

Un PDF sans texte (plan scanné) est signalé ; il part quand même dans le PDF réuni.

## Les consignes

- Rangées dans le code, `consignesConformite.js`, avec `VERSION_CONSIGNES` (1 au
  départ). Le texte est celui validé par l'essai : méthode, statuts, gravité,
  certitude, contrôles entre lots, diagnostics amiante et plomb, mesure des cotes
  à l'échelle, une ligne par écart, format Excel.
- Les consignes demandent à Claude de **comparer la version du sommaire à la
  sienne** et de prévenir si elles diffèrent. C'est le cas d'un projet resté sur
  d'anciennes consignes.
- Elles ne contiennent aucun extrait de pièce réelle : le dépôt est public.

## Adresse du projet

C'est la constante `PROJET_CLAUDE_CONFORMITE` (adresse du projet de l'agence,
`https://claude.ai/project/…`). Elle n'est pas secrète : sans le compte de
l'agence, elle n'ouvre rien. Pour en changer, on modifie la constante ; aucun
réglage n'est prévu à l'écran.

## Ordre de réalisation

1. **Essai de la couleur dans le navigateur.** Lire avec pdf.js les plans de
   l'essai, gardés hors dépôt, et comparer à l'extraction de référence : nombre
   d'annotations et couleur de chacune. Seuil : au moins 95 % de couleurs
   identiques. En dessous, on en parle avec Victor avant d'aller plus loin. Le
   dossier peut partir sans couleurs, moins bon.
2. Logique pure (`dossierClaudeLogique.js`) et ses tests, sur textes inventés :
   couleurs, lignes, fusion, sommaire, CCTP, plans.
3. Fenêtre, ZIP (`fflate`, déjà au projet), PDF réuni, consignes, bouton du projet.
4. Fabrication du dossier de l'essai par l'app et comparaison à celui fait à la
   main, puis CLAUDE.md, commit et envoi.

## Hors champ

- Retour des résultats dans l'app : historique, suivi de levée.
- DXF : l'agence ne travaille qu'en PDF.
- Dépôt automatique des fichiers dans claude.ai : impossible depuis un navigateur.
