// Analyseur réglementaire : lecture du DXF, demande préparée pour Claude et
// relecture de la réponse collée. L'analyse elle-même se fait dans Claude Code
// ou sur claude.ai — ce qui est testé ici, c'est ce que l'app fabrique avant,
// et ce qu'elle sait relire après.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  REGLEMENTATIONS, STATUTS, parseDxfBrut, construireContexte,
  construirePrompt, lireReponse,
} from '../src/tools/analyseur/analyseLogique.js'

// Un DXF minimal : chaque entité est une suite de paires (code, valeur).
const paires = (...couples) => couples.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'

const DXF = paires(
  [0, 'SECTION'], [2, 'ENTITIES'],
  [0, 'ARC'], [8, 'A-PORTE'], [40, '900'],
  [0, 'ARC'], [8, 'A-PORTE'], [40, '830'],
  [0, 'ARC'], [8, 'A-MUR'], [40, '20'],
  [0, 'LWPOLYLINE'], [8, 'A-CIRCULATION'], [10, '0'], [20, '0'], [10, '1200'], [20, '3000'],
  [0, 'LINE'], [8, 'A-ESCALIER'], [10, '0'], [20, '0'], [11, '0'], [21, '2500'],
  [0, 'MTEXT'], [8, 'A-TEXTE'], [1, '\\fArial;Couloir RDC'],
  [0, 'ENDSEC'], [0, 'EOF'],
)

describe('parseDxfBrut', () => {
  test('relève arcs, polylignes, lignes, textes et calques', () => {
    const p = parseDxfBrut(DXF)
    assert.equal(p.stats.nbArcs, 2, 'l\'arc de rayon 20 mm est sous le seuil')
    assert.equal(p.stats.nbPolylines, 1)
    assert.equal(p.stats.nbLines, 1)
    assert.equal(p.stats.nbTexts, 1)
    assert.deepEqual(p.layers.sort(), ['A-CIRCULATION', 'A-ESCALIER', 'A-MUR', 'A-PORTE', 'A-TEXTE'])
  })

  test('nettoie le formatage des annotations MTEXT', () => {
    assert.equal(parseDxfBrut(DXF).mtexts[0].text, 'Couloir RDC')
  })

  test('retire les codes ArchiCAD et réunit les paragraphes', () => {
    const lire = (t) => parseDxfBrut(paires([0, 'MTEXT'], [8, 'T'], [1, t])).mtexts[0]?.text
    assert.equal(lire('{\\fArial|b0|i0;Bureau 12}'), 'Bureau 12')
    assert.equal(lire('\\H2.5x;\\C1;WC PMR'), 'WC PMR')
    assert.equal(lire('Couloir\\PNiveau 1'), 'Couloir Niveau 1')
  })

  test('accepte les fins de ligne Windows', () => {
    const p = parseDxfBrut(DXF.replace(/\n/g, '\r\n'))
    assert.equal(p.stats.nbArcs, 2)
  })

  test('un fichier vide ne fait pas tomber la lecture', () => {
    const p = parseDxfBrut('')
    assert.equal(p.stats.nbArcs, 0)
    assert.deepEqual(p.layers, [])
  })
})

describe('construireContexte', () => {
  const contexte = construireContexte(parseDxfBrut(DXF), 'RDC.dxf')

  test('nomme le fichier et liste les calques', () => {
    assert.match(contexte, /=== FICHIER : RDC\.dxf ===/)
    assert.match(contexte, /· A-PORTE/)
  })

  test('donne les rayons de portes en mm et en m, du plus petit au plus grand', () => {
    assert.match(contexte, /830mm \(0\.83m\), 900mm \(0\.90m\)/)
  })

  test('convertit les espaces en mètres', () => {
    assert.match(contexte, /\[A-CIRCULATION\] 1\.20m × 3\.00m/)
  })
})

describe('construirePrompt', () => {
  test('reprend les données et les règles des réglementations retenues', () => {
    const prompt = construirePrompt(['=== FICHIER : RDC.dxf ==='], ['pmr'])
    assert.match(prompt, /=== FICHIER : RDC\.dxf ===/)
    assert.match(prompt, /\[PMR-003\] Largeur porte accessible/)
    // L'exemple de réponse cite ERP-001 ; ce qui compte est qu'aucune règle
    // ERP ne soit à vérifier.
    assert.doesNotMatch(prompt, /\[ERP-001\]/, 'ERP n\'était pas demandé')
  })

  test('combine plusieurs réglementations et plusieurs fichiers', () => {
    const prompt = construirePrompt(['PLAN A', 'PLAN B'], ['erp', 'logement'])
    assert.match(prompt, /PLAN A/)
    assert.match(prompt, /PLAN B/)
    assert.match(prompt, /ERP-005/)
    assert.match(prompt, /LOG-001/)
  })

  test('demande une réponse JSON, sans texte autour', () => {
    const prompt = construirePrompt(['X'], ['erp'])
    assert.match(prompt, /Réponds UNIQUEMENT avec un objet JSON valide/)
    assert.match(prompt, /"resultats"/)
  })

  test('une clé inconnue est ignorée plutôt que de tout casser', () => {
    assert.doesNotThrow(() => construirePrompt(['X'], ['erp', 'inexistant']))
  })
})

