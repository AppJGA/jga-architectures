// État des lieux, lot 4 (export) : DXF R12 par calques EDL-.
// Tout fichier produit est relu par notre propre lecteur (`lireDxf`), après
// encodage Windows-1252 : c'est ce que reçoit ArchiCAD.
// Pièces, points et éléments inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { decoderDxf, lireDxf, lireTablesDxf } from '../src/modules/etude/etat-des-lieux/dxfLecture.js'
import { pointDansPolygone } from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'
import { primitivesPlacees } from '../src/modules/etude/etat-des-lieux/export/symbolesEdl.js'
import { encoderCp1252, octetCp1252 } from '../src/modules/etude/etat-des-lieux/export/encodageDxf.js'
import { numeroterPhotos } from '../src/modules/etude/etat-des-lieux/export/numerotationEdl.js'
import {
  CALQUE_A_VALIDER, couperLignes, echapperPourcent, elementsAExporter, encoderDxf, genererDxfEdl, nomBloc, nomCalqueValide,
  pointInterieur, texteHsp, texteSurface, uniteDxf,
} from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'

const proche = (a, b, ecart = 1e-6) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)
const prochePoint = (p, q, ecart = 1e-6) => { proche(p[0], q[0], ecart); proche(p[1], q[1], ecart) }

// Relecture complète : octets Windows-1252 → texte → lecteur
// Entités brutes d'un type (groupes code → valeur), pour lire ce que le
// lecteur ne rend pas (rotation d'un INSERT)
function entitesBrutes(texte, type) {
  const lignes = texte.split('\r\n')
  const entites = []
  let courante = null
  for (let i = 0; i + 1 < lignes.length; i += 2) {
    const code = Number(lignes[i])
    if (code === 0) { courante = lignes[i + 1] === type ? new Map() : null; if (courante) entites.push(courante) } else if (courante && !courante.has(code)) courante.set(code, lignes[i + 1])
  }
  return entites
}

const relire = (texte) => {
  const decode = decoderDxf(encoderDxf(texte))
  return { ...lireDxf(decode), ...lireTablesDxf(decode), brut: decode }
}

// Rectangle l × h, coin bas gauche (x, y), tourné de `deg` autour de ce coin
function rectangle(x, y, l, h, deg = 0) {
  const a = (deg * Math.PI) / 180
  return [[0, 0], [l, 0], [l, h], [0, h]].map(([u, v]) => [x + u * Math.cos(a) - v * Math.sin(a), y + u * Math.sin(a) + v * Math.cos(a)])
}

const sejour = {
  id: 'pc-1', nom: 'Séjour', numero: '1.04', contour: rectangle(0, 0, 5, 4), surface_lue: 19.85, hsp_lue: 2.5,
  fiche: { sol: 'Parquet chêne', murs: 'Peinture blanche', plafond: '', plinthes: 'Bois peint', hsp: '', remarques: 'Bon état' },
}
const salleDeBain = {
  id: 'pc-2', nom: 'Salle d’eau', numero: null, contour: rectangle(6, 0, 3, 2), surface_lue: null, hsp_lue: null,
  fiche: { sol: 'Carrelage', murs: '', plafond: '', plinthes: '', hsp: '2,40 m' },
}
const points = [
  { id: 'pt-1', numero: 1, x: 1, y: 1, type: 'radiateur', calque: 'chauffage', piece_id: 'pc-1' },
  { id: 'pt-2', numero: 2, x: 7, y: 1, type: 'lavabo', calque: 'plomberie', piece_id: 'pc-2' },
  { id: 'pt-3', numero: 3, x: 8, y: 1.5, type: 'lavabo', calque: 'plomberie', piece_id: null },
  { id: 'pt-4', numero: 4, x: 3, y: 3, type: null, calque: null, piece_id: 'pc-1' },
  { id: 'pt-5', numero: 5, x: 4, y: 1, type: 'prise', calque: 'electricite', piece_id: 'pc-1' },
]
const elements = [
  { id: 'el-1', point_id: 'pt-1', piece_id: 'pc-1', calque: 'chauffage', type: 'radiateur', libelle: 'Radiateur fonte sous la fenêtre', cotes: 'largeur 120', a_valider: false },
  { id: 'el-2', point_id: 'pt-2', piece_id: 'pc-2', calque: 'plomberie', type: 'lavabo', libelle: 'Lavabo sur colonne', cotes: '', a_valider: false },
  { id: 'el-3', point_id: null, piece_id: 'pc-1', calque: 'desordres', type: 'fissure', libelle: 'Fissure en plafond', cotes: 'longueur 80', a_valider: false },
  { id: 'el-4', point_id: 'pt-5', piece_id: 'pc-1', calque: 'electricite', type: 'prise', libelle: 'Prise double', cotes: null, a_valider: true },
]

const textesDe = (l, calque) => l.textes.filter((t) => t.calque === calque).map((t) => t.texte)

