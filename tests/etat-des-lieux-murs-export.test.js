// État des lieux : finitions de murs (migration 085) dans les exports —
// `tracesAExporter`, planche (millimètres, légende, dessin), DXF relu,
// tableaux (colonne « Mur »), relecture. Pièces et finitions inventées :
// aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { tracesAExporter } from '../src/modules/etude/etat-des-lieux/tracesEdl.js'
import { misePlanche, FINITION_PLANCHE } from '../src/modules/etude/etat-des-lieux/export/plancheEdl.js'
import { dessinerTraces, dessinerLegende, TRAIT } from '../src/modules/etude/etat-des-lieux/export/dessinPlancheEdl.js'
import { genererDxfEdl, encoderDxf, CALQUE_A_VALIDER, LARGEUR_FINITION, ECART_FINITION } from '../src/modules/etude/etat-des-lieux/export/exportDxfEdl.js'
import { decoderDxf, lireDxf, lireTablesDxf } from '../src/modules/etude/etat-des-lieux/dxfLecture.js'
import { lignesFinitionsMur, lignesTableau } from '../src/modules/etude/etat-des-lieux/export/tableauxEdlLogique.js'
import { avertissementsExport } from '../src/modules/etude/etat-des-lieux/export/exportFenetreLogique.js'
import { finitionsRelecture, lireSaisieFinition } from '../src/modules/etude/etat-des-lieux/analyse/relectureAnalyseLogique.js'
import { champsValidationTrace, ecartTrace } from '../src/modules/etude/etat-des-lieux/analyse/analyseDonneesLogique.js'
import { COULEUR_PROPOSITION } from '../src/modules/etude/etat-des-lieux/export/rapportEdlLogique.js'

const proche = (a, b, ecart = 1e-6) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)
const niveau = { id: 'n1', nom: 'RDC' }
// Salle d'eau de 4 m × 3 m
const contour = [[0, 0], [4, 0], [4, 3], [0, 3]]
const salle = { id: 'p1', niveau_id: 'n1', numero: '1', nom: 'Salle d’eau', contour, fiche: { murs: 'Peinture blanche' }, fiche_a_valider: false }
const finition = (id, champs = {}) => ({
  id, sorte: 'finition', niveau_id: 'n1', piece_id: 'p1', xa: 0, ya: 0, xb: 4, yb: 0, valeur: 'Faïence toute hauteur', statut: 'deposer',
  origine: 'ia', a_valider: false, ...champs,
})
const fBas = finition('f1')
const fDroit = finition('f2', { xa: 4, ya: 0, xb: 4, yb: 3 })
const fCredence = finition('f3', { xa: 0, ya: 3, xb: 0, yb: 0, valeur: 'Crédence inox', statut: null })
const fProposee = finition('f4', { xa: 4, ya: 3, xb: 0, yb: 3, valeur: 'Lambris', a_valider: true })

describe('tracesAExporter : finitions de murs', () => {
  test('validées par défaut, propositions sur demande, avec statut et entrée de couleur', () => {
    const sortie = tracesAExporter({ traces: [fBas, fProposee] })
    assert.equal(sortie.length, 1)
    assert.deepEqual(sortie[0], {
      id: 'f1', sorte: 'finition', niveauId: 'n1', pieceId: 'p1', a: [0, 0], b: [4, 0], valeur: 'Faïence toute hauteur', aValider: false,
      statut: 'deposer', finition: { code: 'faience', libelle: 'Faïence murale', nom: 'Faïence', couleur: '#C62828' },
    })
    const avec = tracesAExporter({ traces: [fBas, fProposee], inclurePropositions: true })
    assert.deepEqual(avec.map((t) => [t.id, t.aValider]), [['f1', false], ['f4', true]])
  })
  test('sans texte ou mur nul : omise ; statut inconnu → null', () => {
    assert.deepEqual(tracesAExporter({ traces: [finition('x', { valeur: '  ' }), finition('y', { xb: 0 })] }), [])
    assert.equal(tracesAExporter({ traces: [finition('z', { statut: 'a-preciser' })] })[0].statut, null)
  })
})

