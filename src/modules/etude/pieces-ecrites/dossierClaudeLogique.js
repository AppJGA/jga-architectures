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

  // Un exposant (le « 2 » de m²) est écrit plus haut : trié avant son texte,
  // il formait une ligne à lui seul. Il rejoint la ligne qu'il prolonge.
  for (const e of lignes.filter((l) => l.texte.length <= 2)) {
    const porteuse = lignes.find((l) => l !== e && !l.absorbee && l.base - e.base > 0 && l.base - e.base <= 1.6 && Math.abs(e.x - l.fin) <= 0.6)
    if (!porteuse) continue
    porteuse.texte += e.texte
    porteuse.fin = Math.max(porteuse.fin, e.fin)
    for (const [c, n] of Object.entries(e.comptes)) porteuse.comptes[c] = (porteuse.comptes[c] ?? 0) + n
    e.absorbee = true
  }

  const arrondies = lignes
    .filter((l) => !l.absorbee)
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
