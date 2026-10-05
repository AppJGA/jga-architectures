// Visite enregistrée, lot 0 : format audio, durées, bilan d'un essai.

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import {
  choisirFormat, extensionDe, dureeLisible, bilanEssai, regrouperTranches, dureeSourdine,
} from '../src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js'

describe('format', () => {
  test('AAC quand le navigateur sait le faire (Safari, Chrome sur iPad)', () => {
    assert.deepEqual(choisirFormat((t) => t.startsWith('audio/mp4')), { type: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' })
  })
  test('Opus en WebM sinon (Chrome sur ordinateur)', () => {
    assert.deepEqual(choisirFormat((t) => t.startsWith('audio/webm')), { type: 'audio/webm;codecs=opus', extension: 'webm' })
  })
  test('rien de reconnu : le navigateur choisit', () => {
    assert.deepEqual(choisirFormat(() => false), { type: '', extension: 'audio' })
  })
  test('extension d’un type rendu par le navigateur', () => {
    assert.equal(extensionDe('audio/mp4'), 'm4a')
    assert.equal(extensionDe('audio/webm;codecs=opus'), 'webm')
    assert.equal(extensionDe('audio/ogg'), 'ogg')
    assert.equal(extensionDe(''), 'audio')
  })
})

test('durée lisible', () => {
  assert.equal(dureeLisible(0), '0:00')
  assert.equal(dureeLisible(75.6), '1:15')
  assert.equal(dureeLisible(3725), '1:02:05')
  assert.equal(dureeLisible(-3), '0:00')
})

describe('bilan d’un essai', () => {
  const debut = Date.UTC(2026, 9, 6, 8, 0, 0)
  const s = (sec) => debut + sec * 1000
  const morceaux = [
    { rang: 1, debut: s(0), duree_s: 300, taille: 1_200_000, type: 'audio/mp4' },
    { rang: 2, debut: s(300), duree_s: 300, taille: 1_190_000, type: 'audio/mp4' },
    // coupure de 40 s (photo), puis reprise
    { rang: 3, debut: s(640), duree_s: 120, taille: 480_000, type: 'audio/mp4' },
  ]
  const evenements = [
    { t: s(0), type: 'demarrage' },
    { t: s(600), type: 'page-masquee' },
    { t: s(602), type: 'piste-terminee' },
    { t: s(640), type: 'reprise' },
    { t: s(760), type: 'arret' },
  ]
  const b = bilanEssai({
    debut, fin: s(760), morceaux, evenements,
    environnement: { navigateur: 'Safari iPad', installee: true, verrouEcran: 'obtenu', format: 'audio/mp4' },
  })

  test('durées enregistrée, écoulée, perdue', () => {
    assert.equal(b.dureeEnregistree, 720)
    assert.equal(b.dureeEcoulee, 760)
    assert.equal(b.perdue, 40)
  })
  test('les trous entre deux morceaux, au-delà de 2 s', () => {
    assert.deepEqual(b.trous, [{ apresRang: 2, duree_s: 40 }])
  })
  test('un texte à recopier, qui dit l’essentiel', () => {
    for (const attendu of ['Safari iPad', 'installée : oui', 'audio/mp4', '3 morceaux', '12:00', '12:40', 'perdu : 0:40', 'piste-terminee', 'Débit : 239 Ko par minute']) {
      assert.ok(b.texte.includes(attendu), attendu)
    }
  })
  test('un essai sans morceau ne plante pas', () => {
    const vide = bilanEssai({ debut, fin: s(10), morceaux: [], evenements: [], environnement: {} })
    assert.equal(vide.dureeEnregistree, 0)
    assert.deepEqual(vide.trous, [])
  })
})

describe('tranches recollées après une fermeture brutale', () => {
  const t = (rang, index) => ({ rang, index, debut: 1000 * rang, type: 'audio/mp4', blob: `${rang}-${index}` })

  test('par morceau, dans l’ordre des tranches', () => {
    const g = regrouperTranches([t(4, 2), t(3, 0), t(4, 0), t(4, 1)])
    assert.deepEqual(g.map((x) => [x.rang, x.duree_s, x.tranches.map((y) => y.index)]), [[3, 1, [0]], [4, 3, [0, 1, 2]]])
    assert.equal(g[1].debut, 4000)
  })

  test('sans sa première tranche (l’en-tête du fichier), un morceau est écarté', () => {
    assert.deepEqual(regrouperTranches([t(5, 1), t(5, 2)]), [])
  })
})

describe('sourdine (écran verrouillé brièvement)', () => {
  const t0 = Date.UTC(2026, 9, 6, 13, 36, 26)
  const s = (sec) => t0 + sec * 1000
  // Essai réel de Victor : muet à +13 s, rétabli à +19 s
  const evenements = [
    { t: s(0), type: 'demarrage' }, { t: s(13), type: 'piste-muette' }, { t: s(13), type: 'page-masquee' },
    { t: s(18), type: 'page-visible' }, { t: s(19), type: 'piste-reprise' }, { t: s(27), type: 'arret' },
  ]

  test('le silence enregistré compte comme perdu', () => {
    const b = bilanEssai({ debut: s(0), fin: s(28), morceaux: [{ rang: 1, debut: s(0), duree_s: 26, taille: 81000 }], evenements, environnement: {} })
    assert.equal(b.muet, 6)
    assert.equal(b.perdue, 8)
    assert.ok(b.texte.includes('Micro en sourdine : 0:06'))
  })

  test('une sourdine qui finit par la coupure, ou encore ouverte à la fin', () => {
    assert.equal(dureeSourdine([{ t: s(10), type: 'piste-muette' }, { t: s(14), type: 'piste-terminee' }]), 4)
    assert.equal(dureeSourdine([{ t: s(10), type: 'piste-muette' }], s(15)), 5)
    assert.equal(dureeSourdine([]), 0)
  })
})
