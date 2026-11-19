// État des lieux, lot 4 : fenêtre d'export (aperçu, noms des fichiers, ZIP).
// Ce que l'aperçu montre et ce que le ZIP contient sortent des mêmes
// fonctions ; on vérifie ici le découpage par étage, la numérotation commune
// des photos, la relecture du DXF pour le canevas et la vue.
// Données inventées : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { unzipSync } from 'fflate'

import { decoderDxf, lireDxf } from '../src/modules/etude/etat-des-lieux/dxfLecture.js'
import { encoderDxf } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import {
  COULEUR_PLAN_APERCU, alignementCanevas, clesAEvincer, clesAGarder, superposerAnalyse, avertissementsExport, boiteDessin, cleDxf, cleRapport, couleurCalqueApercu,
  deplacer, dessinDxf, dxfDuNiveau, exportPossible, fabriquerZip, fichiersDxf, nomFichierZip, nomsFichiersDxf, noteUniteArchicad,
  preparerExport, reglagesParDefaut, uniteEtage, versDessin, versEcran, vueAjustee, zoomer,
} from '../src/modules/etude/etat-des-lieux/export/exportFenetreLogique.js'
import { COULEUR_PROPOSITION } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'

const proche = (a, b, ecart = 1e-6) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)
const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]]

const affaire = { id: 'a1', code_affaire: '2699', nom: 'Maison d’essai' }
const date = new Date(2026, 10, 18, 10, 0)

function donneesEssai() {
  return {
    etat: { id: 'e1' },
    niveaux: [
      { id: 'n1', nom: 'RDC', ordre: 0, unites_par_metre: 100, chemin_vecteurs: 'a1/edl/v1.bin' },
      { id: 'n2', nom: 'R+1', ordre: 1, unites_par_metre: 100, chemin_vecteurs: null },
    ],
    pieces: [
      { id: 'p1', niveau_id: 'n1', nom: 'Séjour', numero: '01', ordre: 0, contour: carre(0, 0, 5), surface_lue: 25 },
      { id: 'p2', niveau_id: 'n2', nom: 'Chambre', numero: '11', ordre: 0, contour: carre(0, 0, 4), fiche_a_valider: true, fiche: { sol: 'Parquet' } },
    ],
    points: [
      { id: 'pt1', niveau_id: 'n1', piece_id: 'p1', numero: 1, type: 'radiateur', x: 1, y: 1 },
      { id: 'pt2', niveau_id: 'n2', piece_id: 'p2', numero: 2, type: null, x: 2, y: 2 },
      { id: 'pt3', niveau_id: 'n2', piece_id: 'p2', numero: 3, type: 'prise', x: 3, y: 1 },
    ],
    photos: [
      { id: 'ph-b', point_id: 'pt2', chemin: 'x', prise_le: '2026-11-17T10:00:00Z' },
      { id: 'ph-a', point_id: 'pt1', chemin: 'y', prise_le: '2026-11-17T11:00:00Z' },
      { id: 'ph-c', point_id: 'pt3', chemin: 'z', prise_le: '2026-11-17T09:00:00Z' },
    ],
    entrees: [{ piece_id: 'p1' }, { piece_id: 'p2' }],
    elements: [
      { id: 'el1', point_id: 'pt1', piece_id: 'p1', type: 'radiateur', calque: 'chauffage', libelle: 'Radiateur fonte', a_valider: false },
      { id: 'el2', point_id: 'pt2', piece_id: 'p2', type: 'fissure', calque: 'desordres', libelle: 'Fissure au plafond', a_valider: true },
    ],
  }
}

