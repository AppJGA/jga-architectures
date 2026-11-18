# État des lieux — plans allégés et affichés en vectoriel : plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal :** à l'import d'un DXF, Claude décide du traitement de chaque calque (garder, pocher les murs, masquer un motif, masquer le calque) ; l'application allège le plan en conséquence (540 000 → ~7 000 traits sur un R+1 ArchiCAD) et l'affiche en vectoriel, net à tous les zooms, à l'écran comme sur la tablette sans réseau.

**Architecture :** logique pure testée (`simplificationPlan.js` : statistiques des calques, décisions par défaut, simplification, format du fichier vectoriel) ; une fonction serveur `api/edl-calques.js` (Claude, sortie JSON imposée) qui ne fait que choisir un traitement par calque ; l'import applique les décisions, enregistre un fichier vectoriel compressé par étage (stockage `edl`), et la visionneuse partagée gagne un fond dessiné sur un canevas (`dessinFond`), redessiné à chaque vue.

**Tech Stack :** React 19 + Vite, Supabase (stockage privé `edl`, migration manuelle), fonctions Vercel Node, `@anthropic-ai/sdk`, `fflate`, `node --test`.

**Spec :** décisions de l'agence du 2026-11-18 (conversation) — rendu validé sur les trois DXF d'exemple (murs = masse au pochage blanc et contour épais ; tuiles et gravier = motif masqué ; reste gardé). Conception générale : `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md`.

## Global Constraints

- Tout en français (textes d'écran, commentaires qui disent pourquoi, noms métier). Styles inline, charte de l'app (`--affaire-accent`, bordures 0,5 px, angles 2–3 px, rouge `#B8412C`, ambre `#FFFBEB` / `#92400E`). Fenêtres : jamais fermées au clic à côté.
- **Dépôt public** : aucun nom réel, nom de fichier réel ni donnée de plan réel dans le dépôt ; tests sur données inventées. Les DXF d'exemple restent dans `~/Desktop/PERSO/Exemples dxf/`.
- **Clé Anthropic côté serveur seulement** (`ANTHROPIC_API_KEY`, jamais `VITE_`). Modèle `claude-opus-5-5`, beta `server-side-fallback-2026-07-01` + `fallbacks: 'default'`, `output_config.format` JSON schema, accès par `verifierAgence` / `jetonDe` (`api/_agence.js`), comme `api/edl-pieces.js`. Corps de requête < 4,5 Mo (limite Vercel). **Aucune entrée dans `vercel.json`** pour la nouvelle fonction.
- **Un échec de Claude n'arrête jamais l'import** : les décisions par défaut (`decisionsParDefaut`) s'appliquent et l'écran le dit.
- Migrations passées **à la main** : le code tolère l'absence de la migration 081 (import sans fichier vectoriel, affichage de l'image comme avant). Toute nouvelle colonne de chemin de fichier entre dans `fichiers_orphelins()` (fonction recopiée entière depuis la 079 + la nouvelle clause).
- La géométrie reste exacte : en mètres, repère du plan d'origine (y vers le haut), comme pièces et points. Rien de ce qui est stocké en mètres ne change.
- La visionneuse partagée (`VisionneusePlan.jsx`) ne change pas de comportement pour les comptes rendus : la nouvelle prop est facultative.
- `npm test` vert, `npm run build` réussi, ESLint sans problème ajouté (~72 préexistants, comparer). Commits `feat:` / `fix:` / `test:` / `docs:` terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne jamais pousser (le contrôleur pousse après la revue finale).

## Vocabulaire des traitements (commun à toutes les tâches)

| code | à l'écran | effet |
|---|---|---|
| `garder` | Garder | tous les traits du calque |
| `masse` | Pocher (murs) | traits courts (< 10 cm) → masses pleines (pochage blanc, contour épais) ; traits longs gardés |
| `masquer-motif` | Masquer le motif | traits courts retirés ; traits longs gardés |
| `masquer` | Masquer | tout le calque retiré (traits et textes) |

« Trait court » : longueur totale < `LONGUEUR_MOTIF` = 0,10 m.

---

### Task 1 : Logique pure de simplification (`simplificationPlan.js`)

**Files :**
- Create : `src/modules/etude/etat-des-lieux/simplificationPlan.js`
- Test : `tests/etat-des-lieux-vectoriel.test.js` (nouveau ; l'ajouter au script `npm test` s'il liste les fichiers — vérifier `package.json`)

