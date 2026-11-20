# État des lieux — liaisons interrupteur → luminaire et cotes entre angles : plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal :** pendant la visite d'état des lieux, (1) relier un interrupteur au luminaire qu'il commande — par la voix (on touche l'interrupteur puis le luminaire en le disant, Claude crée la liaison à l'analyse) ou par un bouton « Relier » du panneau du point (immédiat) — et la dessiner en plan par un **trait courbe fin**, convention du dessin électrique ; (2) **coter** entre deux angles d'une pièce : bouton « Coter » de la barre de la pièce, les deux touchers suivants s'accrochent aux angles les plus proches (aucun point posé), la valeur est **dite** (lue par Claude à l'analyse) ou **tapée** dans un champ. Les deux apparaissent sur le plan de la visite, en relecture (Valider / Modifier / Écarter), dans le DXF, sur les planches PDF et Word.

**Décisions de l'agence (2026-11-20) :** liaisons par la voix **et** bouton « Relier » ; cotes par un bouton « Coter » (pas d'accroche automatique : un interrupteur posé dans un angle deviendrait un angle de cote).

**Architecture :** une table **`edl_traces`** (migration 084) porte liaisons (`sorte = 'commande'`, deux points) et cotes (`sorte = 'cote'`, deux positions en mètres, `valeur`). Un geste à la main crée la trace tout de suite (par la file de la visite, comme un point : hors ligne, annulable). Le journal note en plus les touchers (`point-touche`, `angle-touche`) : la frise de l'analyse les montre à Claude à leur heure, à côté de ce qui est dit ; Claude **propose** des liaisons et la **valeur** des cotes restées sans valeur (`a_valider`), écrites dans la même transaction que la fiche (`edl_ecrire_analyse`, nouvelle version). Les exports lisent les traces par une seule fonction (`tracesAExporter`), avec la règle habituelle des propositions.

**Tech Stack :** React 19 + Vite, Supabase (migration à passer à la main), IndexedDB (`jga-edl`), Claude (`claude-opus-5-5`, sortie JSON imposée), pdfmake / pdf-lib / docx, `node --test`.

**Spec :** `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` (§ 4 visite, § 5 analyse, § 7 export) ; ce plan en est l'avenant du 2026-11-20. CLAUDE.md, section « État des lieux », décrit l'existant (visite, file hors ligne, analyse, export, planches).

## Global Constraints