describe('réglages et clés', () => {
  test('par défaut : tous les étages, propositions écartées, plan et rapport', () => {
    const r = reglagesParDefaut(donneesEssai().niveaux)
    assert.deepEqual(r, { niveaux: ['n1', 'n2'], inclurePropositions: false, avecPlan: true, rapport: true, word: true })
    assert.ok(exportPossible(r))
    assert.ok(!exportPossible({ ...r, niveaux: [] }))
    assert.ok(!exportPossible(null))
  })

  test('la clé d’un DXF ne dépend que de l’étage, des propositions et du plan', () => {
    const r = reglagesParDefaut(donneesEssai().niveaux)
    assert.equal(cleDxf('n1', r, true), cleDxf('n1', { ...r, rapport: false, niveaux: ['n1'] }, true))
    assert.notEqual(cleDxf('n1', r, true), cleDxf('n1', r, false))
    assert.notEqual(cleDxf('n1', r, true), cleDxf('n1', { ...r, inclurePropositions: true }, true))
  })

  test('la clé du rapport suit les étages retenus (dans n’importe quel ordre) et les propositions', () => {
    const r = reglagesParDefaut(donneesEssai().niveaux)
    assert.equal(cleRapport(r), cleRapport({ ...r, niveaux: ['n2', 'n1'], avecPlan: false }))
    assert.notEqual(cleRapport(r), cleRapport({ ...r, niveaux: ['n1'] }))
    assert.notEqual(cleRapport(r), cleRapport({ ...r, inclurePropositions: true }))
  })
})

describe('preparerExport', () => {
  test('découpe par étage et numérote les photos une fois pour toute l’affaire', () => {
    const d = donneesEssai()
    const p = preparerExport(d, reglagesParDefaut(d.niveaux))
    assert.deepEqual(p.etages.map((e) => e.niveau.id), ['n1', 'n2'])
    const [rdc, etage] = p.etages
    assert.deepEqual(rdc.pieces.map((x) => x.id), ['p1'])
    assert.deepEqual(rdc.photos.map((ph) => [ph.id, ph.numero]), [['ph-a', 1]])
    // Étage, puis point, puis heure : pt2 avant pt3 au R+1
    assert.deepEqual(etage.photos.map((ph) => [ph.id, ph.numero]), [['ph-b', 2], ['ph-c', 3]])
    assert.equal(rdc.unite.insunits, 5)
    // Proposition écartée : pt2 n'a plus d'élément, pt3 typé devient un élément
    assert.deepEqual(etage.elementsExport.map((e) => e.id), ['point-pt3'])
    assert.deepEqual(rdc.elementsExport.map((e) => e.id), ['el1'])
  })

  test('un seul étage retenu : les photos gardent leur numéro de l’affaire', () => {
    const d = donneesEssai()
    const p = preparerExport(d, { ...reglagesParDefaut(d.niveaux), niveaux: ['n2'] })
    assert.deepEqual(p.etages.map((e) => e.niveau.id), ['n2'])
    assert.deepEqual(p.rapport.photos.map((ph) => ph.numero), [2, 3])
    assert.deepEqual(p.rapport.niveaux.map((n) => n.id), ['n2'])
    assert.deepEqual(p.rapport.pieces.map((x) => x.id), ['p2'])
    assert.deepEqual(p.rapport.points.map((x) => x.id), ['pt2', 'pt3'])
    // Les lignes edl_elements partent entières : le rapport y lit les propositions
    assert.equal(p.rapport.elements.length, 2)
    assert.ok(p.rapport.visitees.has('p2'))
  })

  test('les propositions incluses partent, sur le bon étage', () => {
    const d = donneesEssai()
    const p = preparerExport(d, { ...reglagesParDefaut(d.niveaux), inclurePropositions: true })
    const etage = p.etages[1]
    assert.deepEqual(etage.elementsExport.map((e) => [e.id, e.aValider]), [['el2', true], ['point-pt3', false]])
  })

  test('le DXF d’un étage porte ses photos numérotées et son unité', () => {
    const d = donneesEssai()
    const etage = preparerExport(d, reglagesParDefaut(d.niveaux)).etages[1]
    const lu = lireDxf(decoderDxf(encoderDxf(dxfDuNiveau(etage))))
    assert.equal(lu.unites, 5)
    const photos = lu.textes.filter((t) => t.calque === 'EDL-Photos').map((t) => t.texte).sort()
    assert.deepEqual(photos, ['Ph 2', 'Ph 3'])
    // Fiche à valider : finitions omises sans les propositions…
    assert.ok(!lu.textes.some((t) => t.texte.startsWith('Sol :')))
    // … et sur EDL-À valider avec elles
    const avec = lireDxf(dxfDuNiveau(etage, { inclurePropositions: true }))
    assert.ok(avec.textes.some((t) => t.calque === 'EDL-À valider' && t.texte === 'Sol : Parquet'))
  })
})