describe('planche : finitions en millimètres et légende', () => {
  const planche = (traces, inclurePropositions = false) => misePlanche({
    niveau, pieces: [salle], traces: tracesAExporter({ traces, inclurePropositions }), inclurePropositions, date: '2026-11-20',
  })
  test('trait de 1,2 mm, son axe à 1 mm du mur dans la pièce, couleur de la finition', () => {
    const m = planche([fBas])
    const t = m.traces.find((x) => x.sorte === 'finition')
    assert.equal(t.epaisseur, 1.2)
    assert.deepEqual(FINITION_PLANCHE, { epaisseur: 1.2, ecart: 1 })
    assert.equal(t.couleur, '#C62828')
    // Le mur du bas, sur le papier (y vers le bas), et le trait 1 mm au-dessus
    const k = m.transform.mmParMetre
    const [o, c] = [m.transform.origineM, m.transform.origineMm]
    const yMur = c[1] - (0 - o[1]) * k
    proche(t.a[1], yMur - 1, 1e-3)
    proche(t.b[1], yMur - 1, 1e-3)
    proche(t.b[0] - t.a[0], 4 * k, 1e-3)
  })
  test('une entrée de légende par finition présente, de sa couleur ; propositions exclues par défaut', () => {
    const m = planche([fBas, fDroit, fCredence, fProposee])
    const g = m.legende.groupes.find((x) => x.calque === 'finitions')
    assert.deepEqual(g.entrees, [
      { code: null, libelle: 'Faïence murale', trace: 'finition', couleur: '#C62828' },
      { code: null, libelle: 'Crédence', trace: 'finition', couleur: '#E0A800' },
    ])
    assert.ok(!m.traces.some((t) => t.id === 'f4'))
    assert.ok(!m.legende.groupes.some((x) => x.calque === 'a-valider'))
  })
  test('avec les propositions : en bleu, et leur entrée « à valider »', () => {
    const m = planche([fProposee], true)
    assert.equal(m.traces[0].couleur, COULEUR_PROPOSITION)
    assert.ok(!m.legende.groupes.some((x) => x.calque === 'finitions'))
    assert.deepEqual(m.legende.groupes.find((x) => x.calque === 'a-valider').entrees,
      [{ code: null, libelle: 'Finition de mur proposée, à valider', trace: 'finition-proposee' }])
  })
  test('sans finition : pas de groupe « Finitions »', () => {
    assert.ok(!planche([]).legende.groupes.some((x) => x.calque === 'finitions'))
  })

  // Contexte qui note les traits (couleur, épaisseur, bouts)
  function enregistreur() {
    const appels = []
    const c = {}
    const ctx = new Proxy(c, {
      get: (cible, nom) => (nom in cible ? cible[nom] : (...args) => { appels.push({ nom, args, strokeStyle: cible.strokeStyle, lineWidth: cible.lineWidth, lineCap: cible.lineCap }); return nom === 'measureText' ? { width: 10 } : undefined }),
      set: (cible, nom, v) => { cible[nom] = v; return true },
    })
    return { ctx, appels }
  }
  test('dessin : la finition avant les liaisons et cotes, 1,2 mm de large, bouts nets', () => {
    const m = planche([fBas])
    const { ctx, appels } = enregistreur()
    dessinerTraces(ctx, m.traces, { pxParMm: 10 })
    const trait = appels.find((a) => a.nom === 'stroke')
    assert.equal(trait.strokeStyle, '#C62828')
    proche(trait.lineWidth, TRAIT.finition * 10)
    assert.equal(trait.lineCap, 'butt')
  })
  test('légende dessinée : le trait de la finition dans sa couleur', () => {
    const m = planche([fBas])
    const { ctx, appels } = enregistreur()
    dessinerLegende(ctx, m.legende, { pxParMm: 10 })
    assert.ok(appels.some((a) => a.nom === 'stroke' && a.strokeStyle === '#C62828' && Math.abs(a.lineWidth - 12) < 1e-9))
    assert.ok(appels.some((a) => a.nom === 'fillText' && a.args[0] === 'Faïence murale'))
  })
})

describe('DXF : finitions sur EDL-Finitions', () => {
  const relire = (texte) => {
    const decode = decoderDxf(encoderDxf(texte))
    return { ...lireDxf(decode), ...lireTablesDxf(decode), brut: decode }
  }
  test('polyligne de largeur constante, décalée dans la pièce, unité du plan', () => {
    const texte = genererDxfEdl({ niveau, pieces: [salle], traces: tracesAExporter({ traces: [fBas] }), unitesParMetre: 100 })
    const lu = relire(texte)
    const traits = lu.traits.filter((t) => t.calque === 'EDL-Finitions' && t.pts.length === 2)
    assert.equal(traits.length, 1)
    const [a, b] = traits[0].pts
    proche(a[1], ECART_FINITION * 100)
    proche(b[1], ECART_FINITION * 100)
    proche(Math.abs(b[0] - a[0]), 400)
    // Largeur constante : codes 40 et 41 de l'en-tête de la POLYLINE
    const lignes = texte.split('\r\n')
    const i = lignes.findIndex((l, k) => l === 'POLYLINE' && lignes[k + 2] === 'EDL-Finitions')
    const entete = lignes.slice(i, i + 20)
    const valeur = (code) => entete[entete.findIndex((l, k) => k % 2 === 1 && Number(l) === code) + 1]
    proche(Number(valeur(40)), LARGEUR_FINITION * 100)
    proche(Number(valeur(41)), LARGEUR_FINITION * 100)
  })
  test('proposition sur « EDL-À valider », seulement si demandée', () => {
    const sans = relire(genererDxfEdl({ niveau, pieces: [salle], traces: tracesAExporter({ traces: [fProposee] }) }))
    assert.ok(!sans.traits.some((t) => t.calque === CALQUE_A_VALIDER))
    const avec = relire(genererDxfEdl({ niveau, pieces: [salle], traces: tracesAExporter({ traces: [fProposee], inclurePropositions: true }), inclurePropositions: true }))
    const t = avec.traits.find((x) => x.calque === CALQUE_A_VALIDER && x.pts.length === 2)
    proche(t.pts[0][1], 3 - ECART_FINITION)
  })
})