**Interfaces — Produces :**
- `TRAITEMENTS` = `['garder', 'masse', 'masquer-motif', 'masquer']`, `LIBELLES_TRAITEMENT` (libellés du tableau ci-dessus), `LONGUEUR_MOTIF = 0.1`.
- `longueurTrait(trait)` → mètres.
- `analyserCalques(traits, textes)` → `[{ nom, traits, courts, partCourts, fermes, textes, boite: [x0,y0,x1,y1] }]`, trié par nombre de traits décroissant. Traits en mètres (`{ calque, ferme, pts }`, sortie de `proposerNiveaux`).
- `decisionsParDefaut(analyse)` → `{ [nom]: traitement }` : `partCourts ≥ 0.9` et `traits ≥ 500` → `masse` si le nom contient MUR / CLOISON (sans accents ni casse), sinon `masquer-motif` ; tout le reste `garder`.
- `simplifierNiveau({ traits, textes }, decisions, { pas = 0.01 })` → `{ traits, masses, textes, retires }` :
  - `traits` : les traits gardés selon le traitement de leur calque (calque inconnu des décisions = `garder`) ;
  - `masses` : `[{ calque, anneaux: [[[x,y],…], …] }]` — pour chaque calque `masse`, ses traits courts tracés sur une **grille creuse** de `pas` (morceaux de 256 × 256 cellules dans une `Map`, jamais une grille pleine sur toute l'emprise : 200 m × 200 m au centimètre ne tiennent pas en mémoire), **fermeture** (dilatation puis érosion de 2 cellules) pour souder le remplissage, puis **tous les anneaux** de bord (extérieurs et trous) par suivi des arêtes entre cellule pleine et vide, simplifiés (Douglas-Peucker, tolérance `pas`, alignements fusionnés). Masses de moins de 0,0004 m² (4 cm²) ignorées ;
  - `textes` : ceux des calques non `masquer` ;
  - `retires` : nombre de traits retirés (courts des `masse` et `masquer-motif`, tous ceux des `masquer`).
- `encoderVecteurs({ traits, masses, textes, boite })` → `Uint8Array` gzip (fflate `gzipSync`, niveau 6) d'un JSON compact : `{ v: 1, calques: [noms], traits: [[iCalque, ferme0/1, x1,y1,x2,y2,…]], masses: [[iCalque, [anneau…]]], textes: [[iCalque, texte, x, y, hauteur]], boite }` ; coordonnées arrondies au millimètre (3 décimales).
- `decoderVecteurs(octets)` → `{ calques, traits: [{ calque, ferme, pts, boite }], masses: [{ calque, anneaux, boite }], textes: [{ calque, texte, pos, hauteur }], boite }` (boîte de chaque trait / masse précalculée pour le tri à l'affichage).

**Tests (données inventées) :**
1. `analyserCalques` : compte, part de courts, boîte.
2. `decisionsParDefaut` : « MURS EXTÉRIEURS » plein de courts → `masse` ; « TOITURE » plein de courts → `masquer-motif` ; calque de portes à 60 % de courts → `garder` ; calque de 100 courts → `garder` (moins de 500).
3. `simplifierNiveau` : un mur de 4 m × 0,2 m rempli de 400 hachures de 15 cm espacées de 1 cm (traits courts < 10 cm : prendre des hachures en travers, longueur 0,2 m ⇒ attention, < 0,1 m requis — utiliser un mur de 0,08 m d'épaisseur) + ses deux traits de contour longs → **une** masse dont l'anneau extérieur a une aire ≈ 4 × 0,08 (± 15 %) et une boîte à ± 3 cm du mur ; les deux contours longs gardés ; `retires` = nombre de hachures.
4. Un mur en U (trou) → la masse a deux anneaux si le U est fermé en anneau (carré creux) : 1 extérieur + 1 trou.
5. `masquer-motif` retire les courts et garde les longs ; `masquer` retire tout, textes compris ; calque absent des décisions gardé.
6. Grille creuse : deux murs à 150 m l'un de l'autre → deux masses, sans allouer l'emprise entière (le test vérifie le résultat ; la mémoire est garantie par la conception).
7. `encoderVecteurs` → `decoderVecteurs` : aller-retour (coordonnées au mm, calques, `ferme`, textes, boîtes).

Commit : `feat: état des lieux — simplification des plans par calque (masses, motifs) et format vectoriel`.

---

### Task 2 : Claude choisit le traitement des calques

**Files :**
- Create : `src/modules/etude/etat-des-lieux/calquesIaLogique.js` (pur : `MODELE_CALQUES = 'claude-opus-5-5'`, `SCHEMA_CALQUES`, `CONSIGNES_CALQUES`, `construireDemandeCalques({ calques, apercu })`, `lireDecisionsCalques(resultat, noms)`)
- Create : `api/edl-calques.js` (sur le modèle exact de `api/edl-pieces.js` ; `effort: 'medium'` suffit ; `max_tokens` 16000)
- Create : `src/modules/etude/etat-des-lieux/calquesIa.js` (navigateur : `proposerTraitementsIa(analyse, traitsParCalque)` dessine un **extrait par calque** — canevas 384 px, JPEG 0,8, le calque seul en noir sur blanc, cadré sur la zone la plus dense du calque (cellule de 10 m qui porte le plus de ses traits, élargie à 12 m) — et un aperçu d'ensemble 1 024 px de tous les calques en gris ; appelle `appelerClaude('/api/edl-calques', demande)` de `piecesIa.js` ; corps total < 3,5 Mo, sinon extraits réduits à 256 px)
- Test : `tests/etat-des-lieux-vectoriel.test.js`

**Contrat de la demande (navigateur → serveur) :** `{ calques: [{ nom, traits, partCourts, fermes, textes: [quelques textes du calque, 10 au plus], extrait: base64 JPEG }], apercu: base64 JPEG }`. Le serveur rejette (400) toute demande sans calques ou avec plus de 60 calques.

**Sortie imposée (`SCHEMA_CALQUES`) :** `{ calques: [{ nom: string, traitement: enum TRAITEMENTS, raison: string }] }`, `additionalProperties: false`.

**Consignes (`CONSIGNES_CALQUES`, en français) :** l'état des lieux d'un bâtiment existant se fait sur un plan **lisible et léger** ; les murs et cloisons dont le remplissage est fait de milliers de petits traits deviennent des masses (`masse`) ; les motifs décoratifs (tuiles, gravier, dallage, végétation, hachures de sol ou de terrain) sont masqués (`masquer-motif`) en gardant leurs contours ; un calque sans intérêt pour la visite (terrain lointain, arbres, cotations d'urbanisme, cartouche) peut être masqué (`masquer`) ; **dans le doute, garder** ; ne jamais masquer portes, fenêtres, escaliers, sanitaires, équipements, zones ou pièces. Une `raison` courte en français par calque.

**`lireDecisionsCalques`** : ne garde que les noms connus et les traitements valides ; un calque oublié par Claude prend la décision par défaut (l'appelant fusionne avec `decisionsParDefaut`) ; rend `{ decisions, raisons }`.

**Tests :** schéma (`additionalProperties: false`, enum), consignes non vides et sans nom réel, `construireDemandeCalques` (message avec un bloc image par calque + l'aperçu, texte qui liste les statistiques), `lireDecisionsCalques` (nom inconnu ignoré, traitement invalide ignoré, oubli → absent du résultat).

Commit : `feat: état des lieux — Claude propose le traitement de chaque calque`.

---

### Task 3 : Import — calques, aperçu, fichier vectoriel enregistré

**Files :**
- Create : `supabase/migrations/081_edl_vecteurs.sql` — `alter table edl_niveaux add column if not exists chemin_vecteurs text, add column if not exists calques jsonb;` puis `fichiers_orphelins()` recopiée **entière** de la 079 avec `n.chemin_vecteurs = o.name` ajouté dans la clause `edl_niveaux`, `revoke` / `grant` rejoués, `notify pgrst, 'reload schema'`. Rejouable.
- Modify : `importerPlans.js` — `preparerFichier` ajoute `analyse` (`analyserCalques` sur tous les traits des étages proposés) et `decisions` (`decisionsParDefaut`) ; nouvelle fonction `proposerTraitements(preparation)` (appel de Task 2, fusion avec les défauts, rend `{ decisions, raisons }`, ne lève jamais : en échec rend les défauts et un `avertissement`) ; `importerDxf` : pour chaque étage, `simplifierNiveau(n, prep.decisions)`, **dessin de l'image depuis le résultat simplifié** (`rendreNiveauDxf` reçoit traits gardés + masses + textes ; masses peintes en blanc et contour épais), puis envoi du fichier `encoderVecteurs` à `<affaire>/edl/vecteurs/<uuid>.json.gz` (`application/gzip`), chemin noté dans `suivi.chemins` pour l'annulation.
- Modify : `renduNiveau.js` — `dessiner` peint d'abord les masses (remplissage blanc, contour `#1F1B17` épais : 2,5 × l'épaisseur des traits), puis les traits, puis les textes.
- Modify : `edlDonnees.js` — `enregistrerNiveau` écrit `chemin_vecteurs` et `calques` (`{ decisions, raisons, source: 'claude' | 'defaut' | 'main' }`) et **réessaie sans ces colonnes** si la base ne les a pas (code `42703` / « column … does not exist », comme les autres replis du dépôt) ; `supprimerEtat` et `annulerImport` retirent aussi `chemin_vecteurs`.
- Modify : `ImportEdl.jsx` — pour chaque fichier préparé : bloc « Calques » repliable (ouvert par défaut) : une ligne par calque (nom, nombre de traits, menu Garder / Pocher (murs) / Masquer le motif / Masquer, raison de Claude en petit gris au survol ou sous le nom), une mention d'état (« Claude choisit le traitement des calques… », « Proposé par Claude », « Claude indisponible : réglages par défaut »), et un **aperçu** (canevas 900 px de large au plus, l'étage simplifié avec les décisions courantes, recalculé 400 ms après le dernier changement, sur le premier étage gardé du fichier ; « N traits sur M » sous l'aperçu). L'appel à Claude part dès la préparation du fichier, sans bloquer le reste de la fenêtre ; « Importer » reste possible pendant l'appel (les décisions courantes s'appliquent).
- Test : `tests/etat-des-lieux-vectoriel.test.js` (logique pure seulement : fusion décisions Claude / défauts dans une fonction pure exportée de `simplificationPlan.js` ou `calquesIaLogique.js`, ex. `fusionnerDecisions(defauts, proposees)`).

Commit(s) : `feat: état des lieux — import : traitement des calques, aperçu, plan vectoriel enregistré (migration 081)`.

---

### Task 4 : Affichage vectoriel (bureau et tablette, hors ligne)

**Files :**
- Modify : `src/modules/chantier/comptes-rendus/VisionneusePlan.jsx` — prop facultative `dessinFond(ctx, { largeurImage, hauteurImage, versEcran, echelle, ecran: { largeur, hauteur } })` : un `<canvas>` posé **sous** le bloc transformé, à la taille du conteneur × `devicePixelRatio`, redessiné dans un `requestAnimationFrame` à chaque changement de vue, de taille ou de `dessinFond`. `versEcran(x, y)` convertit des pixels de l'image (repère `version.largeur` × `version.hauteur`) en pixels CSS du conteneur (`ox + vue.dx + x * echelle * vue.zoom`, idem en y), `echelle` = pixels CSS par pixel d'image au zoom courant. Quand `dessinFond` est fourni : l'`<img>` reste (mesure des appuis) mais `opacity: 0`, et le canevas peint la page blanche du plan. Sans `dessinFond`, rien ne change (comptes rendus).
- Create : `src/modules/etude/etat-des-lieux/vecteursEdl.js` — `chargerVecteurs(chemin, obtenirLiens)` (lien signé ou copie locale via `obtenirLiens`, `fetch`, `gunzipSync`, `decoderVecteurs`, cache mémoire par chemin) ; `dessinerVecteurs(ctx, vecteurs, cadrage, t)` : rectangle visible en mètres déduit de `t`, **seuls les traits / masses / textes dont la boîte le croise** sont dessinés ; masses : remplissage blanc (`evenodd`), contour `#1F1B17` de 2,5 px CSS ; traits : 1 px CSS `#3A3633` ; textes : hauteur réelle à l'échelle, ignorés sous 6 px. Un seul `beginPath` par famille.
- Create : `src/modules/etude/etat-des-lieux/useVecteursEdl.js` — `useVecteursEdl(niveau, obtenirLiens)` → `dessinFond` (fonction stable tant que les vecteurs et le cadrage ne changent pas) ou `null` (pas de `chemin_vecteurs`, chargement en cours, échec : l'image s'affiche comme avant).
- Modify : `EditeurPieces.jsx` et `visite/PlanVisite.jsx` — passent `dessinFond` à `VisionneusePlan`.
- Modify : `index.jsx` (et l'étape de préparation hors ligne si elle liste les chemins d'images de l'état des lieux) — `garderImages` reçoit aussi `chemin_vecteurs` de chaque étage : le fichier vectoriel est emporté sur la tablette.
- Test : `tests/etat-des-lieux-vectoriel.test.js` — fonctions pures extraites de `vecteursEdl.js` : `rectangleVisible(cadrage, t)` et `elementsVisibles(vecteurs, rect)`.

Commit : `feat: état des lieux — plan affiché en vectoriel, net à tous les zooms (bureau et visite)`.

---

### Task 5 : Documentation et vérification finale

- `CLAUDE.md`, section « État des lieux » : nouvelle puce **Plans vectoriels** (traitements par calque, Claude choisit, défauts, aperçu, fichier `vecteurs/…json.gz`, migration 081, affichage `dessinFond`, hors ligne) ; nombre de tests et de migrations (81 fichiers) en tête du fichier.
- `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` : une phrase dans la partie import.
- `npm test`, `npm run build`, `npx eslint src`.

Commit : `docs: état des lieux — plans vectoriels dans CLAUDE.md et la conception`.