describe('noms des fichiers et ZIP', () => {
  test('ZIP, DXF par étage, DXF avec plan', () => {
    assert.equal(nomFichierZip(affaire, date), '2026-11-18-2699-etat-des-lieux.zip')
    const noms = nomsFichiersDxf(affaire, donneesEssai().niveaux, date)
    assert.deepEqual(noms.get('n1'), { edl: '2026-11-18-2699-RDC-EDL.dxf', avecPlan: '2026-11-18-2699-RDC-EDL-avec-plan.dxf' })
    assert.equal(noms.get('n2').edl, '2026-11-18-2699-R+1-EDL.dxf')
  })

  test('deux étages de même nom ne s’écrasent pas ; accents et espaces retirés', () => {
    const noms = nomsFichiersDxf(affaire, [
      { id: 'a', nom: 'Rez-de-chaussée' }, { id: 'b', nom: 'rez de chaussée' }, { id: 'c', nom: '' },
    ], date)
    assert.equal(noms.get('a').edl, '2026-11-18-2699-Rez-de-chaussee-EDL.dxf')
    assert.equal(noms.get('b').edl, '2026-11-18-2699-rez-de-chaussee-2-EDL.dxf')
    assert.equal(noms.get('c').edl, '2026-11-18-2699-etage-3-EDL.dxf')
    assert.equal(new Set([...noms.values()].map((n) => n.edl)).size, 3)
  })

  test('le ZIP rend chaque fichier à l’identique', async () => {
    const d = donneesEssai()
    const etage = preparerExport(d, reglagesParDefaut(d.niveaux)).etages[0]
    const texte = dxfDuNiveau(etage)
    const pdf = new Uint8Array([37, 80, 68, 70, 45])
    // Les octets d'un DXF sont cédés au worker : on compare au texte d'origine
    const zip = await fabriquerZip([{ nom: 'a-EDL.dxf', octets: encoderDxf(texte) }, { nom: 'rapport.pdf', octets: pdf }])
    const relu = unzipSync(zip)
    assert.deepEqual(Object.keys(relu).sort(), ['a-EDL.dxf', 'rapport.pdf'])
    assert.deepEqual([...relu['rapport.pdf']], [...pdf])
    assert.equal(decoderDxf(relu['a-EDL.dxf']), decoderDxf(encoderDxf(texte)))
  })

  test('un gros DXF passe par le worker (zip asynchrone) et revient intact', async () => {
    // Au-delà de 160 000 octets, fflate compresse hors du fil principal
    const texte = '  0\r\nLINE\r\n  8\r\nMURS\r\n'.repeat(40000)
    const zip = await fabriquerZip([{ nom: 'gros.dxf', octets: encoderDxf(texte) }])
    assert.equal(decoderDxf(unzipSync(zip)['gros.dxf']), texte)
  })

  test('DXF du ZIP : un plan illisible ne coûte que le DXF avec le plan de son étage', async () => {
    const d = donneesEssai()
    const prep = preparerExport(d, reglagesParDefaut(d.niveaux))
    const etages = prep.etages.map((e) => ({ ...e, niveau: { ...e.niveau, chemin_vecteurs: `${e.niveau.id}.json.gz` } }))
    const noms = nomsFichiersDxf(affaire, d.niveaux, date)
    const etapes = []
    const r = await fichiersDxf({
      etages, noms, avecPlan: true, surEtape: (t) => etapes.push(t),
      obtenirTexte: async (etage, avecPlan) => {
        if (avecPlan && etage.niveau.id === etages[0].niveau.id) throw new Error('fichier vectoriel introuvable')
        return dxfDuNiveau(etage)
      },
    })
    assert.deepEqual(r.fichiers.map((f) => f.nom), [
      noms.get(etages[0].niveau.id).edl, noms.get(etages[1].niveau.id).edl, noms.get(etages[1].niveau.id).avecPlan,
    ])
    assert.equal(r.avertissements.length, 1)
    assert.match(r.avertissements[0], /plan existant illisible \(fichier vectoriel introuvable\), DXF avec le plan non fabriqué/)
    assert.ok(r.fichiers.every((f) => f.octets instanceof Uint8Array && f.octets.length > 0))
    assert.ok(etapes.length >= 3)
    // Le DXF à fusionner, lui, reste indispensable
    await assert.rejects(fichiersDxf({ etages, noms, obtenirTexte: async () => { throw new Error('panne') } }), /panne/)
  })

  test('unité de chaque étage pour ArchiCAD : cm, m, mm, et la note qui la dit', () => {
    assert.deepEqual([100, 1, 1000, null].map((u) => uniteEtage({ unites_par_metre: u })), ['cm', 'm', 'mm', 'm'])
    assert.equal(noteUniteArchicad([{ nom: 'RDC', unites_par_metre: 100 }]), 'L’unité de ce plan est le centimètre : choisissez-la si ArchiCAD la demande.')
    assert.equal(noteUniteArchicad([{ unites_par_metre: 1000 }, { unites_par_metre: 1000 }]), 'L’unité de ces plans est le millimètre : choisissez-la si ArchiCAD la demande.')
    assert.equal(
      noteUniteArchicad([{ nom: 'RDC', unites_par_metre: 100 }, { nom: 'R+1', unites_par_metre: 1 }]),
      'Unité à choisir si ArchiCAD la demande : RDC en centimètres, R+1 en mètres.',
    )
    assert.equal(noteUniteArchicad([]), null)
  })
})

