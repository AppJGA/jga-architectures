# Dossier pour Claude (conformité plans / CCTP) — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** dans le module Pièces écrites, un bouton « Préparer le dossier pour Claude » fabrique un ZIP (sommaire, CCTP, texte des plans avec position et couleur, plans réunis). Le dossier est à déposer dans le projet claude.ai de l'agence.

**Architecture :**
- Tous les calculs sont dans un module pur testé, `dossierClaudeLogique.js` : couleur des écritures suivie dans la liste d'opérations pdf.js, lignes, fusion, contenu des quatre fichiers.
- La lecture pdf.js, la réunion des PDF (pdf-lib) et le ZIP (fflate) sont dans `dossierClaude.js`.
- La fenêtre est `DossierClaude.jsx`.
- Rien n'est enregistré : ni base, ni stockage.

**Tech Stack :** React 19, pdfjs-dist 3.11 (déjà utilisé par `lecturePdf.js`), pdf-lib et fflate (déjà au projet), node --test.

**Spec :** `docs/superpowers/specs/2026-10-08-dossier-claude-conformite-design.md`

## Global Constraints

- Français partout : code métier, commentaires (le pourquoi, pas le quoi), messages de commit `feat:` / `test:` / `docs:`.
- Styles inline, couleurs de l'app ; aucune fenêtre ne se ferme au clic à côté (✕, Annuler, Échap seulement) ; `createPortal` pour la fenêtre.
- Dépôt public : aucun extrait réel de CCTP ni de plan dans le code ou les tests (textes inventés). Les essais sur l'affaire réelle se font hors dépôt (scratchpad).
- Numéro de lot affiché par `numeroLot` / `libelleNumeroLot` (`src/shared/lots/numeroLot.js`), jamais `lot.numero`.
- Couleurs nommées avec les seuils de la référence : rouge `r>170, g<100, b<100` ; bleu `b>140, r<110` ; vert `g>120, r<110, b<120` ; orange `r>200, 100<g<190, b<90` ; magenta `r>150, b>150, g<110` ; sinon aucune.
- Fusion des lignes : même couleur, `0 < Δy ≤ 6 mm`, `|Δx| ≤ 12 mm`, parmi les 20 dernières, textes joints par « / ».
- Adresse du projet : `https://claude.ai/project/019e0285-ad37-7277-9c8f-e7e6367140c6`. Version des consignes : **2**. Limite d'un fichier claude.ai : **30 Mo**.
- Noms des fichiers du dossier : `1 - Sommaire.md`, `2 - CCTP.md`, `3 - Plans (texte).md`, `4 - Plans.pdf`.
- `npm run build` doit passer. `npm test` doit être vert. `npx eslint src` ne doit pas dépasser les ~71 problèmes existants.
- Commiter et pousser à la fin de chaque tâche (`git push`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/modules/etude/pieces-ecrites/dossierClaudeLogique.js` (créé) | Pur : couleurs, annotations d'une page, texte d'un plan, ordre des pièces et des plans, contenu des 3 fichiers texte, message, nom du ZIP, constantes |
| `src/modules/etude/pieces-ecrites/consignesConformite.md` (créé) | Les consignes du projet claude.ai (version 2), importées en `?raw` par la fenêtre |
| `src/modules/etude/pieces-ecrites/dossierClaude.js` (créé) | Navigateur : lecture pdf.js d'un plan, réunion des PDF, fabrication et téléchargement du ZIP |
| `src/modules/etude/pieces-ecrites/DossierClaude.jsx` (créé) | La fenêtre : CCTP, dépôt des plans, fabrication, message, projet, consignes |
| `src/modules/etude/pieces-ecrites/index.jsx` (modifié) | Bouton « Préparer le dossier pour Claude » |
| `tests/dossier-claude.test.js` (créé) | Tests de la logique pure |
| `CLAUDE.md` (modifié) | Section « Dossier pour Claude » dans « Pièces écrites », nombre de tests |

---

### Tâche 1 : couleurs et annotations d'un plan (logique pure)

**Files :**
- Create: `src/modules/etude/pieces-ecrites/dossierClaudeLogique.js`
- Test: `tests/dossier-claude.test.js`

**Interfaces :**
- Produces :
  - `nomCouleur([r, g, b]) → 'rouge'|'bleu'|'vert'|'orange'|'magenta'|''`
  - `ecrituresColorees(fnArray, argsArray, OPS) → [{ x, y, rgb }]`, en points dans l'espace de la page
  - `annotationsDePage({ items, ecritures, view }) → [{ x, y, couleur, texte }]` : mm entiers, origine en haut à gauche, lignes fusionnées, triées
  - `textePlan({ titre, pages: [{ largeur, hauteur, annotations }] }) → string`

- [ ] **Étape 1 : écrire les tests qui échouent**

`tests/dossier-claude.test.js` :

```js
// Dossier pour Claude : couleurs des plans, contenu des fichiers.
// Textes inventés : aucun extrait réel de plan ni de CCTP dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  nomCouleur, ecrituresColorees, annotationsDePage, textePlan,
} from '../src/modules/etude/pieces-ecrites/dossierClaudeLogique.js'

// Codes d'opérations factices : seuls les noms comptent pour la logique
const OPS = {
  save: 1, restore: 2, transform: 3, paintFormXObjectBegin: 4, paintFormXObjectEnd: 5,
  setFillRGBColor: 6, setStrokeRGBColor: 7, setFont: 8, setHScale: 9, setCharSpacing: 10,
  setWordSpacing: 11, setLeading: 12, setTextRise: 13, setTextRenderingMode: 14,
  beginText: 15, setTextMatrix: 16, moveText: 17, setLeadingMoveText: 18, nextLine: 19,
  showText: 20, showSpacedText: 21, nextLineShowText: 22, nextLineSetSpacingShowText: 23,
}
const glyphes = (texte, largeur = 500) => [...texte].map((c) => ({ unicode: c, width: largeur, isSpace: c === ' ' }))
const MM = 72 / 25.4 // points par mm

describe('couleurs', () => {
  test('les seuils de la référence', () => {
    assert.equal(nomCouleur([230, 20, 20]), 'rouge')
    assert.equal(nomCouleur([0, 0, 255]), 'bleu')
    assert.equal(nomCouleur([0, 160, 0]), 'vert')
    assert.equal(nomCouleur([255, 140, 0]), 'orange')
    assert.equal(nomCouleur([200, 0, 200]), 'magenta')
    assert.equal(nomCouleur([0, 0, 0]), '')
    assert.equal(nomCouleur([128, 128, 128]), '')
  })

  test('chaque écriture prend la couleur de remplissage courante, à sa position', () => {
    const fn = [OPS.setFillRGBColor, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.endText,
      OPS.setFillRGBColor, OPS.beginText, OPS.setTextMatrix, OPS.showText]
    const args = [[255, 0, 0], null, ['F1', 10], [1, 0, 0, 1, 100, 500], [glyphes('Démolir')], null,
      [0, 0, 255], null, [1, 0, 0, 1, 50, 300], [glyphes('2,60')]]
    const e = ecrituresColorees(fn, args, OPS)
    assert.deepEqual(e.map((x) => [Math.round(x.x), Math.round(x.y), x.rgb.join(',')]), [[100, 500, '255,0,0'], [50, 300, '0,0,255']])
  })

  test('les écritures qui se suivent avancent de la largeur des glyphes', () => {
    const fn = [OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.showText]
    const args = [null, ['F1', 10], [1, 0, 0, 1, 100, 500], [glyphes('AB')], [glyphes('CD')]]
    const [, deuxieme] = ecrituresColorees(fn, args, OPS)
    assert.equal(Math.round(deuxieme.x), 110) // 2 glyphes de 500/1000 × 10
  })

  test('save / restore et transform : la couleur et la matrice reviennent', () => {
    const fn = [OPS.save, OPS.setFillRGBColor, OPS.transform, OPS.restore, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText]
    const args = [null, [255, 0, 0], [2, 0, 0, 2, 10, 10], null, null, ['F1', 10], [1, 0, 0, 1, 20, 30], [glyphes('x')]]
    const [e] = ecrituresColorees(fn, args, OPS)
    assert.deepEqual([e.x, e.y, e.rgb], [20, 30, [0, 0, 0]])
  })

  test('un symbole (forme) applique sa matrice au texte qu’il contient', () => {
    const fn = [OPS.paintFormXObjectBegin, OPS.beginText, OPS.setFont, OPS.setTextMatrix, OPS.showText, OPS.paintFormXObjectEnd]
    const args = [[[1, 0, 0, 1, 100, 200], null], null, ['F1', 10], [1, 0, 0, 1, 5, 5], [glyphes('PAC')], null]
    const [e] = ecrituresColorees(fn, args, OPS)
    assert.deepEqual([e.x, e.y], [105, 205])
  })
})