describe('lireReponse', () => {
  const REPONSE = {
    resultats: [
      {
        id: 'PMR-003', element: 'Largeur porte accessible', exigence: '≥ 0,90 m',
        valeur_mesuree: '0,83 m', statut: 'non_conforme', confiance: 75,
        remarque: 'Arc de 830 mm sur calque A-PORTE',
      },
    ],
  }

  test('lit un JSON nu', () => {
    const [r] = lireReponse(JSON.stringify(REPONSE))
    assert.equal(r.id, 'PMR-003')
    assert.equal(r.statut, 'non_conforme')
    assert.equal(r.confiance, 75)
    assert.equal(r.valeur_mesuree, '0,83 m')
  })

  test('lit un JSON entouré de phrases et d\'un bloc de code', () => {
    const colle = 'Voici mon analyse :\n\n```json\n' + JSON.stringify(REPONSE) + '\n```\n\nN\'hésite pas si besoin.'
    assert.equal(lireReponse(colle)[0].id, 'PMR-003')
  })

  test('s\'arrête au bon endroit quand du texte suit avec des accolades', () => {
    const colle = JSON.stringify(REPONSE) + '\n\nNote : la règle {PMR-004} reste à vérifier.'
    const res = lireReponse(colle)
    assert.equal(res.length, 1)
    assert.equal(res[0].id, 'PMR-003')
  })

  test('ne se laisse pas tromper par une accolade dans une chaîne', () => {
    const avecAccolade = { resultats: [{ ...REPONSE.resultats[0], remarque: 'Bloc {WC} détecté' }] }
    assert.equal(lireReponse(JSON.stringify(avecAccolade))[0].remarque, 'Bloc {WC} détecté')
  })

  test('accepte un tableau renvoyé sans enveloppe', () => {
    assert.equal(lireReponse(JSON.stringify(REPONSE.resultats))[0].id, 'PMR-003')
  })

  test('un statut inattendu devient « à vérifier »', () => {
    const bancal = { resultats: [{ id: 'X', statut: 'peut-être', confiance: 90 }] }
    assert.equal(lireReponse(bancal && JSON.stringify(bancal))[0].statut, 'a_verifier')
  })

  test('une confiance absente ne s\'affiche pas à 100 %', () => {
    const [sans] = lireReponse('{"resultats":[{"id":"X","statut":"conforme"}]}')
    assert.equal(sans.confiance, 50)
    const [aVerifier] = lireReponse('{"resultats":[{"id":"X"}]}')
    assert.equal(aVerifier.confiance, 20)
  })

  test('une confiance hors bornes est ramenée dans 0–100', () => {
    assert.equal(lireReponse('{"resultats":[{"id":"X","confiance":150}]}')[0].confiance, 100)
    assert.equal(lireReponse('{"resultats":[{"id":"X","confiance":-10}]}')[0].confiance, 0)
  })

  test('une ligne réduite à son identifiant reprend les libellés de la règle', () => {
    const [r] = lireReponse('{"resultats":[{"id":"PMR-005","statut":"conforme"}]}', ['pmr'])
    assert.equal(r.element, 'Espace retournement fauteuil')
    assert.equal(r.exigence, '⌀ ≥ 1,50 m')
  })

  test('une valeur absente devient « Non détecté »', () => {
    assert.equal(lireReponse('{"resultats":[{"id":"X"}]}')[0].valeur_mesuree, 'Non détecté')
  })

  test('refuse une réponse vide', () => {
    assert.throws(() => lireReponse('   '), /Aucune réponse collée/)
  })

  test('refuse un texte sans JSON', () => {
    assert.throws(() => lireReponse('Je ne peux pas analyser ces plans.'), /aucun bloc de résultats trouvé/)
  })

  test('distingue une copie coupée en route d\'un texte sans JSON', () => {
    assert.throws(
      () => lireReponse('{"resultats":[{"id":"PMR-003","element":"Porte"'),
      /coupé avant sa fin/,
    )
  })

  test('signale un JSON mal formé qui se referme quand même', () => {
    assert.throws(() => lireReponse('{"resultats": [oups]}'), /JSON est incomplet/)
  })

  test('refuse un JSON valide mais sans résultat', () => {
    assert.throws(() => lireReponse('{"resultats":[]}'), /aucun résultat/)
    assert.throws(() => lireReponse('{"autre":1}'), /aucun résultat/)
  })
})

describe('REGLEMENTATIONS', () => {
  test('chaque règle a un identifiant unique', () => {
    const ids = Object.values(REGLEMENTATIONS).flatMap(r => r.regles.map(x => x.id))
    assert.equal(new Set(ids).size, ids.length)
  })

  test('les statuts connus sont bien ceux qu\'affiche le tableau', () => {
    assert.deepEqual(STATUTS, ['conforme', 'non_conforme', 'a_verifier'])
  })
})