describe('avertissements', () => {
  test('propositions écartées comptées sur les étages retenus, fiches à valider', () => {
    const d = donneesEssai()
    const r = reglagesParDefaut(d.niveaux)
    assert.deepEqual(avertissementsExport({ donnees: d, reglages: r }), [
      '1 élément à valider ne sera pas exporté.',
      '1 fiche de pièce à valider : finitions non exportées.',
    ])
    assert.deepEqual(avertissementsExport({ donnees: d, reglages: { ...r, inclurePropositions: true } }), [])
    assert.deepEqual(avertissementsExport({ donnees: d, reglages: { ...r, niveaux: ['n1'] } }), [])
  })

  test('pluriel, unité inhabituelle et réseau absent', () => {
    const d = donneesEssai()
    d.elements.push({ id: 'el3', point_id: 'pt3', piece_id: 'p2', type: 'prise', a_valider: true })
    d.niveaux[0].unites_par_metre = 39.37
    const a = avertissementsExport({ donnees: d, reglages: reglagesParDefaut(d.niveaux), enLigne: false })
    assert.equal(a[0], 'L’export demande du réseau (photos, plans).')
    assert.ok(a.includes('2 éléments à valider ne seront pas exportés.'))
    assert.ok(a.some((t) => t.startsWith('Étage RDC : unité du plan inhabituelle (39,37 par mètre)') && t.includes('« cm »')))
  })
})