describe('tableaux : colonne « Mur »', () => {
  const exportees = (traces, inclurePropositions = false) => tracesAExporter({ traces, inclurePropositions })
  test('« Faïence : 2 murs (toute hauteur) », statut, regroupée ; autre finition à part', () => {
    assert.deepEqual(lignesFinitionsMur(exportees([fBas, fDroit, fCredence])), [
      { texte: 'Faïence : 2 murs (toute hauteur)', statut: 'deposer', rubrique: 'finition-mur', aValider: false },
      { texte: 'Crédence : 1 mur (inox)', statut: 'a-preciser', rubrique: 'finition-mur', aValider: false },
    ])
    // Statuts différents : deux lignes ; finition sans nom connu : son texte
    assert.deepEqual(lignesFinitionsMur(exportees([fBas, finition('f5', { statut: 'conserver' }), finition('f6', { valeur: 'Pierre apparente' })])).map((l) => l.texte),
      ['Faïence : 1 mur (toute hauteur)', 'Faïence : 1 mur (toute hauteur)', 'Pierre apparente : 1 mur'])
    assert.equal(lignesFinitionsMur(exportees([finition('f7', { valeur: 'faïence' })]))[0].texte, 'Faïence : 1 mur')
  })
  test('sous la finition générale de la pièce ; propositions exclues par défaut', () => {
    const [ligne] = lignesTableau({ pieces: [salle], traces: exportees([fBas, fDroit, fProposee], true) })
    assert.deepEqual(ligne.mur.map((m) => m.texte), ['Peinture blanche', 'Faïence : 2 murs (toute hauteur)'])
    const [avec] = lignesTableau({ pieces: [salle], traces: exportees([fBas, fProposee], true), inclurePropositions: true })
    assert.deepEqual(avec.mur.map((m) => [m.texte, !!m.aValider]), [['Peinture blanche', false], ['Faïence : 1 mur (toute hauteur)', false], ['Lambris : 1 mur', true]])
  })
})

describe('fenêtre d’export et relecture', () => {
  test('les finitions à valider sont signalées', () => {
    const donnees = { niveaux: [{ id: 'n1', nom: 'RDC', unites_par_metre: 1 }], pieces: [salle], points: [], elements: [], traces: [fProposee] }
    const av = avertissementsExport({ donnees, reglages: { niveaux: ['n1'], inclurePropositions: false }, enLigne: true })
    assert.ok(av.includes('1 finition de mur à valider ne sera pas exportée.'), av.join(' / '))
  })
  test('finitions de la pièce, propositions d’abord', () => {
    const autre = finition('f9', { piece_id: 'p2' })
    assert.deepEqual(finitionsRelecture([fBas, fProposee, autre, { id: 'c', sorte: 'cote', piece_id: 'p1' }], 'p1').map((t) => t.id), ['f4', 'f1'])
    assert.deepEqual(finitionsRelecture([fBas], null), [])
  })
  test('saisie : texte exigé, en capitale, statut lu', () => {
    assert.deepEqual(lireSaisieFinition({ valeur: ' faïence  mi-hauteur ', statut: 'rafraichir' }), { valeur: 'Faïence mi-hauteur', statut: 'rafraichir' })
    assert.equal(lireSaisieFinition({ valeur: 'Lambris', statut: '' }).statut, null)
    assert.match(lireSaisieFinition({ valeur: ' ' }).erreur, /finition/)
  })
  test('valider ou modifier : texte et statut ; écarter : la finition part', () => {
    assert.deepEqual(champsValidationTrace(fProposee), { a_valider: false })
    assert.deepEqual(champsValidationTrace(fProposee, { valeur: 'Lambris bois', statut: 'conserver' }), { a_valider: false, valeur: 'Lambris bois', statut: 'conserver' })
    assert.deepEqual(champsValidationTrace(fProposee, { statut: 'x' }), { a_valider: false, statut: null })
    assert.deepEqual(ecartTrace(fProposee), { supprimer: true })
  })
})