describe('annotations d’une page', () => {
  // Page A3 paysage : 420 × 297 mm
  const view = [0, 0, 420 * MM, 297 * MM]
  // Fragment pdf.js à (x, y) mm depuis le haut, hauteur 2,5 mm
  const frag = (str, xMm, yMm, largeurMm = str.length * 1.5) => ({
    str, width: largeurMm * MM, height: 2.5 * MM,
    transform: [1, 0, 0, 1, xMm * MM, (297 - yMm - 2.5) * MM],
  })
  const ecr = (xMm, yMm, rgb) => ({ x: xMm * MM, y: (297 - yMm - 2.5) * MM, rgb })

  test('position en mm depuis le haut, couleur de l’écriture la plus proche', () => {
    const items = [frag('Démolition cloison', 100, 50), frag('2,60', 200, 80)]
    const ecritures = [ecr(100, 50, [230, 0, 0]), ecr(200, 80, [0, 0, 255])]
    assert.deepEqual(annotationsDePage({ items, ecritures, view }), [
      { x: 100, y: 50, couleur: 'rouge', texte: 'Démolition cloison' },
      { x: 200, y: 80, couleur: 'bleu', texte: '2,60' },
    ])
  })

  test('les fragments d’une même ligne se rejoignent', () => {
    const items = [frag('Séjour', 100, 50, 9), frag('/', 109.2, 50, 1), frag('21,07 m2', 111, 50)]
    assert.deepEqual(annotationsDePage({ items, ecritures: [], view }).map((a) => a.texte), ['Séjour/ 21,07 m2'])
  })

  test('les lignes d’un même bloc et de même couleur fusionnent par « / »', () => {
    const items = [frag('ME01', 200, 70), frag('all. 0,90', 200, 74), frag('Cuisine', 200, 78)]
    const ecritures = [ecr(200, 70, [0, 160, 0]), ecr(200, 74, [0, 160, 0]), ecr(200, 78, [0, 0, 0])]
    assert.deepEqual(annotationsDePage({ items, ecritures, view }), [
      { x: 200, y: 70, couleur: 'vert', texte: 'ME01 / all. 0,90' },
      { x: 200, y: 78, couleur: '', texte: 'Cuisine' },
    ])
  })

  test('trop loin (plus de 6 mm plus bas ou 12 mm de côté) : pas de fusion', () => {
    const items = [frag('A', 100, 50), frag('B', 100, 57), frag('C', 113, 60)]
    assert.equal(annotationsDePage({ items, ecritures: [], view }).length, 3)
  })

  test('les fragments vides sont ignorés', () => {
    assert.deepEqual(annotationsDePage({ items: [frag('  ', 10, 10)], ecritures: [], view }), [])
  })
})

describe('texte d’un plan', () => {
  test('titre, format de chaque page, une ligne par annotation', () => {
    const t = textePlan({ titre: '40 RDC', pages: [{ largeur: 420, hauteur: 297, annotations: [
      { x: 10, y: 20, couleur: 'bleu', texte: '2,60' }, { x: 30, y: 40, couleur: '', texte: 'Séjour' },
    ] }] })
    assert.equal(t, [
      '=== 40 RDC ===',
      '--- page 1 : 420×297 mm, (x,y) en mm depuis le coin haut gauche ---',
      '(10,20) [bleu] 2,60',
      '(30,40) Séjour',
    ].join('\n'))
  })

  test('une page sans texte le dit', () => {
    const t = textePlan({ titre: 'Scan', pages: [{ largeur: 420, hauteur: 297, annotations: [] }] })
    assert.match(t, /aucun texte lisible/)
  })
})
```

- [ ] **Étape 2 : vérifier qu'ils échouent**

Run : `node --import ./tests/resolve-src.mjs --test tests/dossier-claude.test.js`
Attendu : ÉCHEC, module `dossierClaudeLogique.js` introuvable.

- [ ] **Étape 3 : écrire la logique**

`src/modules/etude/pieces-ecrites/dossierClaudeLogique.js` :

```js
// ─── Dossier pour Claude : conformité plans / CCTP ───────────────────────────
//
// L'analyse se fait dans un projet claude.ai de l'agence (abonnement Team,
// aucune clé d'API) ; l'app ne fabrique que le dossier à y déposer
// (conception : docs/superpowers/specs/2026-10-08-dossier-claude-conformite-design.md).
// Ce qui fait la qualité de l'analyse, constaté aux essais : le texte de
// chaque plan avec la position et la couleur de chaque annotation (rouge =
// démolition, bleu = cotes…), plus fiable qu'un coup d'œil sur une planche
// A3 réduite. Pur, testé (tests/dossier-claude.test.js).

const MM_PAR_POINT = 25.4 / 72

// ─── Couleur des textes d'un plan ───────────────────────────────────────────

/** Mêmes seuils que l'extraction de référence des essais. */
export function nomCouleur([r, g, b] = [0, 0, 0]) {
  if (r > 170 && g < 100 && b < 100) return 'rouge'
  if (b > 140 && r < 110) return 'bleu'
  if (g > 120 && r < 110 && b < 120) return 'vert'
  if (r > 200 && g > 100 && g < 190 && b < 90) return 'orange'
  if (r > 150 && b > 150 && g < 110) return 'magenta'
  return ''
}

const produit = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]
const translation = (x, y) => [1, 0, 0, 1, x, y]

/**
 * pdf.js ne donne pas la couleur des fragments de `getTextContent` : on la
 * suit dans la liste d'opérations. Chaque écriture de texte reçoit la couleur
 * de remplissage courante (de trait en mode contour) et sa position dans
 * l'espace de la page — matrice courante, matrice de texte, et avance des
 * glyphes quand plusieurs écritures se suivent sans repositionnement.
 * @returns [{ x, y, rgb }] en points
 */