- Français partout (noms métier, commentaires qui disent pourquoi, messages). Styles inline, charte du module (`--affaire-accent`, bordures 0,5 px, angles 2–3 px, ambre `#FFFBEB` / `#92400E`, rouge `#B8412C`). **Cibles de 44 px** (iPad). Panneaux de la visite ancrés en haut (le clavier recouvre le bas). Une fenêtre ne se ferme jamais au clic à côté.
- **Dépôt public** : aucun nom, plan ni donnée réels dans le code ou les tests (données inventées).
- **Migration passée à la main** par l'agence : tout le code tolère l'absence de la 084 (fonctions masquées, message clair « migration 084 à passer », aucune erreur). Toute table créée reçoit `grant select, insert, update, delete … to authenticated;` et `to service_role;` (jamais `anon`), RLS comme les autres tables `edl_` (agence ; règles **restrictives** d'écriture `peut_modifier_affaire` comme la 079).
- **Visite hors ligne** : tout geste passe par la file (`fileEdlLogique.js`, `synchroEdl.js`) ; **l'identifiant des lignes créées est décidé sur l'appareil**, un doublon `23505` vaut succès ; l'entrée d'annulation n'est empilée qu'après l'écriture réussie ; l'instantané (`baseEdl.js`) inclut les traces.
- **Mêmes règles partout** : DXF, planches PDF et Word lisent les traces par `tracesAExporter` ; par défaut seules les traces validées (`a_valider = false`) partent, option « Inclure les propositions » comme pour les éléments.
- Analyse : payante, relances plafonnées existantes inchangées ; le schéma JSON reste fermé (`additionalProperties: false`, `required` partout, `anyOf` avec `null`).
- `npm test` vert, `npm run build` réussi, `npx eslint src` sans problème ajouté (72 préexistants). Commits `feat:` / `fix:` / `test:` / `docs:` finissant par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Ne jamais pousser** (le contrôleur pousse).

---

### Task 1 : Migration 084 et données des traces (file hors ligne comprise)

**Files :**
- Create : `supabase/migrations/084_edl_traces.sql`
- Create : `src/modules/etude/etat-des-lieux/tracesEdl.js` (pur : sortes, validation, géométrie commune)
- Modify : `visite/fileEdlLogique.js` (types `trace.creer`, `trace.modifier`, `trace.supprimer`, application à l'instantané, inverse pour l'annulation), `visite/synchroEdl.js` (envoi, `23505` = succès, repli « table absente »), `visite/baseEdl.js` / `visite/visiteDonnees.js` (instantané et lecture : `traces`, lecture `synchro_id:id` paginée comme les autres ; table absente → `[]` et drapeau `tracesDisponibles: false`), `visite/useVisiteEdl.js` (`creerTrace`, `modifierTrace`, `supprimerTrace`, `noter('point-touche' | 'angle-touche', …)`), `edlDonnees.js` si la lecture du module (bureau) doit les rendre.
- Test : `tests/etat-des-lieux-traces.test.js` (nouveau), `tests/etat-des-lieux-visite*.test.js` pour la file.

**Migration 084** (rejouable, `if not exists`, commentée en français comme les précédentes) :
- `edl_traces` : `id uuid primary key` (décidé sur l'appareil), `affaire_id uuid not null references affaires on delete cascade`, `visite_id uuid references edl_visites on delete set null`, `niveau_id uuid not null references edl_niveaux on delete cascade`, `piece_id uuid references edl_pieces on delete set null`, `sorte text not null check (sorte in ('commande','cote'))`, `point_a uuid references edl_points on delete cascade`, `point_b uuid references edl_points on delete cascade` (commande : interrupteur puis luminaire), `xa, ya, xb, yb double precision` (cote : angles en mètres, repère du plan), `valeur text` (cote : « 3,45 m » tel que dit ou tapé), `origine text not null default 'main' check (origine in ('main','ia'))`, `a_valider boolean not null default false`, `extrait text`, `created_by uuid default auth.uid()`, `created_at`, `updated_at` (déclencheur de mise à jour comme les autres tables `edl_`). Contrôle : une commande a ses deux points, une cote ses quatre coordonnées.
- RLS : lecture et écriture agence comme `edl_elements` (082), plus le bloc **restrictif** `peut_modifier_affaire(affaire_id)` d'insert / update / delete (comme la 079). Grants authenticated + service_role.
- `edl_evenements` : contrainte `type` élargie (drop / add, rejouable) à `'point-touche'`, `'angle-touche'`, `'trace'`, `'trace-supprimee'` en plus des onze types existants (les recopier exactement depuis la 079).
- `edl_ecrire_analyse` : **nouvelle version** (`create or replace`, même nom, paramètre ajouté **en dernier avec défaut** `p_traces jsonb default null` — recopier tout le corps de la 082 et n'ajouter que : si `p_traces` n'est pas nul, supprimer les traces `origine = 'ia' and a_valider` de la pièce puis insérer celles de `p_traces` (`on conflict do nothing`), et mettre à jour `valeur` / `a_valider` / `extrait` des cotes désignées par id **seulement si leur valeur est encore nulle** — une valeur tapée ou validée n'est jamais remplacée). Supprimer l'ancienne signature à 6 paramètres (`drop function if exists edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean)` — vérifier les types exacts dans la 082) pour qu'il n'y ait pas d'ambiguïté d'appel. Grants d'exécution comme la 082. `fichiers_orphelins()` : rien à changer (aucun fichier).
- En tête : rappel « à passer dans le SQL Editor ; sans elle, l'app masque Relier et Coter ».

**`tracesEdl.js`** : `SORTES_TRACE`, `TYPES_INTERRUPTEUR = ['interrupteur']`, `TYPES_LUMINAIRE = ['luminaire','applique','dalle','reglette']` ; `liaisonPossible(pointA, pointB)` (un interrupteur et un luminaire, dans un sens ou l'autre ; rend `{ interrupteur, luminaire }` ordonnés ou `null`) ; `angleLePlusProche(contour, [x, y])` → sommet du contour le plus proche ; `longueurCote(trace)` (m) et `valeurCote(texte)` → nombre de mètres lu dans « 3,45 », « 3.45 m », « 345 cm », « 3 m 45 » (ou `null`) ; `texteValeur(m)` → « 3,45 m » ; `traceValide(t)`.

**Tests :** liaisonPossible dans les deux sens et refus (deux interrupteurs, prise) ; angle le plus proche ; lectures de valeurs ; file : créer / modifier / supprimer une trace hors ligne puis envoi, doublon 23505 = succès, inverse d'une création = suppression et inversement ; instantané avec et sans table (repli).

Commit : `feat: état des lieux — liaisons et cotes : table edl_traces (migration 084), file hors ligne`.

---

### Task 2 : Visite — « Relier », « Coter », touchers au journal, dessin sur le plan

**Files :**
- Modify : `visite/VisiteEdl.jsx` (mode cote, touchers notés, annulation), `visite/PanneauPoint.jsx` (bouton « Relier » sur un interrupteur ou un luminaire), `visite/PlanVisite.jsx` (dessin des traces : SVG du calque, sous les points), `visite/aideMemoireLogique.js` (rubrique « Commandes d'éclairage et cotes » : cochée dès qu'une liaison ou une cote existe dans la pièce)
- Create : `visite/tracesVisiteLogique.js` (pur : état du mode « Relier » / « Coter », géométrie du dessin — `courbeCommande(a, b)` points d'une courbe quadratique, flèche 20 % de la longueur, toujours du même côté (à gauche du sens interrupteur → luminaire) ; `traitsCote(a, b)` : ligne, traits obliques à 45° aux extrémités, position et angle du texte, lisible jamais à l'envers)
- Test : `tests/etat-des-lieux-traces.test.js` (logique du dessin et des modes)

**Comportement :**
- **Toucher un point existant** (`choisirPoint`) note `point-touche` au journal (numéro, type) — c'est ce que Claude rapprochera de la phrase dite. Pas de nouvelle pose sur un point existant (règle inchangée).
- **« Relier »** (panneau d'un point interrupteur ou luminaire ; masqué sans la 084) : la barre de la pièce affiche « Touchez le luminaire à relier » (ou l'interrupteur), bouton « Annuler » ; le toucher suivant **sur un point compatible** crée la trace `commande` (`origine 'main'`, `a_valider false`) et note `trace` au journal ; un toucher ailleurs (pièce, point incompatible) ne pose rien et dit pourquoi ; Échap / Annuler quitte le mode. Une liaison existante entre les deux points n'est pas doublée. Annulable (⌘Z) comme une pose.
- **« Coter »** (barre de la pièce ouverte, 44 px ; masqué sans la 084) : mode où les deux touchers suivants s'accrochent à l'angle le plus proche du contour de la pièce (repère visuel de l'angle choisi, rond de 44 px de zone sensible) et notent `angle-touche` ; au second, la cote est créée (`valeur` nulle) et un petit champ « Cote (m) » s'ouvre en haut de l'écran (clavier numérique, Valider / Plus tard) : une valeur tapée est enregistrée (`modifierTrace`) ; sinon Claude la lira dans ce qui a été dit. Deux fois le même angle : refusé. Annulable.
- **Dessin** (PlanVisite, dans le calque SVG, épaisseurs en pixels d'écran constantes) : commande = courbe fine couleur électricité `#1565C0` ; cote = ligne `#0E7490` avec traits obliques et valeur (« ? » si inconnue) ; une trace `a_valider` en tirets bleu des propositions. Toucher une trace en mode normal la sélectionne : petit panneau « Liaison P3 → P7 » / « Cote 3,45 m » avec Modifier (cote : la valeur) et Supprimer (confirmé, annulable).
- Sans la 084 : boutons masqués, une ligne discrète dans l'aide-mémoire ne s'affiche pas ; rien ne casse.

Commit : `feat: état des lieux — visite : relier un interrupteur à un luminaire, coter entre deux angles`.

---

### Task 3 : Analyse et relecture des liaisons et des cotes

**Files :**
- Modify : `analyse/analyseEdlLogique.js` (frise : lignes `point-touche` « point P3 (Interrupteur) touché », `angle-touche` « angle touché (cote C2) », `trace` « liaison P3 → P7 posée à la main » / « cote C2 posée entre deux angles » ; références courtes `C<n>` des cotes de la pièce, liste des traces existantes avec leur valeur ; consignes : une liaison se propose quand ce qui est dit relie un interrupteur à un luminaire touchés à peu d'écart — jamais deux fois une liaison existante ; une valeur de cote se propose pour une cote sans valeur d'après ce qui est dit juste avant ou après ses deux angles ; schéma : `liaisons: [{ interrupteur: 'P3', luminaire: 'P7', extrait }]`, `cotes: [{ cote: 'C2', valeur: '3,45 m', extrait }]` ; `lireAnalyse` : références connues, types compatibles (`liaisonPossible`), valeur lisible (`valeurCote`), sinon écartée), `analyse/analyseEdl.js` / `analyseDonnees.js` (envoi de `p_traces` à `edl_ecrire_analyse` ; sans la 084 : on n'envoie pas le paramètre et l'analyse marche comme avant), `api/analyser-edl.js` si les données de la pièce y sont recomposées.
- Modify : `analyse/RelectureEdl.jsx` (+ un composant `TracesRelecture.jsx`) : section « Liaisons et cotes » de la pièce : propositions en bleu avec l'extrait entendu, Valider / Modifier (cote : la valeur ; liaison : non) / Écarter (confirmation) ; traces validées listées, supprimables ; plan de la pièce (`PlanVisite` en consultation) qui les montre.
- Test : `tests/etat-des-lieux-analyse-ia.test.js`, `tests/etat-des-lieux-analyse.test.js` (frise, schéma, lecture), `tests/etat-des-lieux-relecture-analyse.test.js` si concerné.

Commit : `feat: état des lieux — analyse : liaisons et valeurs de cotes proposées par Claude, relecture`.

---

### Task 4 : Exports (DXF, planches PDF et Word) et documentation

**Files :**
- Modify : `export/exportDonnees.js` (lecture des traces, table absente → `[]`), `export/exportFenetreLogique.js` (`preparerExport` : traces par étage), `export/exportDxfEdl.js`, `export/plancheEdl.js`, `export/dessinPlancheEdl.js`, `export/rapportWordEdl.js` (rien si les traces sont dans le fond), `tracesEdl.js` (`tracesAExporter({ traces, points, inclurePropositions })` → `[{ id, sorte, a: [x, y], b: [x, y], valeur, aValider }]` en mètres ; une commande dont un point manque ou n'est plus exporté est omise).
- Modify : `CLAUDE.md` (section État des lieux : traces, migration 084, gestes, analyse, exports ; nombre de tests ; nombre de migrations), conception § 4–7 (avenant du 2026-11-20).
- Test : `tests/etat-des-lieux-export-dxf.test.js`, `tests/etat-des-lieux-export-planche.test.js`, `tests/etat-des-lieux-export-word.test.js` si concerné.

**DXF R12** : commande = `ARC` (cercle passant par les deux points avec la même flèche que l'écran, sens trigonométrique correct, relu par `lireDxf`) sur le calque `EDL-Électricité` ; cote = `LINE` + deux traits obliques + `TEXT` (valeur, centré au-dessus, lisible) sur `EDL-Cotes` ; propositions incluses → `EDL-À valider`. Unité du plan d'origine comme le reste.
**Planche** : `misePlanche` reçoit les traces et les passe en mm (`versMmPlanche`) ; elles entrent dans l'emprise ; `dessinerPlanche` les dessine **sous les symboles** (commande : courbe 0,25 mm couleur électricité ; cote : 0,18 mm, traits obliques, valeur 2,2 mm), dans le **fond** de la planche Word aussi (non déplaçables : le Word garde les symboles seuls déplaçables) ; légende : entrée « Commande d'éclairage » (courbe) quand il y en a, « Cote » quand il y en a.
**Tests :** DXF relu (ARC sur EDL-Électricité, rayon et extrémités justes, texte de cote) ; mise en mm et emprise ; légende ; dessin sur contexte enregistreur ; propositions exclues par défaut.

Commits : `feat: état des lieux — export : liaisons et cotes dans le DXF et les planches` puis `docs: …`.
