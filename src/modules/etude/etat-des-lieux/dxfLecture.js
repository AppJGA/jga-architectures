// ─── Lire un DXF texte, sur l'appareil ───────────────────────────────────────
//
// Rend traits et textes en coordonnées du dessin, blocs déployés : ArchiCAD
// range tout le plan dans des blocs de vues (un par étage et par sorte de
// dessin), le géomètre écrit directement dans l'espace objet. L'espace papier
// porte cadre et cartouche : on ne le lit que si l'espace objet est presque
// vide. Les cotes (DIMENSION), hachures et points sont laissés de côté : ils
// n'aident ni à reconnaître les pièces ni à lire le plan sur la tablette.

const SEGMENTS_CERCLE = 32
const PROFONDEUR_MAX = 12
const MIN_TRAITS_OBJET = 50

export function decoderDxf(octets) {
  const entete = new TextDecoder('latin1').decode(octets.slice(0, 4000))
  const version = entete.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d{4})/)
  const utf8 = version ? Number(version[1]) >= 1021 : true
  return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(octets)
}

function lirePaires(texte) {
  const lignes = texte.split(/\r?\n/)
  const paires = []
  for (let i = 0; i + 1 < lignes.length; i += 2) {
    const code = parseInt(lignes[i].trim(), 10)
    if (!Number.isNaN(code)) paires.push([code, lignes[i + 1].replace(/^\s+|\s+$/g, '')])
  }
  return paires
}

function lireSections(paires) {
  const sections = {}
  for (let i = 0; i < paires.length; i++) {
    if (paires[i][0] !== 0 || paires[i][1] !== 'SECTION') continue
    const nom = paires[i + 1]?.[1]
    const debut = i + 2
    let fin = debut
    while (fin < paires.length && !(paires[fin][0] === 0 && paires[fin][1] === 'ENDSEC')) fin++
    sections[nom] = paires.slice(debut, fin)
    i = fin
  }
  return sections
}

function decouperEntites(paires) {
  const entites = []
  let e = null
  for (const [code, valeur] of paires) {
    if (code === 0) { e = { type: valeur, g: [] }; entites.push(e) } else if (e) e.g.push([code, valeur])
  }
  return entites
}

const val = (e, code) => e.g.find(([c]) => c === code)?.[1]
const nombre = (e, code, defaut = 0) => { const v = val(e, code); return v === undefined ? defaut : parseFloat(v) }
const entier = (e, code) => parseInt(val(e, code) ?? '0', 10) || 0
const tous = (e, code) => e.g.filter(([c]) => c === code).map(([, v]) => v)

function lireEntete(paires) {
  let courant = null
  const entete = { version: null, unites: null }
  for (const [code, valeur] of paires) {
    if (code === 9) courant = valeur
    else if (courant === '$ACADVER' && code === 1) entete.version = valeur
    else if (courant === '$INSUNITS' && code === 70) entete.unites = parseInt(valeur, 10)
  }
  return entete
}

function lireBlocs(entites) {
  const blocs = new Map()
  let courant = null
  for (const e of entites) {
    if (e.type === 'BLOCK') {
      courant = { nom: val(e, 2), base: [nombre(e, 10), nombre(e, 20)], entites: [] }
      if (courant.nom) blocs.set(courant.nom, courant)
    } else if (e.type === 'ENDBLK') courant = null
    else if (courant) courant.entites.push(e)
  }
  return blocs
}

// Matrices affines [a, b, c, d, e, f] : x' = a·x + c·y + e ; y' = b·x + d·y + f
const IDENTITE = [1, 0, 0, 1, 0, 0]
const composer = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const appliquer = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const echelleDe = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))

function matriceInsertion(e, base) {
  const r = (nombre(e, 50) * Math.PI) / 180
  const sx = nombre(e, 41, 1)
  const sy = nombre(e, 42, 1)
  const a = Math.cos(r) * sx, b = Math.sin(r) * sx, c = -Math.sin(r) * sy, d = Math.cos(r) * sy
  const px = nombre(e, 10), py = nombre(e, 20)
  return [a, b, c, d, px - a * base[0] - c * base[1], py - b * base[0] - d * base[1]]
}