describe('Windows-1252', () => {
  test('accents, apostrophe typographique, œ et € en un octet ; hors table → ?', () => {
    const octets = encoderCp1252('Électricité Pièces Salle d’eau œuvre 5 € m² ≈')
    assert.equal(new TextDecoder('windows-1252').decode(octets), 'Électricité Pièces Salle d’eau œuvre 5 € m² ?')
    assert.equal(octetCp1252('’'), 0x92)
    assert.equal(octetCp1252('ı'), null)
  })
  test('un octet par caractère, paire de substitution comprise (un seul « ? »)', () => {
    const octets = encoderCp1252('a😀é')
    assert.ok(octets instanceof Uint8Array)
    assert.deepEqual([...octets], [0x61, 0x3f, 0xe9])
    assert.equal(encoderCp1252('').length, 0)
  })
  test('table conforme au décodeur du navigateur sur les 256 octets', () => {
    const trous = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d])
    const decodeur = new TextDecoder('windows-1252')
    for (let o = 0; o < 256; o++) {
      if (trous.has(o)) continue
      assert.equal(octetCp1252(decodeur.decode(Uint8Array.of(o))), o, `octet ${o.toString(16)}`)
    }
  })
})

describe('ce qui part dans l’export', () => {
  test('éléments validés seuls par défaut ; point typé sans élément exporté → élément de son type', () => {
    const liste = elementsAExporter({ pieces: [sejour, salleDeBain], points, elements })
    assert.deepEqual(liste.map((e) => e.id), ['el-1', 'el-2', 'point-pt-3', 'point-pt-5', 'el-3'])
    const p3 = liste.find((e) => e.id === 'point-pt-3')
    assert.equal(p3.libelle, 'Lavabo')
    assert.equal(p3.calque, 'plomberie')
    // Point sans pièce : rattaché à la pièce qui le contient
    assert.equal(p3.pieceId, 'pc-2')
    // Le point 5 porte une proposition écartée : il reste dessiné, de son type
    assert.equal(liste.find((e) => e.id === 'point-pt-5').aValider, false)
    // Point ni typé ni rattaché : rien
    assert.equal(liste.some((e) => e.pointId === 'pt-4'), false)
    const fissure = liste.find((e) => e.id === 'el-3')
    assert.equal(fissure.x, null)
    assert.equal(fissure.numero, null)
  })
  test('propositions sur demande, marquées ; elles couvrent alors leur point', () => {
    const liste = elementsAExporter({ pieces: [sejour, salleDeBain], points, elements, inclurePropositions: true })
    const prise = liste.filter((e) => e.pointId === 'pt-5')
    assert.equal(prise.length, 1)
    assert.equal(prise[0].id, 'el-4')
    assert.equal(prise[0].aValider, true)
    assert.deepEqual([prise[0].x, prise[0].y, prise[0].numero], [4, 1, 5])
  })
  test('calque déduit du type ; calque inconnu sans type écarté', () => {
    const liste = elementsAExporter({
      points: [],
      elements: [
        { id: 'a', calque: 'plomberie', type: 'radiateur', libelle: 'R', a_valider: false },
        { id: 'b', calque: 'inconnu', type: null, libelle: 'X', a_valider: false },
        { id: 'c', calque: 'desordres', type: null, libelle: 'Tache', a_valider: false },
      ],
    })
    assert.deepEqual(liste.map((e) => [e.id, e.calque, e.type]), [['a', 'chauffage', 'radiateur'], ['c', 'desordres', null]])
  })
})

describe('unités, noms et textes', () => {
  test('$INSUNITS d’après l’unité du plan ; autre unité → la plus proche, signalée', () => {
    assert.deepEqual([1, 100, 1000, 10].map((u) => uniteDxf(u).insunits), [6, 5, 4, 14])
    assert.equal(uniteDxf(100).exacte, true)
    assert.deepEqual([uniteDxf(50).insunits, uniteDxf(50).exacte], [5, false])
    assert.equal(uniteDxf(null).unitesParMetre, 1)
  })
  test('noms de calque valides : 31 caractères, caractères interdits remplacés', () => {
    assert.equal(nomCalqueValide('MURS/PORTEURS'), 'MURS_PORTEURS')
    assert.equal(nomCalqueValide('a<b>c:d;e?f*g|h=i,j"k\\l`m'), 'a_b_c_d_e_f_g_h_i_j_k_l_m')
    assert.equal(nomCalqueValide('Très long nom de calque venu d’ArchiCAD 2026').length, 31)
    assert.equal(nomCalqueValide('Zone ≈ 1'), 'Zone _ 1')
    assert.equal(nomCalqueValide(''), 'SANS_NOM')
    assert.equal(nomBloc('ballon-eau-chaude'), 'EDL_BALLON_EAU_CHAUDE')
  })
  test('surface et HSP', () => {
    assert.equal(texteSurface(sejour), '19,85 m²')
    assert.equal(texteSurface({ contour: rectangle(0, 0, 3, 2) }), '6 m²')
    assert.equal(texteHsp(sejour), 'HSP 2,50 m')
    assert.equal(texteHsp(salleDeBain), 'HSP 2,40 m')
    assert.equal(texteHsp({ fiche: {} }), null)
    // Lue sur le plan d'abord, comme le rapport (`hspExport`)
    assert.equal(texteHsp({ hsp_lue: 2.5, fiche: { hsp: '2,70' } }), 'HSP 2,50 m')
    assert.equal(texteHsp({ fiche: { hsp: '2,7' } }), 'HSP 2,70 m')
    // Fiche proposée écartée : sa HSP dite ne part pas
    assert.equal(texteHsp({ fiche_a_valider: true, fiche: { hsp: '2,70' } }, { inclurePropositions: false }), null)
  })
  test('lignes coupées aux espaces, retours à la ligne retirés', () => {
    const lignes = couperLignes(`Peinture ${'très '.repeat(20)}abîmée\nau-dessus`, 30)
    assert.ok(lignes.length > 1)
    assert.ok(lignes.every((l) => l.length <= 30 && !l.includes('\n')))
    assert.equal(lignes.join(' '), `Peinture ${'très '.repeat(20)}abîmée au-dessus`)
  })
  test('point intérieur d’une pièce en L', () => {
    const enL = [[0, 0], [6, 0], [6, 1], [1, 1], [1, 6], [0, 6]]
    assert.ok(pointDansPolygone(pointInterieur(enL), enL))
    prochePoint(pointInterieur(rectangle(0, 0, 4, 2)), [2, 1])
  })
})

