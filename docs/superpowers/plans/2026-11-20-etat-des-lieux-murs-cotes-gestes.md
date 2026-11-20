# État des lieux — finitions de murs au toucher, cotes sans bouton, textes d'aide : plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal :** pendant la visite, sans aucun bouton de mode : (1) **toucher pile sur un mur** (un côté du contour de la pièce ouverte) le met en surbrillance quelques secondes ; la finition **dite** juste avant ou après (« faïence toute hauteur ») est lue à l'analyse et crée une **finition de mur** (trait épais coloré le long du mur, décalé vers l'intérieur) ; rien dit = rien créé ; (2) **toucher pile sur un angle** l'allume, **toucher un second angle** crée **tout de suite** la cote (trait + « ? ») et ouvre le petit champ de valeur ; la valeur dite est lue à l'analyse comme aujourd'hui ; (3) des **textes d'aide** dynamiques s'affichent en haut du plan ; (4) les finitions de murs partout : plan de visite, onglet « Plans », relecture (proposition à valider), planches PDF et Word (**légende** comprise), DXF (calque `EDL-Finitions`), tableaux (colonne « Mur »).

**Décisions de l'agence (2026-11-20) :**
- Plus de bouton « Coter » ni de bouton « Finition de mur ».
- Priorité d'un toucher dans la pièce ouverte : **angle** (pile sur un sommet du contour) → **mur** (pile sur un côté) → sinon **point** posé comme aujourd'hui. « Pile » = zone fine d'environ 1 cm au doigt (≈ 12 px d'écran), plus fine que celle des points (22 px), pour qu'un interrupteur posé près d'un mur reste un point ; les points muraux sont de toute façon dessinés contre leur mur (`orientationElement`, 0,8 m).
- Premier angle allumé ~20 s ; un toucher ailleurs (hors angle) l'annule ; angle puis mur : le mur l'emporte (le premier angle s'éteint).
- Mur : la surbrillance seule ne crée rien ; seule la finition **dite** crée la finition de mur (proposition de l'analyse, `a_valider`). Un mur touché est noté au journal.
- Couleurs : faïence rouge `#C62828` (comme l'exemple « Faïence murale ») ; autres finitions d'une petite palette fixe (crédence, lambris, peinture spécifique, carrelage mural, autre) ; même couleur partout.
- Textes d'aide (validés par l'agence) :
  - entrée dans une pièce : « <Pièce> · touchez un angle, un mur, ou posez un point » ;
  - 1ᵉʳ angle : « Angle choisi · touchez un 2ᵉ angle pour coter » ;
  - 2ᵉ angle : « Cote créée · dites la dimension ou tapez-la » (avec le champ) ;
  - mur : « Mur choisi · dites sa finition (ex. faïence toute hauteur) — sans rien dire, rien n'est enregistré » ;
  - point posé : « Point P7 posé · dites ce que c'est ou choisissez son type » ;
  - point existant touché : « P7 · Interrupteur · dites ce qui change, photographiez ou reliez » ;
  - après « Relier » : « Touchez le luminaire commandé par cet interrupteur » (ou l'inverse) ;
  - liaison créée : « Liaison P3 → P7 créée » ;
  - point hors des pièces : « Point posé hors pièce · il est rattaché à l'étage ».
  Bandeau discret en haut du plan, ne capte pas le doigt, s'efface seul (~4 s, le texte du 1ᵉʳ angle tant que l'angle est allumé), jamais par-dessus le voile gris ni les bandeaux d'alerte.

**Architecture :** une finition de mur est une trace (`edl_traces`, migration **085** : `sorte` accepte `'finition'` ; extrémités du mur en `xa, ya, xb, yb`, texte de la finition dans `valeur` (« Faïence toute hauteur »), `statut` facultatif (codes de `statutsEdl.js`, colonne ajoutée), `origine 'ia'` + `a_valider` quand l'analyse la crée). Le journal note `mur-touche` (nouveau type, 085) avec les extrémités et le côté. L'analyse reçoit les touchers de murs dans la frise (« mur M2 touché (côté nord, 3,20 m) ») et rend `finitionsMurs: [{ mur: 'M2', finition, statut, extrait }]` → écrites par `edl_ecrire_analyse` (nouvelle version, `p_traces` porte aussi `sorte: 'finition'` avec extrémités). Toute la géométrie (`decalageFinition`, côté intérieur) est partagée : écran, planche, DXF.

**Spec :** `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` ; plans précédents `2026-11-20-etat-des-lieux-liaisons-cotes.md` (traces, 084) et `2026-11-19-etat-des-lieux-planches.md` (planches, légende, tableaux). CLAUDE.md « État des lieux » décrit l'existant.

## Global Constraints

- Français partout ; styles inline, charte du module ; **cibles de 44 px** ; panneaux et bandeaux de la visite ancrés en haut ; une fenêtre ne se ferme jamais au clic à côté ; tout dessin sur le plan passe par le `calque` de `VisionneusePlan` (rendu à la taille de l'écran : règle Safari).
- **Dépôt public** : données inventées dans les tests.
- **Migration 085 passée à la main** : sans elle, toucher un mur ne fait rien de plus qu'une surbrillance (rien noté de nouveau, aucune erreur), l'analyse et les exports sont ceux d'avant ; la contrainte `sorte` et la liste des types du journal sont **recopiées en entier** (084 + nouveaux) ; `edl_ecrire_analyse` : nouvelle version complète (recopier le corps de la 084, mêmes droits), paramètres inchangés.
- Visite hors ligne : tout geste par la file ; id décidés sur l'appareil ; annulation après écriture réussie.
- Mêmes règles partout : propositions exclues des exports par défaut ; DXF, planches, Word, tableaux lisent les finitions par une seule fonction (`tracesAExporter` étendu).
- `npm test` vert, `npm run build`, `npx eslint src` à 72. Commits `feat:` / `fix:` / `docs:` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne jamais pousser.

---

### Task 1 : Migration 085, gestes de la visite sans bouton, textes d'aide, analyse

**Files :** `supabase/migrations/085_edl_finitions_murs.sql` (nouvelle) ; `tracesEdl.js` (sorte `finition`, `FINITIONS_MUR` + couleurs, `murLePlusProche(contour, pt, tolérance)`, `angleSous(contour, pt, tolérance)`, `decalageFinition`) ; `visite/tracesVisiteLogique.js` (résolution d'un toucher : angle / mur / point ; état du 1ᵉʳ angle et du mur allumé ; textes d'aide purs `texteAide(evenement)`) ; `visite/VisiteEdl.jsx`, `visite/PlanVisite.jsx` (retrait des boutons Coter, surbrillances, bandeau d'aide), `visite/DessinsPlanEdl.jsx` (dessin d'une finition de mur) ; `visite/fileEdlLogique.js` / `useVisiteEdl.js` si besoin (événement `mur-touche`) ; `analyse/analyseEdlLogique.js` (frise : murs touchés `M<n>`, consignes, schéma `finitionsMurs`, `lireAnalyse` : mur connu, finition non vide, statut lu par `codeStatut`) ; `analyse/analyseEdl.js` / `analyseDonnees.js` (`p_traces` avec les finitions) ; `aideMemoireLogique.js` (rubrique murs : « finitions particulières (faïence…) : touchez le mur et dites-la »).
**Tests :** priorité angle > mur > point avec tolérances ; expiration du 1ᵉʳ angle ; deux fois le même angle refusé ; textes d'aide ; frise et lecture de `finitionsMurs` ; 085 rejouée dans PGlite (comme la 084) si disponible.
Commit : `feat: état des lieux — finitions de murs au toucher, cotes sans bouton, textes d'aide (migration 085)`.

### Task 2 : Finitions de murs dans « Plans », la relecture, les exports et la documentation

**Files :** onglet « Plans » (`PlansEdl.jsx`, `DessinsPlanEdl.jsx`) : dessin, toucher d'une finition → panneau (finition, statut, Valider / Modifier / Supprimer) ; `analyse/RevuePiece.jsx` (section « Finitions de murs » de la pièce : propositions en bleu avec l'extrait, Valider / Modifier / Écarter) ; `export/plancheEdl.js` (finitions en mm, **légende** : une entrée par finition présente, trait de sa couleur, ex. « Faïence murale ») ; `export/dessinPlancheEdl.js` (trait épais 1,2 mm, décalé de 1 mm vers l'intérieur, sous les symboles ; aussi dans le fond Word) ; `export/exportDxfEdl.js` (polyligne épaisse — largeur constante R12 — sur `EDL-Finitions`, propositions sur `EDL-À valider`) ; `export/tableauxEdlLogique.js` (colonne « Mur » : « Faïence : 2 murs (toute hauteur) » sous la finition générale, avec statut) ; CLAUDE.md (puce « Finitions de murs, cotes et textes d'aide », nombre de migrations, de tests), conception (avenant).
**Tests :** légende, mm, DXF relu, tableaux, propositions exclues.
Commit : `feat: état des lieux — finitions de murs sur les plans, les planches, le DXF et les tableaux` puis `docs: …`.

### Task 0 (faite en premier) : ajouter un élément au bureau en touchant le plan

Demande de l'agence (2026-11-20) : « En dehors d'une visite il n'est pas possible d'ajouter un élément sur le plan : il y a bien "Ajouter un élément" mais pas de symbole / pastille. Dès qu'on clique sur "Ajouter un élément" on doit pouvoir cliquer à l'endroit de la pièce où on veut le mettre. »
**Comportement :** dans le panneau de la pièce (`RevuePiece` / `ElementsRelecture`, onglet « Plans »), « Ajouter un élément » passe le plan en mode placement : bandeau « Touchez la pièce à l'endroit de l'élément » + Annuler ; le toucher suivant **dans la pièce choisie** crée un **point** (`edl_points`) à cet endroit puis ouvre le formulaire de l'élément (type, libellé, cotes) déjà rattaché à ce point ; l'élément enregistré est validé (`a_valider false`, `origine 'main'`), et le point prend son type. Annuler le formulaire retire le point créé. Un toucher hors de la pièce : message, rien créé. Lecture seule : bouton masqué.
**Données :** `edl_points.visite_id` est obligatoire (079) : le point est rattaché à la **dernière visite** de l'affaire (l'onglet n'existe qu'avec une visite) ; numéro = le plus grand de l'affaire + 1 (`numeroSuivant`) ; `pose_le` = maintenant ; écriture directe (bureau, en ligne) comme les autres écritures de la relecture, lignes comptées. Aucune migration.
**Tests :** logique pure du mode (toucher dans / hors pièce), numéro suivant, annulation.
Commit : `feat: état des lieux — ajouter un élément au bureau en touchant le plan`.