function pointsArc(e, cercle) {
  const cx = nombre(e, 10), cy = nombre(e, 20), r = nombre(e, 40)
  const debut = cercle ? 0 : nombre(e, 50)
  let fin = cercle ? 360 : nombre(e, 51)
  if (fin <= debut) fin += 360
  const n = Math.max(4, Math.ceil((SEGMENTS_CERCLE * (fin - debut)) / 360))
  const pts = []
  for (let i = 0; i <= (cercle ? n - 1 : n); i++) {
    const a = ((debut + ((fin - debut) * i) / n) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

const decoderUnicode = (s) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
// Lu de gauche à droite en une passe : « %%% » est un « % » littéral, et
// « %%%%%%d » (deux « % » échappés puis « d ») ne devient pas « %° »
const CODES_POURCENT = { '%': '%', c: 'Ø', d: '°', p: '±', u: '', o: '' }
const codesPourcent = (s) => s.replace(/%%([%cCdDpPuUoO])/g, (_, c) => CODES_POURCENT[c.toLowerCase()])

export function nettoyerMtext(brut) {
  return codesPourcent(decoderUnicode(brut))
    .replace(/\\\\/g, '\u0000')
    .replace(/\^J/g, '\n')
    .replace(/\\P/g, '\n')
    // \pxqc; (alignement de paragraphe) : la majuscule, déjà traitée, est un saut de ligne
    .replace(/\\p[^;]*;/g, '')
    // \A1 (alignement) : certains exports l'écrivent sans point-virgule
    // (« \A1{\H.66x;… ») — il passait sinon dans le texte et la surface
    // « 16,12\A1/ m\A12/ » n'était plus lue
    .replace(/\\A[0-2];?/g, '')
    // Empilement \Sa^b; : exposant seul quand b est vide (« m\S2^ ; » = m²),
    // sinon fraction ou tolérance écrite avec une barre
    .replace(/\\[Ss]([^;]*?)([#^/])([^;]*);/g, (_, haut, signe, bas) => {
      if (signe === '^' && !bas.trim()) return { 2: '²', 3: '³' }[haut.trim()] ?? haut.trim()
      return `${haut}/${bas}`
    })
    .replace(/\\[ACcFfHhQqTtWw][^;\\]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/[{}]/g, '')
    .split('\u0000').join('\\')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

function deployer(entites, blocs) {
  const traits = []
  const textes = []

  const parcourir = (liste, m, calqueParent, blocRacine, profondeur) => {
    let poly = null
    for (const e of liste) {
      const brut = val(e, 8) ?? '0'
      const calque = brut === '0' && calqueParent ? calqueParent : brut
      switch (e.type) {
        case 'POLYLINE': {
          // Maillages 3D (drapeaux 16 et 64) : sans intérêt pour un plan
          const drapeaux = entier(e, 70)
          poly = drapeaux & 80 ? { ignore: true } : { calque, bloc: blocRacine, ferme: (drapeaux & 1) === 1, pts: [] }
          break
        }
        case 'VERTEX':
          if (poly && !poly.ignore) poly.pts.push(appliquer(m, [nombre(e, 10), nombre(e, 20)]))
          break
        case 'SEQEND':
          if (poly && !poly.ignore && poly.pts.length >= 2) traits.push(poly)
          poly = null
          break
        case 'LINE':
          traits.push({ calque, bloc: blocRacine, ferme: false, pts: [appliquer(m, [nombre(e, 10), nombre(e, 20)]), appliquer(m, [nombre(e, 11), nombre(e, 21)])] })
          break
        case 'LWPOLYLINE': {
          const xs = tous(e, 10), ys = tous(e, 20)
          const pts = xs.map((x, i) => appliquer(m, [parseFloat(x), parseFloat(ys[i])]))
          if (pts.length >= 2) traits.push({ calque, bloc: blocRacine, ferme: (entier(e, 70) & 1) === 1, pts })
          break
        }
        case 'ARC':
        case 'CIRCLE':
          traits.push({ calque, bloc: blocRacine, ferme: e.type === 'CIRCLE', pts: pointsArc(e, e.type === 'CIRCLE').map((p) => appliquer(m, p)) })
          break
        case 'TEXT': {
          const t = codesPourcent(decoderUnicode(val(e, 1) ?? '')).trim()
          const aligne = (entier(e, 72) || entier(e, 73)) && val(e, 11) !== undefined
          const pos = aligne ? [nombre(e, 11), nombre(e, 21)] : [nombre(e, 10), nombre(e, 20)]
          // Rotation (degrés) : celle du texte et celle des blocs qui le portent
          const rotation = nombre(e, 50) + (Math.atan2(m[1], m[0]) * 180) / Math.PI
          // Alignement (72 / 73) gardé pour l'aperçu de l'export : un libellé
          // centré dessiné calé à gauche paraîtrait décalé de sa pièce
          if (t) {
            textes.push({
              calque, bloc: blocRacine, texte: t, pos: appliquer(m, pos), hauteur: nombre(e, 40) * echelleDe(m), rotation,
              ...(aligne ? { alignH: entier(e, 72), alignV: entier(e, 73) } : {}),
            })
          }
          break
        }
        case 'MTEXT': {
          // Le texte long arrive en morceaux (code 3) avant le dernier (code 1)
          const brutTexte = e.g.filter(([c]) => c === 1 || c === 3).map(([, v]) => v).join('')
          const t = nettoyerMtext(brutTexte)
          if (t) textes.push({ calque, bloc: blocRacine, texte: t, pos: appliquer(m, [nombre(e, 10), nombre(e, 20)]), hauteur: nombre(e, 40) * echelleDe(m) })
          break
        }
        case 'INSERT': {
          const b = blocs.get(val(e, 2))
          if (!b || profondeur >= PROFONDEUR_MAX) break
          parcourir(b.entites, composer(m, matriceInsertion(e, b.base)), calque, blocRacine ?? b.nom, profondeur + 1)
          break
        }
        default:
          break
      }
    }
  }

  parcourir(entites, IDENTITE, null, null, 0)
  return { traits, textes }
}

export function lireDxf(texte) {
  const sections = lireSections(lirePaires(texte))
  const entete = lireEntete(sections.HEADER ?? [])
  const blocs = lireBlocs(decouperEntites(sections.BLOCKS ?? []))
  const entites = decouperEntites(sections.ENTITIES ?? [])
  const objet = deployer(entites.filter((e) => val(e, 67) !== '1'), blocs)
  if (objet.traits.length >= MIN_TRAITS_OBJET) return { ...entete, ...objet }
  const papier = deployer(entites.filter((e) => val(e, 67) === '1'), blocs)
  return { ...entete, traits: [...objet.traits, ...papier.traits], textes: [...objet.textes, ...papier.textes] }
}

/**
 * Calques déclarés dans la table LAYER et blocs définis, tels qu'écrits : de
 * quoi vérifier qu'un fichier produit par l'export les annonce bien (un
 * calque sans entrée de table n'apparaît pas toujours à l'import).
 */
export function lireTablesDxf(texte) {
  const sections = lireSections(lirePaires(texte))
  const calques = decouperEntites(sections.TABLES ?? [])
    .filter((e) => e.type === 'LAYER')
    .map((e) => ({ nom: val(e, 2), couleur: entier(e, 62), typeLigne: val(e, 6) ?? null }))
  const blocs = decouperEntites(sections.BLOCKS ?? []).filter((e) => e.type === 'BLOCK').map((e) => val(e, 2))
  return { calques, blocs }
}