describe('fichier DXF', () => {
  const exporter = (options = {}) => {
    const elementsExport = elementsAExporter({ pieces: [sejour, salleDeBain], points, elements, inclurePropositions: options.inclurePropositions })
    return genererDxfEdl({ pieces: [sejour, salleDeBain], elementsExport, points, photos: [], unitesParMetre: 1, ...options })
  }

  test('R12, CRLF, codes alignés sur 3 caractères, aucun code R13+', () => {
    const texte = exporter()
    assert.ok(texte.endsWith('  0\r\nEOF\r\n'))
    assert.equal(/[^\r]\n/.test(texte), false)
    const lignes = texte.split('\r\n').slice(0, -1)
    assert.equal(lignes.length % 2, 0)
    const codes = lignes.filter((_, i) => i % 2 === 0)
    assert.ok(codes.every((c) => /^[ \d]{3}$/.test(c) && /\d$/.test(c)), 'code mal aligné')
    // 5 / 105 (identifiants), 100 (sous-classes), 330 (propriétaires) : R13 et après
    assert.equal(codes.some((c) => [5, 100, 105, 330, 360].includes(Number(c))), false)
    const entites = lignes.filter((_, i) => i % 2 === 1 && codes[i / 2 - 0.5] === '  0')
    assert.equal(entites.some((t) => ['LWPOLYLINE', 'MTEXT', 'HATCH'].includes(t)), false)
    const l = relire(texte)
    assert.equal(l.version, 'AC1009')
    assert.equal(l.unites, 6)
    assert.match(l.brut, /\$DWGCODEPAGE\r\n {2}3\r\nANSI_1252/)
  })

  test('calques EDL- déclarés, nommés, accents relus à l’identique', () => {
    const l = relire(exporter())
    const noms = l.calques.map((c) => c.nom)
    assert.deepEqual(noms, ['0', 'EDL-Pièces', 'EDL-Finitions', 'EDL-Plomberie', 'EDL-Électricité', 'EDL-Chauffage', 'EDL-Cotes', 'EDL-Désordres'])
    assert.ok(l.calques.every((c) => c.couleur > 0 && c.typeLigne === 'CONTINUOUS'))
    // Le compte de la table est celui des entrées
    assert.match(l.brut, new RegExp(`LAYER\\r\\n 70\\r\\n {5}${noms.length}\\r\\n`))
    assert.deepEqual(textesDe(l, 'EDL-Pièces').slice(0, 3), ['Séjour (1.04)', '19,85 m²', 'HSP 2,50 m'])
    assert.ok(textesDe(l, 'EDL-Pièces').includes('Salle d’eau'))
  })

  test('blocs définis une fois et insérés au bon endroit (m)', () => {
    const l = relire(exporter())
    // Dans l'ordre du catalogue, deux lavabos pour un seul bloc
    assert.deepEqual(l.blocs, ['EDL_LAVABO', 'EDL_PRISE', 'EDL_RADIATEUR'])
    const lavabos = l.traits.filter((t) => t.bloc === 'EDL_LAVABO')
    assert.ok(lavabos.every((t) => t.calque === 'EDL-Plomberie'))
    // (7, 1) à 1 m de tout mur : droit, comme la pièce ; (8, 1,5) à 0,5 m du
    // mur du haut : tourné de 180°, son dos (−y local) contre ce mur
    for (const [x, y, angle] of [[7, 1, 0], [8, 1.5, 180]]) {
      const attendu = primitivesPlacees('lavabo', { x, y, angle }).find((p) => p.polyligne)
      assert.ok(lavabos.some((t) => t.pts.length === attendu.polyligne.length && t.pts.every((p, i) => Math.hypot(p[0] - attendu.polyligne[i][0], p[1] - attendu.polyligne[i][1]) < 1e-6)), `lavabo en ${x}, ${y}`)
    }
  })

  test('textes des symboles lisibles : variante « _R » du bloc au-delà de 90°', () => {
    const salle = { id: 'sr', nom: 'Bureau', numero: null, contour: rectangle(0, 0, 4, 3), surface_lue: null, hsp_lue: null }
    const rj = (id, x, y) => ({ id, pieceId: 'sr', pointId: id, x, y, calque: 'electricite', type: 'rj45', libelle: 'RJ45', cotes: '', numero: 1, aValider: false })
    const blocDe = (texte, nom) => {
      const debut = texte.indexOf(`\r\n  2\r\n${nom}\r\n`)
      return texte.slice(debut + 2, texte.indexOf('ENDBLK', debut))
    }
    // Contre le mur du haut : inséré à 180°, textes retournés dans le bloc
    const haut = genererDxfEdl({ pieces: [salle], elementsExport: [rj('a', 2, 2.8)] })
    const lh = relire(haut)
    assert.deepEqual(lh.blocs, ['EDL_RJ45_R'])
    const insert = entitesBrutes(haut, 'INSERT')
    assert.equal(insert.length, 1)
    assert.equal(insert[0].get(2), 'EDL_RJ45_R')
    proche(Number(insert[0].get(50)), 180)
    const [texteBloc] = entitesBrutes(blocDe(haut, 'EDL_RJ45_R'), 'TEXT')
    assert.equal(texteBloc.get(1), 'RJ')
    proche(Number(texteBloc.get(50)), 180)
    // Une fois déployé, le texte se lit droit (180 + 180 ≡ 0)
    const deploye = lh.textes.find((t) => t.texte === 'RJ')
    proche(Math.cos((deploye.rotation * Math.PI) / 180), 1)
    // Loin des murs : droit, bloc ordinaire seul
    const milieu = genererDxfEdl({ pieces: [salle], elementsExport: [rj('b', 2, 1.5)] })
    assert.deepEqual(relire(milieu).blocs, ['EDL_RJ45'])
    assert.equal(entitesBrutes(milieu, 'INSERT')[0].get(2), 'EDL_RJ45')
    const [texteDroit] = entitesBrutes(blocDe(milieu, 'EDL_RJ45'), 'TEXT')
    assert.equal(texteDroit.has(50), false)
    // Les deux sur l'étage : deux blocs, ordinaire puis retourné
    assert.deepEqual(relire(genererDxfEdl({ pieces: [salle], elementsExport: [rj('a', 2, 2.8), rj('b', 2, 1.5)] })).blocs, ['EDL_RJ45', 'EDL_RJ45_R'])
    // Symbole sans texte : jamais de variante
    const prise = { ...rj('c', 2, 2.8), type: 'prise' }
    assert.deepEqual(relire(genererDxfEdl({ pieces: [salle], elementsExport: [prise] })).blocs, ['EDL_PRISE'])
  })

  test('point plein du détecteur : cercles concentriques dans le bloc', () => {
    const salle = { id: 'sd', nom: 'Couloir', numero: null, contour: rectangle(0, 0, 4, 3), surface_lue: null, hsp_lue: null }
    const df = { id: 'd', pieceId: 'sd', pointId: 'd', x: 2, y: 1.5, calque: 'securite', type: 'detecteur-fumee', libelle: '', cotes: '', numero: 1, aValider: false }
    const texte = genererDxfEdl({ pieces: [salle], elementsExport: [df] })
    const debut = texte.indexOf('\r\n  2\r\nEDL_DETECTEUR_FUMEE\r\n')
    const cercles = entitesBrutes(texte.slice(debut + 2, texte.indexOf('ENDBLK', debut)), 'CIRCLE').map((c) => Number(c.get(40))).sort((a, b) => a - b)
    assert.equal(cercles.length, 4)
    proche(cercles[2], 0.045)
    proche(cercles[3], 0.12)
    proche(cercles[0], 0.015)
  })

  test('en centimètres : coordonnées, symboles et hauteurs × 100', () => {
    const elementsExport = elementsAExporter({ pieces: [sejour], points, elements })
    const l = relire(genererDxfEdl({ pieces: [sejour], elementsExport, unitesParMetre: 100 }))
    assert.equal(l.unites, 5)
    const contour = l.traits.find((t) => t.calque === 'EDL-Pièces' && !t.bloc)
    assert.deepEqual(contour.pts, sejour.contour.map(([x, y]) => [x * 100, y * 100]))
    const radiateur = l.traits.find((t) => t.bloc === 'EDL_RADIATEUR')
    const attendu = primitivesPlacees('radiateur', { x: 1, y: 1, angle: 0 }).find((p) => p.polyligne)
    radiateur.pts.forEach((p, i) => prochePoint(p, [attendu.polyligne[i][0] * 100, attendu.polyligne[i][1] * 100], 1e-4))
    const nom = l.textes.find((t) => t.texte === 'Séjour (1.04)')
    proche(nom.hauteur, 20)
    proche(l.textes.find((t) => t.texte === '19,85 m²').hauteur, 12)
    // Unité reprise de l'étage si elle n'est pas donnée
    assert.equal(relire(genererDxfEdl({ niveau: { unites_par_metre: 1000 }, pieces: [sejour] })).unites, 4)
  })

  test('symboles et textes tournés comme la pièce', () => {
    const piece = { ...sejour, contour: rectangle(10, 10, 5, 4, 30) }
    const point = { id: 'p', numero: 9, x: 12, y: 12, type: 'radiateur', piece_id: piece.id }
    const elementsExport = elementsAExporter({ pieces: [piece], points: [point], elements: [] })
    const l = relire(genererDxfEdl({ pieces: [piece], elementsExport, unitesParMetre: 1 }))
    const [insertion] = entitesBrutes(l.brut, 'INSERT')
    assert.deepEqual([insertion.get(8), insertion.get(2), Number(insertion.get(50))], ['EDL-Chauffage', 'EDL_RADIATEUR', 30])
    const trait = l.traits.find((t) => t.bloc === 'EDL_RADIATEUR')
    const attendu = primitivesPlacees('radiateur', { x: 12, y: 12, angle: 30 }).find((p) => p.polyligne)
    trait.pts.forEach((p, i) => prochePoint(p, attendu.polyligne[i]))
    const libelle = l.textes.find((t) => t.texte === 'P9 · Radiateur')
    proche(libelle.rotation, 30)
    proche(l.textes.find((t) => t.texte === 'Séjour (1.04)').rotation, 30)
    // Le libellé est à droite du symbole, dans le sens de la pièce
    const r = (30 * Math.PI) / 180
    const u = (libelle.pos[0] - 12) * Math.cos(r) + (libelle.pos[1] - 12) * Math.sin(r)
    assert.ok(u > 0.3)
  })

  test('cotes sur EDL-Cotes, élément sans point en texte dans sa pièce', () => {
    const l = relire(exporter())
    // Textes des pièces d'abord, puis ceux des éléments placés
    assert.deepEqual(textesDe(l, 'EDL-Cotes'), ['longueur 80', 'largeur 120'])
    assert.deepEqual(textesDe(l, 'EDL-Désordres'), ['Fissure en plafond'])
    const fissure = l.textes.find((t) => t.texte === 'Fissure en plafond')
    assert.ok(pointDansPolygone(fissure.pos, sejour.contour))
    assert.equal(l.traits.some((t) => t.bloc === 'EDL_FISSURE'), false)
    // Libellé coupé à 32 caractères : un bloc étroit trouve sa place entre les symboles
    assert.deepEqual(textesDe(l, 'EDL-Chauffage'), ['P1 · Radiateur fonte sous la', 'fenêtre'])
  })

  test('finitions sous le nom, rubriques vides omises', () => {
    const l = relire(exporter())
    assert.deepEqual(textesDe(l, 'EDL-Finitions'), ['Sol : Parquet chêne', 'Murs : Peinture blanche', 'Plinthes : Bois peint', 'Sol : Carrelage'])
    const nom = l.textes.find((t) => t.texte === 'Séjour (1.04)')
    const sol = l.textes.find((t) => t.texte === 'Sol : Parquet chêne')
    assert.ok(sol.pos[1] < nom.pos[1])
    assert.equal(l.textes.some((t) => t.texte.includes('Bon état')), false)
  })

  test('statut écrit après la finition (sauf « À préciser »), bloc porte si renseigné', () => {
    const piece = {
      ...sejour,
      fiche: {
        ...sejour.fiche,
        porte: { huisserie: 'bois', vantail: 'bois', quincaillerie: '' },
        statuts: { sol: 'conserver', murs: 'rafraichir', plinthes: 'a-preciser', porte: 'deposer', plafond: 'deposer' },
      },
    }
    const l = relire(genererDxfEdl({ pieces: [piece], unitesParMetre: 1 }))
    const lignes = textesDe(l, 'EDL-Finitions')
    // Les lignes restent coupées à 32 caractères, statut compris
    assert.ok(lignes.every((t) => t.length <= 32))
    assert.equal(lignes.join(' '), 'Sol : Parquet chêne (Conserver) Murs : Peinture blanche (Rafraîchir) Plinthes : Bois peint Porte : huisserie bois, vantail bois (Déposer)')
  })

  test('ancienne fiche sans porte ni statuts : finitions comme avant, pas de ligne Porte', () => {
    const l = relire(genererDxfEdl({ pieces: [sejour], unitesParMetre: 1 }))
    assert.deepEqual(textesDe(l, 'EDL-Finitions'), ['Sol : Parquet chêne', 'Murs : Peinture blanche', 'Plinthes : Bois peint'])
  })

  test('fiche proposée écartée : ni statut ni porte ; incluse, sur EDL-À valider', () => {
    const piece = { ...salleDeBain, fiche_a_valider: true, fiche: { ...salleDeBain.fiche, porte: { huisserie: 'métallique' }, statuts: { sol: 'deposer' } } }
    const sans = relire(genererDxfEdl({ pieces: [piece], unitesParMetre: 1 }))
    assert.equal(sans.textes.some((t) => t.texte.includes('Déposer') || t.texte.startsWith('Porte')), false)
    const avec = relire(genererDxfEdl({ pieces: [piece], unitesParMetre: 1, inclurePropositions: true }))
    assert.deepEqual(textesDe(avec, CALQUE_A_VALIDER), ['HSP 2,40 m', 'Sol : Carrelage (Déposer)', 'Porte : huisserie métallique'])
  })

  test('finition longue coupée en lignes', () => {
    const piece = { ...sejour, fiche: { murs: `Enduit ${'fissuré '.repeat(30)}à reprendre` } }
    const l = relire(genererDxfEdl({ pieces: [piece], unitesParMetre: 1 }))
    const murs = textesDe(l, 'EDL-Finitions')
    assert.ok(murs.length > 2)
    assert.ok(murs.every((t) => t.length <= 60))
    assert.ok(murs[0].startsWith('Murs : Enduit'))
  })

  test('propositions sur EDL-À valider seulement si demandé', () => {
    const sans = relire(exporter())
    assert.equal(sans.calques.some((c) => c.nom === CALQUE_A_VALIDER), false)
    // Le point 5 garde son symbole, de son type, sur son calque
    assert.ok(sans.traits.some((t) => t.bloc === 'EDL_PRISE' && t.calque === 'EDL-Électricité'))
    const avec = relire(exporter({ inclurePropositions: true }))
    assert.ok(avec.calques.some((c) => c.nom === 'EDL-À valider'))
    assert.ok(avec.traits.some((t) => t.bloc === 'EDL_PRISE' && t.calque === 'EDL-À valider'))
    assert.deepEqual(textesDe(avec, 'EDL-À valider'), ['P5 · Prise double'])
    assert.equal(avec.traits.some((t) => t.bloc === 'EDL_PRISE' && t.calque === 'EDL-Électricité'), false)
  })

  test('fiche pas encore relue : omise, ou sur EDL-À valider si demandé', () => {
    const piece = { ...salleDeBain, fiche_a_valider: true }
    const sans = relire(genererDxfEdl({ pieces: [piece], unitesParMetre: 1 }))
    assert.equal(sans.textes.some((t) => t.texte.startsWith('Sol') || t.texte.startsWith('HSP')), false)
    const avec = relire(genererDxfEdl({ pieces: [piece], unitesParMetre: 1, inclurePropositions: true }))
    assert.deepEqual(textesDe(avec, 'EDL-À valider'), ['HSP 2,40 m', 'Sol : Carrelage'])
  })

  test('photos : repère numéroté au point, sur EDL-Photos', () => {
    const photos = [{ point_id: 'pt-1', chemin: 'a' }, { point_id: 'pt-4', chemin: 'b' }, { point_id: 'pt-1', chemin: 'c' }, { point_id: 'inconnu', chemin: 'd' }]
    const elementsExport = elementsAExporter({ pieces: [sejour], points, elements })
    const l = relire(genererDxfEdl({ pieces: [sejour], elementsExport, points, photos, unitesParMetre: 1 }))
    assert.deepEqual(textesDe(l, 'EDL-Photos'), ['Ph 1, 3', 'Ph 2'])
    assert.equal(l.traits.filter((t) => t.calque === 'EDL-Photos').length, 2)
    // Point 4 sans élément : le repère est sur le point
    const rond = l.traits.filter((t) => t.calque === 'EDL-Photos')[1]
    const cx = rond.pts.reduce((s, p) => s + p[0], 0) / rond.pts.length
    const cy = rond.pts.reduce((s, p) => s + p[1], 0) / rond.pts.length
    prochePoint([cx, cy], [3, 3], 1e-3)
  })

  test('plan existant : calques d’origine rendus valides, traits, masses et textes', () => {
    const plan = {
      calques: ['MURS/PORTEURS', 'EDL-Pièces', 'Cotations'],
      traits: [
        { calque: 'MURS/PORTEURS', ferme: false, pts: [[0, 0], [5, 0]] },
        { calque: 'MURS/PORTEURS', ferme: true, pts: [[0, 0], [1, 0], [1, 1]] },
      ],
      masses: [{ calque: 'EDL-Pièces', anneaux: [[[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]]] }],
      textes: [{ calque: 'Cotations', texte: '2,54\nRDC', pos: [1, 1], hauteur: 0.1 }],
    }
    const l = relire(genererDxfEdl({ pieces: [sejour], plan, unitesParMetre: 100 }))
    const noms = l.calques.map((c) => c.nom)
    assert.ok(noms.includes('MURS_PORTEURS'))
    // Un calque d'origine qui porterait un nom EDL- ne se mélange pas aux nôtres
    assert.ok(noms.includes('EDL-Pièces_2'))
    const murs = l.traits.filter((t) => t.calque === 'MURS_PORTEURS')
    assert.deepEqual(murs.map((t) => [t.ferme, t.pts]), [[false, [[0, 0], [500, 0]]], [true, [[0, 0], [100, 0], [100, 100]]]])
    assert.equal(l.traits.filter((t) => t.calque === 'EDL-Pièces_2' && t.ferme).length, 1)
    assert.deepEqual(textesDe(l, 'Cotations'), ['2,54', 'RDC'])
    proche(l.textes.find((t) => t.texte === '2,54').hauteur, 10)
    // Sans plan : seuls 0 et les calques EDL-
    const seul = relire(genererDxfEdl({ pieces: [sejour], unitesParMetre: 100 }))
    assert.ok(seul.calques.every((c) => c.nom === '0' || c.nom.startsWith('EDL-')))
  })

  test('pièces seules, sans élément : fichier valide', () => {
    const texte = genererDxfEdl({ pieces: [sejour], unitesParMetre: 1 })
    const l = relire(texte)
    assert.deepEqual(l.blocs, [])
    assert.deepEqual(l.calques.map((c) => c.nom), ['0', 'EDL-Pièces', 'EDL-Finitions'])
    // Le contour de la pièce et le cadre de ses textes
    assert.equal(l.traits.length, 2)
    assert.ok(l.traits.every((t) => t.calque === 'EDL-Pièces' && t.ferme))
    assert.match(l.brut, /\$EXTMIN\r\n 10\r\n0\.0\r\n 20\r\n0\.0\r\n/)
    assert.match(l.brut, /\$EXTMAX\r\n 10\r\n5\.\d+\r\n 20\r\n4\.\d+\r\n/)
    // Étage vide : encore un DXF lisible
    const vide = relire(genererDxfEdl({ unitesParMetre: 1 }))
    assert.deepEqual([vide.version, vide.traits.length, vide.textes.length], ['AC1009', 0, 0])
  })

  test('un libellé à retour à la ligne ou très long ne casse pas le fichier', () => {
    const elementsExport = [{ id: 'x', pieceId: 'pc-1', pointId: null, x: 2, y: 2, calque: 'desordres', type: 'humidite', libelle: `Tache\r\nd’humidité ${'x'.repeat(400)}`, cotes: null, numero: 12, aValider: false }]
    const texte = genererDxfEdl({ pieces: [sejour], elementsExport, unitesParMetre: 1 })
    const l = relire(texte)
    const textes = textesDe(l, 'EDL-Désordres')
    assert.equal(textes[0], 'P12 · Tache d’humidité')
    assert.ok(textes.every((t) => t.length <= 60))
  })
  test('plusieurs éléments sur un point : symboles côte à côte, libellés empilés', () => {
    const piece = { ...sejour, contour: rectangle(0, 0, 5, 4, 20) }
    const p3 = { id: 'pt-3', numero: 3, x: 2, y: 0.1, type: 'fenetre', piece_id: piece.id }
    const els = [
      { id: 'f', point_id: 'pt-3', piece_id: piece.id, calque: 'menuiseries', type: 'fenetre', libelle: 'Fenêtre bois double vitrage', cotes: 'allège 90, largeur 120', a_valider: false },
      { id: 'v', point_id: 'pt-3', piece_id: piece.id, calque: 'occultations', type: 'volet', libelle: 'Volet roulant', cotes: '', a_valider: false },
      { id: 'g', point_id: 'pt-3', piece_id: piece.id, calque: 'menuiseries', type: 'fenetre', libelle: 'Grille de défense', cotes: null, a_valider: false },
    ]
    const elementsExport = elementsAExporter({ pieces: [piece], points: [p3], elements: els })
    const l = relire(genererDxfEdl({ pieces: [piece], elementsExport, points: [p3], photos: [{ point_id: 'pt-3' }], unitesParMetre: 1 }))
    // Aucun texte posé sur un autre
    const positions = l.textes.map((t) => t.pos.map((v) => v.toFixed(4)).join(' '))
    assert.equal(new Set(positions).size, positions.length)
    // Un symbole par type, deux types : deux insertions, la seconde décalée le long de la pièce
    const insertions = entitesBrutes(l.brut, 'INSERT')
    assert.deepEqual(insertions.map((i) => i.get(2)), ['EDL_FENETRE', 'EDL_VOLET'])
    const [a, b] = insertions.map((i) => [Number(i.get(10)), Number(i.get(20))])
    prochePoint(a, [2, 0.1])
    const r = (20 * Math.PI) / 180
    assert.ok((b[0] - a[0]) * Math.cos(r) + (b[1] - a[1]) * Math.sin(r) > 0.1)
    proche(-(b[0] - a[0]) * Math.sin(r) + (b[1] - a[1]) * Math.cos(r), 0)
    // Libellés et cotes dans l'ordre, une ligne sous l'autre (axe de la pièce)
    const pile = ['P3 · Fenêtre bois double vitrage', 'allège 90, largeur 120', 'P3 · Volet roulant', 'P3 · Grille de défense']
      .map((t) => l.textes.find((x) => x.texte === t))
    const v = (t) => -(t.pos[0] - 2) * Math.sin(r) + (t.pos[1] - 0.1) * Math.cos(r)
    const uDe = (t) => (t.pos[0] - 2) * Math.cos(r) + (t.pos[1] - 0.1) * Math.sin(r)
    pile.slice(1).forEach((t, i) => proche(v(pile[i]) - v(t), 0.12 * 1.5))
    pile.forEach((t) => proche(uDe(t), uDe(pile[0])))
    assert.equal(textesDe(l, 'EDL-Photos').length, 1)
  })

  test('« %% » échappé dans les TEXT, relu tel qu’écrit', () => {
    assert.equal(echapperPourcent('100%%d'), '100%%%%%%d')
    assert.equal(echapperPourcent('Pente 2 %'), 'Pente 2 %')
    const elementsExport = [{ id: 'x', pieceId: 'pc-1', pointId: 'p', x: 2, y: 2, calque: 'desordres', type: null, libelle: 'Humidité 100%%d, pente 2 %', cotes: null, numero: 1, aValider: false }]
    const texte = genererDxfEdl({ pieces: [sejour], elementsExport, unitesParMetre: 1 })
    assert.ok(texte.includes('\r\nP1 · Humidité 100%%%%%%d, pente 2 %\r\n'))
    assert.deepEqual(textesDe(relire(texte), 'EDL-Désordres'), ['P1 · Humidité 100%%d, pente 2 %'])
  })

  test('photos numérotées pour toute l’affaire (numeroterPhotos) : « Ph n » les reprend', () => {
    const photos = numeroterPhotos(
      [{ id: 'f1', point_id: 'pt-5', prise_le: '2026-11-10T10:00:00Z' }, { id: 'f2', point_id: 'pt-1', prise_le: '2026-11-10T10:05:00Z' }, { id: 'f3', point_id: 'pt-1', prise_le: '2026-11-10T09:00:00Z' }],
      points.map((p) => ({ ...p, niveau_id: 'n1' })),
      { niveaux: [{ id: 'n1', ordre: 0 }], pieces: [{ id: 'pc-1', ordre: 0 }] },
    )
    // On n'exporte que deux des trois photos, dans le désordre : les numéros restent ceux de l'affaire
    const deux = [photos.find((p) => p.id === 'f1'), photos.find((p) => p.id === 'f2')]
    const elementsExport = elementsAExporter({ pieces: [sejour], points, elements })
    const l = relire(genererDxfEdl({ pieces: [sejour], elementsExport, points, photos: deux, unitesParMetre: 1 }))
    assert.deepEqual(textesDe(l, 'EDL-Photos').sort(), [`Ph ${deux[0].numero}`, `Ph ${deux[1].numero}`].sort())
    assert.deepEqual(photos.map((p) => [p.id, p.numero]), [['f3', 1], ['f2', 2], ['f1', 3]])
    assert.ok(textesDe(l, 'EDL-Photos').includes('Ph 2') && textesDe(l, 'EDL-Photos').includes('Ph 3'))
  })

  test('en millimètres : $INSUNITS 4, tout × 1000', () => {
    const elementsExport = elementsAExporter({ pieces: [sejour], points, elements })
    const l = relire(genererDxfEdl({ pieces: [sejour], elementsExport, unitesParMetre: 1000 }))
    assert.equal(l.unites, 4)
    const contour = l.traits.find((t) => t.calque === 'EDL-Pièces' && !t.bloc)
    assert.deepEqual(contour.pts, sejour.contour.map(([x, y]) => [x * 1000, y * 1000]))
    const radiateur = l.traits.find((t) => t.bloc === 'EDL_RADIATEUR')
    const attendu = primitivesPlacees('radiateur', { x: 1, y: 1, angle: 0 }).find((p) => p.polyligne)
    radiateur.pts.forEach((p, i) => prochePoint(p, [attendu.polyligne[i][0] * 1000, attendu.polyligne[i][1] * 1000], 1e-3))
    proche(l.textes.find((t) => t.texte === 'Séjour (1.04)').hauteur, 200)
    proche(l.textes.find((t) => t.texte === 'P1 · Radiateur fonte sous la').hauteur, 120)
  })

  test('coordonnées Lambert 93 (grands nombres) : position et forme gardées, en m comme en mm', () => {
    const X = 651234.567, Y = 6862345.678
    const piece = { ...sejour, contour: rectangle(X, Y, 5, 4, 15) }
    const point = { id: 'p', numero: 4, x: X + 2, y: Y + 1.5, type: 'lavabo', piece_id: piece.id }
    const elementsExport = elementsAExporter({ pieces: [piece], points: [point], elements: [] })
    for (const u of [1, 1000]) {
      const l = relire(genererDxfEdl({ pieces: [piece], elementsExport, unitesParMetre: u }))
      const contour = l.traits.find((t) => t.calque === 'EDL-Pièces' && !t.bloc)
      contour.pts.forEach((p, i) => prochePoint(p, [piece.contour[i][0] * u, piece.contour[i][1] * u], 1e-5 * u))
      const lavabo = l.traits.find((t) => t.bloc === 'EDL_LAVABO' && t.pts.length > 4)
      const attendu = primitivesPlacees('lavabo', { x: X + 2, y: Y + 1.5, angle: 15 }).find((p) => p.polyligne && p.polyligne.length === lavabo.pts.length)
      // Au millimètre près : la forme du symbole ne se déforme pas loin de l'origine
      lavabo.pts.forEach((p, i) => prochePoint(p, [attendu.polyligne[i][0] * u, attendu.polyligne[i][1] * u], 1e-3 * u))
      const xMin = Number(l.brut.match(/\$EXTMIN\r\n 10\r\n([^\r]+)\r\n/)[1])
      proche(xMin, Math.min(...piece.contour.map((c) => c[0])) * u, 1e-5 * u)
      const libelle = l.textes.find((t) => t.texte === 'P4 · Lavabo')
      assert.ok(pointDansPolygone([libelle.pos[0] / u, libelle.pos[1] / u], piece.contour))
    }
  })
})