export function ecrituresColorees(fnArray = [], argsArray = [], OPS = {}) {
  const ecritures = []
  const pile = []
  let etat = { ctm: [1, 0, 0, 1, 0, 0], fill: [0, 0, 0], stroke: [0, 0, 0], taille: 1, hscale: 1, cs: 0, ws: 0, leading: 0, rise: 0, mode: 0 }
  let tm = [1, 0, 0, 1, 0, 0]
  let tlm = [1, 0, 0, 1, 0, 0]
  const ligneSuivante = () => { tlm = produit(tlm, translation(0, -etat.leading)); tm = tlm.slice() }
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const a = argsArray[i]
    switch (fn) {
      case OPS.save: pile.push(etat); etat = { ...etat }; break
      case OPS.restore: if (pile.length) etat = pile.pop(); break
      case OPS.transform: etat.ctm = produit(etat.ctm, a); break
      case OPS.paintFormXObjectBegin: pile.push(etat); etat = { ...etat }; if (a?.[0]) etat.ctm = produit(etat.ctm, a[0]); break
      case OPS.paintFormXObjectEnd: if (pile.length) etat = pile.pop(); break
      case OPS.setFillRGBColor: etat.fill = Array.from(a); break
      case OPS.setStrokeRGBColor: etat.stroke = Array.from(a); break
      case OPS.setFont: etat.taille = a[1]; break
      case OPS.setHScale: etat.hscale = a[0] / 100; break
      case OPS.setCharSpacing: etat.cs = a[0]; break
      case OPS.setWordSpacing: etat.ws = a[0]; break
      case OPS.setLeading: etat.leading = a[0]; break
      case OPS.setTextRise: etat.rise = a[0]; break
      case OPS.setTextRenderingMode: etat.mode = a[0]; break
      case OPS.beginText: tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break
      case OPS.setTextMatrix: tm = Array.from(a); tlm = tm.slice(); break
      case OPS.moveText: tlm = produit(tlm, translation(a[0], a[1])); tm = tlm.slice(); break
      case OPS.setLeadingMoveText: etat.leading = -a[1]; tlm = produit(tlm, translation(a[0], a[1])); tm = tlm.slice(); break
      case OPS.nextLine: ligneSuivante(); break
      case OPS.showText: case OPS.showSpacedText: case OPS.nextLineShowText: case OPS.nextLineSetSpacingShowText: {
        if (fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) ligneSuivante()
        const position = produit(etat.ctm, produit(tm, translation(0, etat.rise)))
        let avance = 0
        let visible = false
        for (const g of a?.[0] ?? []) {
          if (typeof g === 'number') { avance -= (g / 1000) * etat.taille * etat.hscale; continue }
          if (!g) continue
          avance += (((g.width ?? 0) / 1000) * etat.taille + etat.cs + (g.isSpace ? etat.ws : 0)) * etat.hscale
          if (String(g.unicode ?? '').trim()) visible = true
        }
        // Modes 1 et 5 : texte en contour, sa couleur est celle du trait
        const rgb = etat.mode === 1 || etat.mode === 5 ? etat.stroke : etat.fill
        if (visible) ecritures.push({ x: position[4], y: position[5], rgb })
        tm = produit(tm, translation(avance, 0))
        break
      }
      default: break
    }
  }
  return ecritures
}

// ─── Annotations d'une page ─────────────────────────────────────────────────

const TOLERANCE_ECRITURE = 2 // points : au-delà, l'écriture n'est pas celle du fragment

function couleurDuFragment(item, ecritures) {
  const [x, y] = [item.transform[4], item.transform[5]]
  let meilleure = null
  let distance = Infinity
  for (const e of ecritures) {
    const d = Math.hypot(e.x - x, e.y - y)
    if (d < distance) { distance = d; meilleure = e }
  }
  return meilleure && distance <= TOLERANCE_ECRITURE ? nomCouleur(meilleure.rgb) : ''
}

/**
 * Les fragments pdf.js d'une page → annotations en mm depuis le coin haut
 * gauche, comme l'extraction de référence : fragments d'une même ligne
 * rejoints, une couleur par ligne (celle du plus de caractères), puis lignes
 * d'un même bloc fusionnées par « / » (textes sur plusieurs lignes).
 * @param view `page.view` de pdf.js [x0, y0, x1, y1]
 */