describe('aperçu du DXF', () => {
  test('relu par calque : EDL- en couleur et d’abord, le plan en gris', () => {
    const d = donneesEssai()
    const etage = preparerExport(d, { ...reglagesParDefaut(d.niveaux), inclurePropositions: true }).etages[1]
    const plan = {
      traits: [{ calque: 'MURS', pts: [[-1, -1], [6, -1]], ferme: false }, { calque: 'Cloisons', pts: [[0, 0], [0, 4], [4, 4]], ferme: false }],
      masses: [],
      textes: [{ calque: 'MURS', texte: 'Façade', pos: [0, -1.5], hauteur: 0.2 }],
    }
    const dessin = dessinDxf(decoderDxf(encoderDxf(dxfDuNiveau(etage, { plan, inclurePropositions: true }))))
    const noms = dessin.calques.map((c) => c.nom)
    assert.equal(noms[0], 'EDL-Pièces')
    assert.ok(noms.indexOf('EDL-À valider') > noms.indexOf('EDL-Électricité'))
    assert.ok(noms.indexOf('MURS') > noms.indexOf('EDL-À valider'))
    assert.deepEqual(noms.slice(-2), ['MURS', 'Cloisons'])
    const murs = dessin.calques.find((c) => c.nom === 'MURS')
    assert.equal(murs.couleur, COULEUR_PLAN_APERCU)
    assert.equal(murs.edl, false)
    assert.equal(dessin.calques.find((c) => c.nom === 'EDL-À valider').couleur, COULEUR_PROPOSITION)
    // Boîte en unités du fichier (cm) : le trait du plan va de -100 à 600
    proche(dessin.boite.x0, -100)
    proche(dessin.boite.x1, 600)
    assert.equal(dessin.unites, 5)
    // Les textes centrés de la pièce gardent leur alignement pour le canevas
    const nom = dessin.calques[0].textes.find((t) => t.texte.startsWith('Chambre'))
    assert.deepEqual(alignementCanevas(nom), { textAlign: 'center', textBaseline: 'middle' })
  })

  test('couleurs : calque connu, proposition, plan', () => {
    assert.deepEqual(couleurCalqueApercu('EDL-Désordres'), { couleur: '#8E44AD', edl: true })
    assert.equal(couleurCalqueApercu('EDL-Pièces').edl, true)
    assert.deepEqual(couleurCalqueApercu('A-WALL'), { couleur: COULEUR_PLAN_APERCU, edl: false })
    assert.deepEqual(alignementCanevas({}), { textAlign: 'left', textBaseline: 'alphabetic' })
  })

  test('boîte sans les calques masqués, null si rien', () => {
    const calques = [
      { nom: 'A', traits: [{ pts: [[0, 0], [10, 0]] }], textes: [] },
      { nom: 'B', traits: [], textes: [{ pos: [50, 50] }] },
    ]
    assert.deepEqual(boiteDessin(calques), { x0: 0, y0: 0, x1: 50, y1: 50 })
    assert.deepEqual(boiteDessin(calques, new Set(['B'])), { x0: 0, y0: 0, x1: 10, y1: 0 })
    assert.equal(boiteDessin(calques, new Set(['A', 'B'])), null)
  })
})

describe('vue du canevas', () => {
  test('ajustée : la boîte tient dans le cadre, centrée, y vers le haut', () => {
    const v = vueAjustee({ x0: 0, y0: 0, x1: 100, y1: 50 }, 448, 248, 24)
    proche(v.echelle, 4)
    const [ax, ay] = versEcran(v, [0, 0])
    const [bx, by] = versEcran(v, [100, 50])
    proche(ax, 24); proche(bx, 424)
    assert.ok(by < ay, 'le haut du dessin est en haut de l’écran')
    proche((ay + by) / 2, 124)
  })

  test('un point fixe sous le zoom, aller-retour écran / dessin', () => {
    const v = vueAjustee({ x0: -3, y0: 2, x1: 7, y1: 9 }, 300, 200)
    const z = zoomer(v, 2.5, 120, 80)
    const avant = versDessin(v, [120, 80])
    const apres = versDessin(z, [120, 80])
    proche(avant[0], apres[0]); proche(avant[1], apres[1])
    proche(z.echelle, v.echelle * 2.5)
    const d = deplacer(z, 10, -5)
    const [x, y] = versEcran(d, [1, 1])
    const [x0, y0] = versEcran(z, [1, 1])
    proche(x - x0, 10); proche(y - y0, -5)
  })

  test('dessin vide ou réduit à un point : pas d’échelle infinie', () => {
    const v = vueAjustee(null, 200, 100)
    assert.deepEqual(v, { echelle: 1, tx: 100, ty: 50 })
    const p = vueAjustee({ x0: 5, y0: 5, x1: 5, y1: 5 }, 200, 100)
    assert.ok(Number.isFinite(p.echelle))
  })
})