describe('grands plans', () => {
  // 5 000 traits de 3 sommets : `push(...lignes)` dépassait la pile vers
  // 3 000 traits et bloquait l'aperçu comme le ZIP (relecture de l'essai)
  const traits = Array.from({ length: 5000 }, (_, i) => ({ calque: 'MURS', pts: [[i * 0.1, 0], [i * 0.1, 1], [i * 0.1 + 0.1, 1]], ferme: false }))
  for (const [u, insunits] of [[1, 6], [1000, 4]]) {
    test(`plan existant de 5 000 traits relu en entier (${u === 1 ? 'm' : 'mm'})`, () => {
      const l = relire(genererDxfEdl({ pieces: [sejour], unitesParMetre: u, plan: { traits, masses: [], textes: [] } }))
      assert.equal(l.unites, insunits)
      const murs = l.traits.filter((t) => t.calque === 'MURS')
      assert.equal(murs.length, 5000)
      assert.ok(murs.every((t) => t.pts.length === 3))
      prochePoint(murs[4999].pts[2], [500 * u, 1 * u], 1e-6 * u)
      assert.ok(l.traits.some((t) => t.calque === 'EDL-Pièces'))
    })
  }
})

describe('fiche proposée et HSP : la règle du rapport', () => {
  // Cas de la relecture : fiche proposée par l'analyse, HSP lue sur le plan
  const chambre = { id: 'pc-9', nom: 'Chambre', contour: rectangle(0, 0, 4, 4), fiche_a_valider: true, fiche: { sol: 'Moquette proposée', hsp: '2,70' }, hsp_lue: 2.5 }
  test('écartée : ni finitions ni HSP dite ; la HSP lue reste', () => {
    const l = relire(genererDxfEdl({ pieces: [chambre], unitesParMetre: 100 }))
    assert.equal(l.textes.some((t) => t.texte.includes('Moquette')), false)
    assert.deepEqual(textesDe(l, 'EDL-Pièces').filter((t) => t.startsWith('HSP')), ['HSP 2,50 m'])
  })
  test('incluse : finitions sur EDL-À valider, la HSP lue l’emporte toujours', () => {
    const l = relire(genererDxfEdl({ pieces: [chambre], unitesParMetre: 100, inclurePropositions: true }))
    assert.deepEqual(textesDe(l, CALQUE_A_VALIDER), ['Sol : Moquette proposée'])
    assert.deepEqual(textesDe(l, 'EDL-Pièces').filter((t) => t.startsWith('HSP')), ['HSP 2,50 m'])
  })
})