export function annotationsDePage({ items = [], ecritures = [], view = [0, 0, 0, 0] }) {
  const fragments = items
    .filter((it) => it.str?.trim())
    .map((it) => {
      const x = (it.transform[4] - view[0]) * MM_PAR_POINT
      const base = (view[3] - it.transform[5]) * MM_PAR_POINT
      return {
        x, base, y: base - (it.height ?? 0) * MM_PAR_POINT,
        fin: x + (it.width ?? 0) * MM_PAR_POINT,
        couleur: couleurDuFragment(it, ecritures), texte: it.str.trim(),
      }
    })
    .sort((a, b) => a.base - b.base || a.x - b.x)

  const lignes = []
  for (const f of fragments) {
    let ligne = null
    for (let i = lignes.length - 1; i >= 0 && Math.abs(lignes[i].base - f.base) <= 0.8; i--) {
      const l = lignes[i]
      if (f.x >= l.fin - 0.5 && f.x - l.fin <= 3) { ligne = l; break }
    }
    if (ligne) {
      ligne.texte += (f.x - ligne.fin > 0.3 ? ' ' : '') + f.texte
      ligne.fin = Math.max(ligne.fin, f.fin)
      ligne.y = Math.min(ligne.y, f.y)
    } else {
      ligne = { x: f.x, y: f.y, base: f.base, fin: f.fin, texte: f.texte, comptes: {} }
      lignes.push(ligne)
    }
    ligne.comptes[f.couleur] = (ligne.comptes[f.couleur] ?? 0) + f.texte.length
  }

  const arrondies = lignes
    .map((l) => ({
      x: Math.round(l.x), y: Math.round(l.y), texte: l.texte,
      couleur: Object.entries(l.comptes).sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const blocs = []
  for (const l of arrondies) {
    const cible = blocs.slice(-20).reverse().find((b) => b.couleur === l.couleur
      && l.y - b.dernierY > 0 && l.y - b.dernierY <= 6 && Math.abs(l.x - b.x) <= 12)
    if (cible) { cible.texte += ` / ${l.texte}`; cible.dernierY = l.y } else blocs.push({ ...l, dernierY: l.y })
  }
  return blocs.map(({ x, y, couleur, texte }) => ({ x, y, couleur, texte }))
}

/** Le texte d'un plan tel qu'il part dans « 3 - Plans (texte).md ». */
export function textePlan({ titre, pages = [] }) {
  const lignes = [`=== ${titre} ===`]
  pages.forEach((p, i) => {
    lignes.push(`--- page ${i + 1} : ${p.largeur}×${p.hauteur} mm, (x,y) en mm depuis le coin haut gauche ---`)
    if (!p.annotations.length) lignes.push('(aucun texte lisible sur cette page : plan scanné ou texte vectorisé, voir le PDF)')
    for (const a of p.annotations) lignes.push(`(${a.x},${a.y})${a.couleur ? ` [${a.couleur}]` : ''} ${a.texte}`)
  })
  return lignes.join('\n')
}
```

- [ ] **Étape 4 : vérifier qu'ils passent**

Run : `node --import ./tests/resolve-src.mjs --test tests/dossier-claude.test.js`
Attendu : tout passe. Si le test « même ligne » échoue sur l'espace, revoir le seuil de 0,3 mm. Le résultat attendu est `Séjour/ 21,07 m2` : le « / » suit à 0,2 mm (pas d'espace), « 21,07 » à 0,8 mm (une espace).

- [ ] **Étape 5 : contrôler sur les plans de l'essai (hors dépôt)**

Écrire `<scratchpad>/couleurs/controle-app.mjs`. Il lit les 26 plans de `/Users/VictorGuyon/Desktop/PERSO/Essai analyse plans/` avec `pdfjs-dist/legacy/build/pdf.js` (résolu depuis le `package.json` du dépôt, comme `extraction.mjs`), puis il applique `ecrituresColorees` (avec `pdfjs.OPS`), `annotationsDePage` et `textePlan` importés du dépôt. Il compare à `<scratchpad>/coligny/NN.plan.txt` avec la même méthode que `comparer.mjs` : chaque morceau « / » de la référence est cherché parmi les annotations de l'app.

Attendu :
- au moins 95 % des morceaux retrouvés ;
- au moins 95 % de couleurs identiques parmi eux.

Noter les chiffres pour le compte rendu. Le texte d'un plan doit garder une taille voisine de la référence (60 000 caractères pour les 26 plans, à ±30 %).

- [ ] **Étape 6 : commit**

```bash
git add src/modules/etude/pieces-ecrites/dossierClaudeLogique.js tests/dossier-claude.test.js
git commit -m "feat: dossier pour Claude — couleur et position des annotations d'un plan"
git push
```

---

### Tâche 2 : contenu du dossier et consignes (logique pure)

**Files :**
- Modify: `src/modules/etude/pieces-ecrites/dossierClaudeLogique.js`
- Create: `src/modules/etude/pieces-ecrites/consignesConformite.md` (copie de `/Users/VictorGuyon/Desktop/PERSO/Essai analyse plans/Consignes du projet Claude.md`, qui commence par `Version des consignes : 2`)
- Test: `tests/dossier-claude.test.js`

**Interfaces :**
- Consumes : `recomposerTexte(texte)` (`piecesLogique.js`), `numeroLot(lot)`, `libelleNumeroLot(lot)` (`src/shared/lots/numeroLot.js`)
- Produces :
  - constantes `VERSION_CONSIGNES = 2`, `PROJET_CLAUDE_CONFORMITE`, `LIMITE_PDF_CLAUDE = 30 * 1024 * 1024`, `FICHIERS_DOSSIER = { sommaire, cctp, plans, pdf }` (noms des 4 fichiers)
  - `estCctpCommun(piece) → bool`
  - `ordonnerPieces(pieces, lots) → pieces` : CCTP commun d'abord, puis par numéro de lot
  - `libellePiece(piece, lots) → string`
  - `lotsSansCctp(lots, pieces) → lots`
  - `numeroPlan(nomFichier) → string|null`, `titrePlan(nomFichier) → string`, `ordonnerPlans(plans) → plans` (champ `nomFichier`)
  - `intituleAffaire(affaire) → string`, `messageClaude(affaire) → string`, `nomDossier(affaire) → string`
  - `sommaireMarkdown({ affaire, pieces, lots, plans, date }) → string`, avec `plans: [{ nomFichier, largeur, hauteur, nbPages, sansTexte }]` dans l'ordre final
  - `cctpMarkdown({ affaire, pieces, articles, lots }) → string`
  - `plansMarkdown({ affaire, textes }) → string`, avec `textes` = les `textePlan` dans l'ordre

- [ ] **Étape 1 : copier les consignes**

```bash
cp "/Users/VictorGuyon/Desktop/PERSO/Essai analyse plans/Consignes du projet Claude.md" src/modules/etude/pieces-ecrites/consignesConformite.md
grep -n -i "coligny\|semcoda\|2618\|cosinus\|iltec" src/modules/etude/pieces-ecrites/consignesConformite.md
```

Attendu : la recherche ne trouve rien. Les consignes ne doivent contenir aucune donnée réelle.

- [ ] **Étape 2 : écrire les tests qui échouent** (ajouter à `tests/dossier-claude.test.js`)

```js
import { readFileSync } from 'node:fs'
import {
  VERSION_CONSIGNES, FICHIERS_DOSSIER, estCctpCommun, ordonnerPieces, libellePiece, lotsSansCctp,
  numeroPlan, titrePlan, ordonnerPlans, intituleAffaire, messageClaude, nomDossier,
  sommaireMarkdown, cctpMarkdown, plansMarkdown,
} from '../src/modules/etude/pieces-ecrites/dossierClaudeLogique.js'

const affaire = { code_affaire: '9901-ESS', nom: 'Réhabilitation de 4 maisons', projet_commune: 'Villeneuve', projet_code_postal: '01000', moa_nom: 'Office exemple', phase: 'DCE' }
const lots = [
  { id: 'l2', numero: 80, numero_affiche: '080', nom: 'Menuiseries extérieures' },
  { id: 'l1', numero: 60, numero_affiche: '060', nom: 'Couverture' },
  { id: 'l3', numero: 140, numero_affiche: null, nom: 'Peinture' },
]
const pieces = [
  { id: 'p2', lot_id: 'l2', titre: 'Lot 080 — Menuiseries extérieures', nom_fichier: 'CCTP 080.pdf', indice: 'B', nb_pages: 12, nb_articles: 2 },
  { id: 'p0', lot_id: null, titre: 'CCTPC', nom_fichier: 'Exemple - CCTPC.pdf', indice: null, nb_pages: 9, nb_articles: 1 },
  { id: 'p1', lot_id: 'l1', titre: 'Lot 060 — Couverture', nom_fichier: 'CCTP 060.pdf', indice: null, nb_pages: 8, nb_articles: 1 },
]

describe('consignes', () => {
  test('la version du fichier est celle du code', () => {
    const md = readFileSync(new URL('../src/modules/etude/pieces-ecrites/consignesConformite.md', import.meta.url), 'utf8')
    assert.equal(md.split('\n')[0], `Version des consignes : ${VERSION_CONSIGNES}`)
  })
})

describe('pièces et plans', () => {
  test('le CCTP commun vient en tête, puis les lots par numéro', () => {
    assert.equal(estCctpCommun(pieces[1]), true)
    assert.equal(estCctpCommun(pieces[0]), false)
    assert.deepEqual(ordonnerPieces(pieces, lots).map((p) => p.id), ['p0', 'p1', 'p2'])
    assert.equal(libellePiece(pieces[1], lots), 'CCTP commun')
    assert.equal(libellePiece(pieces[0], lots), 'Lot 080 — Menuiseries extérieures')
  })

  test('un CCTP dont le titre dit « commun » est commun même rattaché', () => {
    assert.equal(estCctpCommun({ lot_id: 'l9', titre: 'CCTP commun à tous les lots', nom_fichier: 'x.pdf' }), true)
  })

  test('lots sans CCTP', () => {
    assert.deepEqual(lotsSansCctp(lots, pieces).map((l) => l.id), ['l3'])
  })

  test('les plans se rangent par leur numéro en tête du nom', () => {
    assert.equal(numeroPlan('40 RDC.pdf'), '40')
    assert.equal(numeroPlan('Plan de masse.pdf'), null)
    assert.equal(titrePlan('40 RDC.PDF'), '40 RDC')
    const ordre = ordonnerPlans([{ nomFichier: '100 Détail.pdf' }, { nomFichier: 'Notice.pdf' }, { nomFichier: '9 Masse.pdf' }, { nomFichier: '40 RDC.pdf' }])
    assert.deepEqual(ordre.map((p) => p.nomFichier), ['9 Masse.pdf', '40 RDC.pdf', '100 Détail.pdf', 'Notice.pdf'])
  })
})

describe('message et nom', () => {
  test('le message commence par le code de l’affaire (titre de la conversation)', () => {
    assert.equal(messageClaude(affaire), '9901-ESS — Réhabilitation de 4 maisons — Rapport complet')
    assert.equal(messageClaude({ nom: 'Sans code' }), 'Sans code — Rapport complet')
  })
  test('nom du ZIP sans caractère interdit', () => {
    assert.equal(nomDossier(affaire), 'Dossier Claude - 9901-ESS')
    assert.equal(nomDossier({ nom: 'A/B: test' }), 'Dossier Claude - A-B- test')
  })
  test('intitulé de l’affaire', () => {
    assert.equal(intituleAffaire(affaire), '9901-ESS — Réhabilitation de 4 maisons — Villeneuve (01000) — maître d’ouvrage : Office exemple — phase DCE')
  })
})

describe('fichiers du dossier', () => {
  test('sommaire : version, CCTP, plans, lots sans CCTP, pièces non fournies', () => {
    const md = sommaireMarkdown({
      affaire, pieces, lots, date: '2026-10-08',
      plans: [{ nomFichier: '40 RDC.pdf', largeur: 420, hauteur: 297, nbPages: 1, sansTexte: false }, { nomFichier: '41 Scan.pdf', largeur: 594, hauteur: 420, nbPages: 2, sansTexte: true }],
    })
    assert.match(md, /Version des consignes attendue : 2/)
    assert.match(md, /\| CCTP commun \| Exemple - CCTPC\.pdf \| — \| 9 \| 1 \|/)
    assert.match(md, /\| Lot 080 — Menuiseries extérieures \| CCTP 080\.pdf \| B \| 12 \| 2 \|/)
    assert.match(md, /\| 40 \| 40 RDC \| 420×297 \| 1 \|/)
    assert.match(md, /\| 41 \| 41 Scan \(sans texte lisible\) \| 594×420 \| 2 à 3 \|/)
    assert.match(md, /Lot 140 — Peinture/)
    assert.match(md, /DPGF/)
    assert.ok(md.indexOf('CCTP commun') < md.indexOf('Lot 060'))
  })

  test('CCTP : en-tête par pièce, articles numérotés avec leur page, phrases recollées', () => {
    const articles = [
      { piece_id: 'p2', ordre: 2, numero: '5.1', titre: 'FENÊTRES', page: 4, texte: 'Fourniture et pose\nde fenêtres PVC.' },
      { piece_id: 'p2', ordre: 1, numero: '1', titre: 'OBJET', page: 3, texte: 'Texte.' },
      { piece_id: 'p0', ordre: 1, numero: null, titre: 'Page 2', page: 2, texte: 'Généralités.' },
    ]
    const md = cctpMarkdown({ affaire, pieces, articles, lots })
    assert.ok(md.indexOf('## CCTP COMMUN') < md.indexOf('## LOT 080'))
    assert.match(md, /Fichier : CCTP 080\.pdf · indice : B · 12 pages · 2 articles/)
    assert.ok(md.indexOf('§1 OBJET [p.3]') < md.indexOf('§5.1 FENÊTRES [p.4]'))
    assert.match(md, /Fourniture et pose de fenêtres PVC\./)
    assert.match(md, /\nPage 2 \[p\.2\]\n/)
  })

  test('plans : mode d’emploi puis les textes dans l’ordre', () => {
    const md = plansMarkdown({ affaire, textes: ['=== 40 RDC ===\n(1,2) A', '=== 41 R+1 ===\n(3,4) B'] })
    assert.match(md, /coin HAUT GAUCHE/)
    assert.ok(md.indexOf('=== 40 RDC ===') < md.indexOf('=== 41 R+1 ==='))
  })

  test('les quatre noms de fichiers', () => {
    assert.deepEqual(Object.values(FICHIERS_DOSSIER), ['1 - Sommaire.md', '2 - CCTP.md', '3 - Plans (texte).md', '4 - Plans.pdf'])
  })
})
```

- [ ] **Étape 3 : vérifier qu'ils échouent**

Run : `node --import ./tests/resolve-src.mjs --test tests/dossier-claude.test.js`
Attendu : ÉCHEC, exports manquants.

- [ ] **Étape 4 : écrire la logique** (ajouter à `dossierClaudeLogique.js`)

En tête du fichier :

```js
import { recomposerTexte } from './piecesLogique'
import { numeroLot, libelleNumeroLot } from '../../../shared/lots/numeroLot'

/** Projet claude.ai de l'agence (Team) : sans le compte de l'agence, l'adresse n'ouvre rien. */
export const PROJET_CLAUDE_CONFORMITE = 'https://claude.ai/project/019e0285-ad37-7277-9c8f-e7e6367140c6'
/** Doit suivre la première ligne de `consignesConformite.md` (vérifié par les tests). */
export const VERSION_CONSIGNES = 2
/** Taille maximale d'un fichier déposé dans claude.ai. */
export const LIMITE_PDF_CLAUDE = 30 * 1024 * 1024
export const FICHIERS_DOSSIER = {
  sommaire: '1 - Sommaire.md', cctp: '2 - CCTP.md', plans: '3 - Plans (texte).md', pdf: '4 - Plans.pdf',
}
```

Après `textePlan` :

```js
// ─── Pièces et plans ────────────────────────────────────────────────────────

export function estCctpCommun(piece) {
  return !piece?.lot_id || /\bcctpc\b|commun/i.test(`${piece?.titre ?? ''} ${piece?.nom_fichier ?? ''}`)
}

const lotDe = (piece, lots) => lots.find((l) => l.id === piece.lot_id) ?? null

export function libellePiece(piece, lots = []) {
  if (estCctpCommun(piece)) return 'CCTP commun'
  const lot = lotDe(piece, lots)
  return lot ? libelleNumeroLot(lot) : piece.titre
}

export function ordonnerPieces(pieces = [], lots = []) {
  const rang = (p) => (estCctpCommun(p) ? -1 : lotDe(p, lots)?.numero ?? p.lot_numero_lu ?? Number.MAX_SAFE_INTEGER)
  return [...pieces].sort((a, b) => rang(a) - rang(b) || String(a.titre).localeCompare(String(b.titre), 'fr'))
}

export function lotsSansCctp(lots = [], pieces = []) {
  const avecCctp = new Set(pieces.map((p) => p.lot_id).filter(Boolean))
  return lots.filter((l) => !avecCctp.has(l.id)).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
}

export function numeroPlan(nomFichier = '') {
  return nomFichier.match(/^\s*(\d+)/)?.[1] ?? null
}

export function titrePlan(nomFichier = '') {
  return nomFichier.replace(/\.pdf$/i, '').trim()
}

/** Par le numéro en tête du nom (00, 30, 40…), puis par nom ; les plans sans numéro à la fin. */
export function ordonnerPlans(plans = []) {
  const rang = (p) => { const n = numeroPlan(p.nomFichier); return n == null ? Number.MAX_SAFE_INTEGER : Number(n) }
  return [...plans].sort((a, b) => rang(a) - rang(b) || a.nomFichier.localeCompare(b.nomFichier, 'fr', { numeric: true }))
}

// ─── Affaire ────────────────────────────────────────────────────────────────

export function intituleAffaire(a = {}) {
  const lieu = [a.projet_commune, a.projet_code_postal && `(${a.projet_code_postal})`].filter(Boolean).join(' ')
  return [a.code_affaire, a.nom, lieu, a.moa_nom && `maître d’ouvrage : ${a.moa_nom}`, a.phase && `phase ${a.phase}`]
    .filter(Boolean).join(' — ')
}

/**
 * Le premier message de la conversation. claude.ai titre une conversation
 * d'après lui : le code de l'affaire en tête la fait retrouver dans la liste
 * des conversations du projet.
 */
export function messageClaude(a = {}) {
  return [a.code_affaire, a.nom, 'Rapport complet'].filter(Boolean).join(' — ')
}

export function nomDossier(a = {}) {
  return `Dossier Claude - ${(a.code_affaire || a.nom || 'affaire').replace(/[/\\:*?"<>|]/g, '-')}`
}

// ─── Les trois fichiers texte ───────────────────────────────────────────────

const cellule = (v) => String(v ?? '—').replace(/\|/g, '/') || '—'

export function sommaireMarkdown({ affaire = {}, pieces = [], lots = [], plans = [], date }) {
  const l = [
    '# Sommaire du dossier', '',
    `**Affaire** : ${intituleAffaire(affaire)}`,
    `**Dossier préparé le** : ${date}`,
    `**Version des consignes attendue : ${VERSION_CONSIGNES}**`, '',
    '## Fichiers du dossier',
    `1. ${FICHIERS_DOSSIER.sommaire} — ce fichier`,
    `2. ${FICHIERS_DOSSIER.cctp} — les ${pieces.length} CCTP, article par article`,
    `3. ${FICHIERS_DOSSIER.plans} — les annotations des ${plans.length} plans, avec position et couleur`,
    `4. ${FICHIERS_DOSSIER.pdf} — les ${plans.length} plans d'origine, dans l'ordre ci-dessous`, '',
    '## CCTP fournis',
    '| Pièce | Fichier d\'origine | Indice | Pages | Articles |', '|---|---|---|---|---|',
    ...ordonnerPieces(pieces, lots).map((p) => `| ${cellule(libellePiece(p, lots))} | ${cellule(p.nom_fichier)} | ${cellule(p.indice)} | ${p.nb_pages ?? '—'} | ${p.nb_articles ?? '—'} |`),
    '',
    '## Plans fournis',
    '| N° | Titre | Format (mm) | Page(s) dans « 4 - Plans.pdf » |', '|---|---|---|---|',
  ]
  let page = 1
  for (const p of plans) {
    const pages = p.nbPages > 1 ? `${page} à ${page + p.nbPages - 1}` : `${page}`
    l.push(`| ${cellule(numeroPlan(p.nomFichier))} | ${cellule(titrePlan(p.nomFichier))}${p.sansTexte ? ' (sans texte lisible)' : ''} | ${p.largeur}×${p.hauteur} | ${pages} |`)
    page += p.nbPages
  }
  const manquants = lotsSansCctp(lots, pieces)
  l.push('', '## Lots de l\'affaire sans CCTP au dossier')
  l.push(...(manquants.length ? manquants.map((lot) => `- ${libelleNumeroLot(lot)}`) : ['Aucun.']))
  l.push('', '## Pièces non fournies',
    'L\'application ne fournit que les CCTP et les plans. Ne sont pas au dossier : DPGF / cadres de décomposition du prix, CCAP, acte d\'engagement, règlement de consultation, rapports de diagnostic (amiante, plomb…), notes de calcul. Si un CCTP y renvoie, le signaler.')
  return `${l.join('\n')}\n`
}

export function cctpMarkdown({ affaire = {}, pieces = [], articles = [], lots = [] }) {
  const parties = [`# CCTP — ${intituleAffaire(affaire)}`, '',
    'Texte des CCTP importés dans l\'application, découpé en articles. Chaque article : « §numéro TITRE [p.page du PDF] », puis son texte.']
  for (const p of ordonnerPieces(pieces, lots)) {
    const lot = lotDe(p, lots)
    const titre = estCctpCommun(p) ? 'CCTP COMMUN' : (lot ? `LOT ${numeroLot(lot)} — ${lot.nom}` : p.titre).toUpperCase()
    parties.push('', '='.repeat(70), `## ${titre}`,
      `Fichier : ${p.nom_fichier ?? '—'} · indice : ${p.indice ?? 'non lu'} · ${p.nb_pages ?? '?'} pages · ${p.nb_articles ?? '?'} articles`,
      '='.repeat(70))
    const siens = articles.filter((a) => a.piece_id === p.id).sort((a, b) => a.ordre - b.ordre)
    for (const a of siens) {
      parties.push('', `${a.numero ? `§${a.numero} ` : ''}${a.titre}${a.page ? ` [p.${a.page}]` : ''}`)
      // L'espace sans largeur d'une césure recollée n'a rien à faire chez Claude
      const texte = recomposerTexte(a.texte ?? '').replace(/​/g, '').trim()
      if (texte) parties.push(texte)
    }
  }
  return `${parties.join('\n')}\n`
}

export function plansMarkdown({ affaire = {}, textes = [] }) {
  return `${[
    `# Plans en texte — ${intituleAffaire(affaire)}`, '',
    'Toutes les annotations de chaque plan, relevées dans le PDF avec leur position et leur couleur.',
    '- Position (x,y) en mm depuis le coin HAUT GAUCHE de la planche (format donné en tête de chaque page).',
    '- Couleur entre crochets quand le texte n\'est pas noir : [rouge], [bleu], [vert], [orange], [magenta]. Le sens des couleurs est donné par la légende du plan quand il y en a une (sinon, en général : rouge = démolition / désordres, bleu = cotes, vert = repères et ouvrages projetés).',
    '- Les textes écrits sur plusieurs lignes sont joints par « / ». Les lignes sont classées de haut en bas.',
    `- Les PDF d'origine sont dans « ${FICHIERS_DOSSIER.pdf} », dans le même ordre (voir le sommaire pour les numéros de page).`,
    ...textes.flatMap((t) => ['', t]),
  ].join('\n')}\n`
}
```

`recomposerTexte` recolle une césure par `​` (`piecesLogique.js:327`) : c'est ce caractère que `cctpMarkdown` retire.

- [ ] **Étape 5 : vérifier qu'ils passent**

Run : `node --import ./tests/resolve-src.mjs --test tests/dossier-claude.test.js`
Attendu : tout passe.

- [ ] **Étape 6 : commit**

```bash
git add src/modules/etude/pieces-ecrites/dossierClaudeLogique.js src/modules/etude/pieces-ecrites/consignesConformite.md tests/dossier-claude.test.js
git commit -m "feat: dossier pour Claude — sommaire, CCTP, texte des plans et consignes"
git push
```

---

### Tâche 3 : fabrication du dossier dans le navigateur

**Files :**
- Create: `src/modules/etude/pieces-ecrites/dossierClaude.js`

**Interfaces :**
- Consumes : tout ce que les tâches 1 et 2 produisent
- Produces :
  - `lirePlan(fichier) → Promise<{ nomFichier, octets: ArrayBuffer, nbPages, largeur, hauteur, sansTexte, texte }>`. `largeur` / `hauteur` sont en mm, page 1 ; `texte` est celui de `textePlan`.
  - `fabriquerDossier({ affaire, pieces, articles, lots, plans, surProgression }) → Promise<{ blob, nom, octetsPdf }>`. `plans` = résultats de `lirePlan`, déjà ordonnés ; `octetsPdf` = taille du PDF réuni.
  - `telecharger(blob, nom)`

- [ ] **Étape 1 : écrire le module**

```js
// ─── Dossier pour Claude : fabrication sur l'appareil ────────────────────────
//
// Les plans sont lus ici (pdf.js) et réunis (pdf-lib) ; rien ne part vers
// Supabase, dont le stockage est plafonné. Le contenu se décide dans
// `dossierClaudeLogique.js`.

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import {
  ecrituresColorees, annotationsDePage, textePlan, titrePlan,
  sommaireMarkdown, cctpMarkdown, plansMarkdown, nomDossier, FICHIERS_DOSSIER,
} from './dossierClaudeLogique'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MM_PAR_POINT = 25.4 / 72

export async function lirePlan(fichier) {
  const octets = await fichier.arrayBuffer()
  let doc
  try {
    // pdf.js transfère le tampon à son worker : il reçoit une copie, l'original sert à la réunion
    doc = await pdfjs.getDocument({ data: octets.slice(0) }).promise
  } catch {
    throw new Error('Ce PDF n’a pas pu être ouvert (fichier protégé ou endommagé ?).')
  }
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const [x0, y0, x1, y1] = page.view
    let ecritures = []
    try {
      const ops = await page.getOperatorList()
      ecritures = ecrituresColorees(ops.fnArray, ops.argsArray, pdfjs.OPS)
    } catch { /* couleurs perdues, positions et textes intacts */ }
    const contenu = await page.getTextContent()
    pages.push({
      largeur: Math.round((x1 - x0) * MM_PAR_POINT), hauteur: Math.round((y1 - y0) * MM_PAR_POINT),
      annotations: annotationsDePage({ items: contenu.items, ecritures, view: page.view }),
    })
    page.cleanup?.()
  }
  doc.destroy?.()
  return {
    nomFichier: fichier.name, octets, nbPages: pages.length,
    largeur: pages[0]?.largeur ?? 0, hauteur: pages[0]?.hauteur ?? 0,
    sansTexte: pages.every((p) => p.annotations.length === 0),
    texte: textePlan({ titre: titrePlan(fichier.name), pages }),
  }
}

async function reunirPdf(plans, surProgression) {
  const { PDFDocument } = await import('pdf-lib')
  const reuni = await PDFDocument.create()
  for (let i = 0; i < plans.length; i++) {
    const source = await PDFDocument.load(plans[i].octets, { ignoreEncryption: true })
    const pages = await reuni.copyPages(source, source.getPageIndices())
    pages.forEach((p) => reuni.addPage(p))
    surProgression?.((i + 1) / plans.length)
  }
  return reuni.save()
}

export async function fabriquerDossier({ affaire, pieces, articles, lots, plans, surProgression }) {
  const pdf = await reunirPdf(plans, surProgression)
  const { zipSync, strToU8 } = await import('fflate')
  const date = new Date().toLocaleDateString('fr-FR')
  const contenu = {
    [FICHIERS_DOSSIER.sommaire]: strToU8(sommaireMarkdown({ affaire, pieces, lots, plans, date })),
    [FICHIERS_DOSSIER.cctp]: strToU8(cctpMarkdown({ affaire, pieces, articles, lots })),
    [FICHIERS_DOSSIER.plans]: strToU8(plansMarkdown({ affaire, textes: plans.map((p) => p.texte) })),
    // Un PDF est déjà compressé : le recompresser ne ferait que perdre du temps
    [FICHIERS_DOSSIER.pdf]: [pdf, { level: 0 }],
  }
  const nom = nomDossier(affaire)
  // Les fichiers rangés dans un dossier du même nom : décompressé, il se retrouve d'un coup d'œil
  const range = Object.fromEntries(Object.entries(contenu).map(([k, v]) => [`${nom}/${k}`, v]))
  return { blob: new Blob([zipSync(range)], { type: 'application/zip' }), nom: `${nom}.zip`, octetsPdf: pdf.byteLength }
}

export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
```

- [ ] **Étape 2 : vérifier la compilation**

Run : `npm run build`
Attendu : le build passe. Le module n'est encore importé par personne ; la tâche 4 le branche.

- [ ] **Étape 3 : commit**

```bash
git add src/modules/etude/pieces-ecrites/dossierClaude.js
git commit -m "feat: dossier pour Claude — lecture des plans, PDF réuni et ZIP sur l'appareil"
git push
```

---

### Tâche 4 : la fenêtre et le bouton

**Files :**
- Create: `src/modules/etude/pieces-ecrites/DossierClaude.jsx`
- Modify: `src/modules/etude/pieces-ecrites/index.jsx` (bouton à côté de « Importer des CCTP », état `dossierOuvert`, `useAffaire`)

**Interfaces :**
- Consumes :
  - `lirePlan`, `fabriquerDossier`, `telecharger` (tâche 3) ;
  - `ordonnerPieces`, `libellePiece`, `lotsSansCctp`, `ordonnerPlans`, `messageClaude`, `PROJET_CLAUDE_CONFORMITE`, `VERSION_CONSIGNES`, `LIMITE_PDF_CLAUDE` (tâches 1 et 2) ;
  - `useAffaire(id) → { affaire }` (`src/shared/hooks/useAffaires.js`).
- Produces : `<DossierClaude affaire pieces articles lots onFermer />`

- [ ] **Étape 1 : écrire la fenêtre**

```jsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, Check, Copy, ExternalLink, AlertTriangle, FileText } from 'lucide-react'
import consignes from './consignesConformite.md?raw'
import { lirePlan, fabriquerDossier, telecharger } from './dossierClaude'
import { estPdf } from './lecturePdf'
import {
  ordonnerPieces, libellePiece, lotsSansCctp, ordonnerPlans, messageClaude,
  PROJET_CLAUDE_CONFORMITE, VERSION_CONSIGNES, LIMITE_PDF_CLAUDE,
} from './dossierClaudeLogique'

// ─── Préparer le dossier pour Claude ─────────────────────────────────────────
//
// Les CCTP de l'affaire + les plans déposés ici → un ZIP à glisser dans le
// projet claude.ai de l'agence, où se fait l'analyse de conformité. Les plans
// sont lus sur l'appareil et ne sont gardés nulle part.

const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', borderRadius: 3, fontSize: 13, cursor: 'pointer' }
const boutonPrincipal = { ...bouton, border: 'none', background: '#E8602C', color: 'white', fontWeight: 600 }
const mo = (octets) => `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`

function BoutonCopier({ texte, libelle }) {
  const [etat, setEtat] = useState(null)
  return (
    <button type="button" style={bouton} onClick={async () => {
      try { await navigator.clipboard.writeText(texte); setEtat('ok') } catch { setEtat('echec') }
    }}>
      {etat === 'ok' ? <Check size={15} color="#2A8A4E" /> : <Copy size={15} />}
      {etat === 'ok' ? 'Copié' : etat === 'echec' ? 'Copie impossible : sélectionnez le texte' : libelle}
    </button>
  )
}

export function DossierClaude({ affaire, pieces, articles, lots, onFermer }) {
  const [plans, setPlans] = useState([]) // { id, fichier, etat: 'lecture'|'pret'|'erreur', lu, erreur }
  const [fabrication, setFabrication] = useState(null) // null | { progression } | { fini: { nom, octetsPdf } }
  const [erreur, setErreur] = useState(null)
  const champFichiers = useRef(null)
  const identifiant = useRef(0)
  const enCours = fabrication && !fabrication.fini

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onFermer() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onFermer, enCours])

  const majPlan = (id, changement) => setPlans((liste) => liste.map((p) => (p.id === id ? { ...p, ...changement } : p)))

  const ajouter = async (fichiers) => {
    setFabrication(null)
    for (const fichier of [...fichiers].filter(estPdf)) {
      const id = ++identifiant.current
      setPlans((liste) => [...liste, { id, fichier, etat: 'lecture' }])
      try {
        majPlan(id, { etat: 'pret', lu: await lirePlan(fichier) })
      } catch (err) {
        majPlan(id, { etat: 'erreur', erreur: err?.message ?? String(err) })
      }
    }
  }

  const prets = ordonnerPlans(plans.filter((p) => p.etat === 'pret').map((p) => ({ ...p, nomFichier: p.fichier.name })))
  const lecture = plans.some((p) => p.etat === 'lecture')
  const sansCctp = lotsSansCctp(lots, pieces)

  const fabriquer = async () => {
    setErreur(null)
    setFabrication({ progression: 0 })
    try {
      const { blob, nom, octetsPdf } = await fabriquerDossier({
        affaire, pieces, articles, lots, plans: prets.map((p) => p.lu),
        surProgression: (progression) => setFabrication({ progression }),
      })
      telecharger(blob, nom)
      setFabrication({ fini: { nom, octetsPdf } })
    } catch (err) {
      setFabrication(null)
      setErreur(`Le dossier n’a pas pu être fabriqué : ${err?.message ?? err}`)
    }
  }

  const message = messageClaude(affaire ?? {})

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(32px + env(safe-area-inset-top)) 16px 32px', overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label="Préparer le dossier pour Claude"
        style={{ background: '#FAF7F2', width: '100%', maxWidth: 720, borderTop: '3px solid #E8602C', boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Préparer le dossier pour Claude</h2>
          <button type="button" onClick={onFermer} disabled={enCours} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fabrication?.fini ? (
            <>
              <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#2A8A4E' }}>
                <Check size={18} /> Le dossier est prêt : {fabrication.fini.nom}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#1F1B17', lineHeight: 1.55 }}>
                Ouvrez le projet Claude, démarrez une nouvelle conversation, glissez-y les quatre fichiers du dossier (décompressé : double-cliquez sur le ZIP dans vos Téléchargements) et collez le message ci-dessous. Si Claude s’arrête en cours de route, écrivez « Continue ».
              </p>
              <div style={{ background: 'white', border: '0.5px solid rgba(0,0,0,0.12)', padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#1F1B17', userSelect: 'all' }}>{message}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <BoutonCopier texte={message} libelle="Copier le message" />
                <a href={PROJET_CLAUDE_CONFORMITE} target="_blank" rel="noreferrer" style={{ ...boutonPrincipal, textDecoration: 'none' }}>
                  <ExternalLink size={15} /> Ouvrir le projet Claude
                </a>
              </div>
              {fabrication.fini.octetsPdf > LIMITE_PDF_CLAUDE && (
                <p role="alert" style={{ margin: 0, display: 'flex', gap: 6, fontSize: 12, color: '#92400E' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Les plans réunis pèsent {mo(fabrication.fini.octetsPdf)} : claude.ai refuse un fichier de plus de 30 Mo. Allégez les plans avec l’Aplatisseur de plan (« alléger en gardant le vectoriel »), ou déposez seulement les trois fichiers texte.
                </p>
              )}
            </>
          ) : (
            <>
              <section>
                <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#1F1B17' }}>CCTP de l’affaire ({pieces.length})</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5E5854' }}>
                  {ordonnerPieces(pieces, lots).map((p) => (
                    <li key={p.id}>{libellePiece(p, lots)} — {p.nb_articles} articles{p.indice ? ` · indice ${p.indice}` : ''}</li>
                  ))}
                </ul>
                {sansCctp.length > 0 && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#92400E' }}>
                    Lots sans CCTP : {sansCctp.map((l) => l.nom).join(', ')}. Importez-les d’abord si l’analyse doit les couvrir.
                  </p>
                )}
              </section>

              <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); ajouter(e.dataTransfer.files) }}
                style={{ border: '1px dashed rgba(0,0,0,0.25)', background: 'white', padding: '18px 16px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#5E5854' }}>
                  Déposez ici les plans en PDF (plusieurs à la fois), ou
                </p>
                <button type="button" onClick={() => champFichiers.current?.click()} disabled={enCours} style={bouton}>
                  <Upload size={15} /> Choisir des fichiers
                </button>
                <input ref={champFichiers} type="file" accept="application/pdf,.pdf" multiple style={{ display: 'none' }}
                  onChange={(e) => { ajouter(e.target.files); e.target.value = '' }} />
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9C9591' }}>
                  Les plans sont lus sur cet ordinateur et ne sont gardés nulle part. Nommez-les par leur numéro (« 40 RDC.pdf ») : ils sont rangés dans cet ordre.
                </p>
              </div>

              {plans.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ordonnerPlans(plans.map((p) => ({ ...p, nomFichier: p.fichier.name }))).map((p) => (
                    <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '6px 10px', fontSize: 12 }}>
                      <FileText size={14} color="#9C9591" />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fichier.name}</span>
                      {p.etat === 'lecture' && <span style={{ color: '#9C9591' }}>Lecture…</span>}
                      {p.etat === 'pret' && <span style={{ color: p.lu.sansTexte ? '#92400E' : '#2A8A4E' }}>{p.lu.sansTexte ? 'Aucun texte lisible (scan ?)' : `${p.lu.nbPages} p.`}</span>}
                      {p.etat === 'erreur' && <span role="alert" style={{ color: '#B8412C' }}>{p.erreur}</span>}
                      {!enCours && (
                        <button type="button" onClick={() => setPlans((liste) => liste.filter((x) => x.id !== p.id))} aria-label={`Retirer ${p.fichier.name}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 2 }}><X size={14} /></button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {enCours && <p style={{ margin: 0, fontSize: 12, color: '#5E5854' }}>Fabrication du dossier… {Math.round(fabrication.progression * 100)} %</p>}
            </>
          )}
          {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>{erreur}</p>}

          <details style={{ fontSize: 12, color: '#5E5854' }}>
            <summary style={{ cursor: 'pointer' }}>Consignes du projet Claude (version {VERSION_CONSIGNES})</summary>
            <p style={{ margin: '8px 0' }}>À coller une fois dans les instructions du projet, et de nouveau quand la version change (Claude le signale).</p>
            <BoutonCopier texte={consignes} libelle="Copier les consignes" />
            <pre style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', padding: 10, fontSize: 11 }}>{consignes}</pre>
          </details>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={bouton}>{fabrication?.fini ? 'Fermer' : 'Annuler'}</button>
          {!fabrication?.fini && (
            <button type="button" onClick={fabriquer} disabled={enCours || lecture || prets.length === 0}
              style={{ ...boutonPrincipal, opacity: enCours || lecture || prets.length === 0 ? 0.5 : 1 }}>
              {enCours ? 'Fabrication…' : 'Fabriquer le dossier'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Étape 2 : brancher le bouton dans `index.jsx`**

Ajouter les imports :

```jsx
import { FolderDown } from 'lucide-react'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { DossierClaude } from './DossierClaude'
```

`FolderDown` va dans l'import lucide existant (`Upload, Trash2, FileText, FolderDown`).

Dans le composant, après les autres `useState` :

```jsx
  const { affaire } = useAffaire(affaireId)
  const [dossierOuvert, setDossierOuvert] = useState(false)
```

Dans la barre (le `div` qui porte le compteur et « Importer des CCTP »), **avant** le bouton d'import. Le bouton reste visible en lecture seule, puisque rien n'est écrit :

```jsx
        {pieces.length > 0 && (
          <button type="button" onClick={() => setDossierOuvert(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#1F1B17', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <FolderDown size={15} /> Préparer le dossier pour Claude
          </button>
        )}
```

En fin de JSX, avant la confirmation de suppression :

```jsx
      {dossierOuvert && (
        <DossierClaude affaire={affaire} pieces={pieces} articles={articles} lots={lots} onFermer={() => setDossierOuvert(false)} />
      )}
```

- [ ] **Étape 3 : vérifier**

Run : `npm run build && npm test && npx eslint src 2>&1 | tail -3`
Attendu :
- le build passe ;
- tous les tests passent ;
- eslint ne dépasse pas les ~71 problèmes existants, et rien de nouveau dans `pieces-ecrites/`.

Si eslint signale `?raw`, ou si Vite refuse l'import d'un `.md` en `?raw`, vérifier que c'est bien `import consignes from './consignesConformite.md?raw'`. Vite le gère sans configuration.

- [ ] **Étape 4 : essai réel dans le navigateur** (`npm run dev`, Playwright)

1. Ouvrir une affaire qui a des CCTP, module Pièces écrites, puis « Préparer le dossier pour Claude ».
2. Déposer 3 plans de `/Users/VictorGuyon/Desktop/PERSO/Essai analyse plans/` (par `browser_file_upload`) et cliquer sur « Fabriquer le dossier ».
3. Contrôler :
   - le ZIP est téléchargé, avec les 4 fichiers dans un dossier ;
   - l'écran final affiche le message avec le code de l'affaire et le bouton du projet ;
   - le lien du projet a la bonne adresse et `target="_blank"` ;
   - les consignes se déplient et se copient.

Si aucune affaire de développement n'a de CCTP, importer d'abord un CCTP de l'essai par « Importer des CCTP ». Le retirer ensuite pour laisser la base comme elle était.

- [ ] **Étape 5 : commit**

```bash
git add src/modules/etude/pieces-ecrites/DossierClaude.jsx src/modules/etude/pieces-ecrites/index.jsx
git commit -m "feat: pièces écrites — préparer le dossier pour Claude (conformité plans / CCTP)"
git push
```

---

### Tâche 5 : contrôle sur l'affaire de l'essai et documentation

**Files :**
- Modify: `CLAUDE.md` (section « Pièces écrites » ; ligne `npm test` : nouveau total et « dossier pour Claude » dans la liste)

- [ ] **Étape 1 : comparer au dossier fait à la main** (hors dépôt)

Fabriquer, par un script node dans le scratchpad, le dossier de l'affaire de l'essai à partir des fonctions de la logique :
- CCTP : les textes `<scratchpad>/coligny/lot*.txt` et `cctp-commun.txt`, découpés en articles « §… [p.…] » ;
- plans : `textePlan` pour les 26 PDF.

Comparer à `/Users/VictorGuyon/Desktop/PERSO/Essai analyse plans/Dossier pour Claude - Coligny/` :
- même nombre d'articles par CCTP ;
- texte des plans de taille voisine (±30 %) ;
- couleurs : le résultat de la tâche 1, étape 5.

Noter les différences pour le compte rendu.

- [ ] **Étape 2 : documenter dans `CLAUDE.md`**

Ajouter à la fin de la section « Pièces écrites » :

```markdown
- **Dossier pour Claude** (conformité plans / CCTP, conception
  `docs/superpowers/specs/2026-10-08-dossier-claude-conformite-design.md`) :
  bouton « Préparer le dossier pour Claude » → ZIP de quatre fichiers
  (sommaire, CCTP article par article, texte des plans, plans réunis) à
  glisser dans le **projet claude.ai de l'agence** (Team,
  `PROJET_CLAUDE_CONFORMITE`), où se fait l'analyse : **aucun appel d'API**.
  Les plans sont lus sur l'appareil et gardés nulle part. Ce qui fait la
  qualité (constaté aux essais) : chaque annotation de plan avec sa
  **position en mm et sa couleur** — pdf.js ne donnant pas la couleur des
  fragments, `ecrituresColorees` la suit dans la liste d'opérations (matrices,
  avance des glyphes) et `annotationsDePage` rapproche chaque fragment de
  l'écriture la plus proche (2 pt), puis fusionne les lignes d'un bloc (même
  couleur, 6 mm, 12 mm, « / »). Tout est pur dans `dossierClaudeLogique.js`
  (testé) ; lecture, PDF réuni (pdf-lib) et ZIP dans `dossierClaude.js`. Les
  **consignes** du projet sont `consignesConformite.md` (copiées depuis la
  fenêtre) : changer leur texte oblige à monter `VERSION_CONSIGNES` (test) ;
  Claude signale un projet resté sur une ancienne version. Le message à coller
  commence par le code de l'affaire : claude.ai titre la conversation d'après
  lui.
```

Mettre à jour la ligne `npm test` des commandes avec le nouveau total, donné par `npm test 2>&1 | grep -E "^# tests"`.

- [ ] **Étape 3 : vérifier et commit**

```bash
npm run build && npm test
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — dossier pour Claude"
git push
```