describe('correctifs (tour 1)', () => {
  test('mémoire bornée : rapport et DXF de l’écran, dessin visible, ce qu’un export attend', () => {
    const d = donneesEssai()
    const r = reglagesParDefaut(d.niveaux)
    const differe = { ...r, inclurePropositions: true }
    const g = clesAGarder({
      reglages: [r, differe, null], etageVisible: 'n1', dessinVisible: cleDxf('n1', differe, true),
      retenues: [cleDxf('n2', r, false), cleRapport({ ...r, niveaux: ['n2'] })],
    })
    assert.deepEqual([...g.rapport].sort(), [cleRapport(r), cleRapport(differe), cleRapport({ ...r, niveaux: ['n2'] })].sort())
    assert.ok(g.dxf.has(cleDxf('n1', r, false)) && g.dxf.has(cleDxf('n1', r, true)) && g.dxf.has(cleDxf('n1', differe, true)))
    assert.ok(g.dxf.has(cleDxf('n2', r, false)))
    assert.ok(!g.dxf.has(cleDxf('n2', r, true)))
    assert.deepEqual([...g.dessins], [cleDxf('n1', differe, true)])
    // PDF et Word décochés : plus de rapport gardé ; étage décoché : plus de DXF
    const sans = clesAGarder({ reglages: [{ ...r, rapport: false, word: false, niveaux: ['n2'] }], etageVisible: 'n1' })
    assert.equal(sans.rapport.size, 0)
    assert.equal(sans.dxf.size, 0)
    // Le Word seul se fabrique depuis le rapport : il reste gardé
    assert.equal(clesAGarder({ reglages: [{ ...r, rapport: false }] }).rapport.size, 1)
  })

  test('éviction : seulement les entrées réglées hors de la liste', () => {
    const entrees = new Map([
      ['a', { regle: true }], ['b', { regle: false }], ['c', { regle: true }], ['d', 'dessin'],
    ])
    assert.deepEqual(clesAEvincer(entrees, new Set(['c'])), ['a', 'd'])
    assert.deepEqual(clesAEvincer(new Map(), new Set()), [])
  })

  test('le PDF est rangé sans compression, les DXF compressés', async () => {
    const pdf = new Uint8Array(20000) // des zéros : très compressibles
    const dxf = new TextEncoder().encode('  0\r\nLINE\r\n'.repeat(2000))
    const zip = await fabriquerZip([{ nom: 'r.pdf', octets: pdf }, { nom: 'a.dxf', octets: dxf.slice() }])
    // Stocké tel quel : l'archive dépasse la taille du PDF seul
    assert.ok(zip.length > pdf.length)
    const seulDxf = await fabriquerZip([{ nom: 'a.dxf', octets: dxf.slice() }])
    assert.ok(seulDxf.length < dxf.length / 5)
    const relu = unzipSync(zip)
    assert.equal(relu['r.pdf'].length, 20000)
    assert.deepEqual([...relu['a.dxf']], [...dxf])
    // Le Word (un ZIP lui-même) est rangé tel quel, comme le PDF
    const docx = new Uint8Array(20000)
    assert.ok((await fabriquerZip([{ nom: 'r.docx', octets: docx }])).length > docx.length)
  })

  test('les champs frais de l’analyse recouvrent les pièces lues', () => {
    const pieces = [
      { id: 'p1', nom: 'Séjour', fiche: { sol: 'ancien' }, fiche_a_valider: true, hsp_lue: null },
      { id: 'p2', nom: 'Cuisine', fiche: null },
    ]
    const fraiches = [{ id: 'p1', fiche: { sol: 'Parquet' }, fiche_a_valider: false, hsp_lue: 2.5, analyse_le: '2026-11-18T09:00:00Z', updated_at: 'x' }]
    const r = superposerAnalyse(pieces, fraiches)
    assert.deepEqual(r[0], { id: 'p1', nom: 'Séjour', fiche: { sol: 'Parquet' }, fiche_a_valider: false, hsp_lue: 2.5, analyse_le: '2026-11-18T09:00:00Z' })
    assert.equal(r[1], pieces[1])
    // Sans la 082 : rien de relu, rien de changé
    assert.deepEqual(superposerAnalyse(pieces, []), pieces)
  })

  test('unité du plan inconnue : DXF en mètres', () => {
    const d = donneesEssai()
    d.niveaux[1].unites_par_metre = null
    const a = avertissementsExport({ donnees: d, reglages: { ...reglagesParDefaut(d.niveaux), inclurePropositions: true } })
    assert.deepEqual(a, ['Unité du plan inconnue : DXF en mètres (étage R+1).'])
  })

  test('alignements 3, 4 et 5 : placés comme le lecteur les pose (second point)', () => {
    assert.equal(alignementCanevas({ alignH: 3, alignV: 0 }).textAlign, 'right')
    assert.equal(alignementCanevas({ alignH: 5, alignV: 0 }).textAlign, 'right')
    assert.deepEqual(alignementCanevas({ alignH: 4, alignV: 0 }), { textAlign: 'center', textBaseline: 'middle' })
  })
})
