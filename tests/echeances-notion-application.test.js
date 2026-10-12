// Échéances partagées avec Notion : application d'un plan, avec une base et
// un Notion simulés. Ce qui compte ici, c'est l'ordre des écritures entre
// deux appareils (réservation, création de carte, adresse notée). Données
// INVENTÉES : le dépôt est public.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { appliquerPlan } from '../src/shared/notion/appliquerSynchro.js'

const MAINTENANT = Date.parse('2026-10-12T12:00:00.000Z')
const ilYa = (minutes) => new Date(MAINTENANT - minutes * 60 * 1000).toISOString()

// Double du client Supabase : juste ce que appliquerPlan emploie. Un `update`
// remet `updated_at` à l'heure, comme le déclencheur de la migration 071.
function fausseBase(tables = {}) {
  let suivant = 1000
  const from = (nom) => {
    const t = (tables[nom] ??= [])
    let action = 'select'
    let valeurs = null
    let unique = null
    const filtres = []
    const garde = (l) => filtres.every((f) => f(l))
    const executer = () => {
      if (action === 'insert') {
        const lignes = (Array.isArray(valeurs) ? valeurs : [valeurs]).map((v) => ({ id: v.id ?? suivant++, updated_at: ilYa(0), ...v }))
        for (const l of lignes) {
          const doublon = t.some((x) => x.id === l.id
            || (nom === 'notion_echeances' && l.jalon_id != null && x.origine === l.origine && x.jalon_id === l.jalon_id))
          if (doublon) return { data: null, error: { code: '23505', message: 'doublon' } }
        }
        t.push(...lignes)
        return { data: unique ? lignes[0] : lignes, error: null }
      }
      if (action === 'update') {
        const touchees = t.filter(garde)
        for (const l of touchees) Object.assign(l, valeurs, { updated_at: ilYa(0) })
        return { data: touchees.map((l) => ({ id: l.id })), error: null }
      }
      if (action === 'upsert') {
        for (const v of valeurs) {
          const l = t.find((x) => x.id === v.id)
          if (l) Object.assign(l, v, { updated_at: ilYa(0) }); else t.push({ ...v })
        }
        return { data: null, error: null }
      }
      if (action === 'delete') {
        const parties = t.filter(garde)
        tables[nom] = t.filter((l) => !garde(l))
        return { data: parties.map((l) => ({ id: l.id })), error: null }
      }
      const lues = t.filter(garde).map((l) => ({ ...l }))
      if (unique === 'maybe') return { data: lues[0] ?? null, error: null }
      return { data: lues, error: null }
    }
    const b = {
      insert(v) { action = 'insert'; valeurs = v; return b },
      update(v) { action = 'update'; valeurs = v; return b },
      upsert(v) { action = 'upsert'; valeurs = v; return b },
      delete() { action = 'delete'; return b },
      select() { return b },
      eq(c, v) { filtres.push((l) => l[c] === v); return b },
      is(c, v) { filtres.push((l) => (l[c] ?? null) === v); return b },
      lt(c, v) { filtres.push((l) => Date.parse(l[c]) < Date.parse(v)); return b },
      in(c, vs) { filtres.push((l) => vs.includes(l[c])); return b },
      single() { unique = 'single'; return b },
      maybeSingle() { unique = 'maybe'; return b },
      then(ok, ko) { return Promise.resolve().then(executer).then(ok, ko) },
    }
    return b
  }
  return { from, tables }
}

// Double de Notion : enregistre chaque appel, crée des cartes numérotées ;
// `pendant(op, id)` simule ce que fait un autre appareil pendant l'appel.
function fauxNotion({ pendant = () => {}, echoue = () => false } = {}) {
  const appels = []
  let n = 0
  const ecrireCartes = async (operations) => {
    appels.push(operations)
    return operations.map((op) => {
      if (echoue(op)) return { ok: false, erreur: 'refus' }
      const id = op.action === 'creer' ? `carte-${++n}` : op.pageId
      pendant(op, id)
      return { ok: true, id, modifieLe: '2026-10-12T12:00:00.000Z' }
    })
  }
  return { ecrireCartes, appels, corbeilles: () => appels.flat().filter((o) => o.action === 'corbeille').map((o) => o.pageId) }
}

const ligneAttente = (extra = {}) => ({
  id: 'R', page_id: null, rang: 0, numero: '2698', reference: '2698 XYZ', affaire_id: 'a-chantier', origine: 'chantier',
  jalon_id: 7, libelle: 'OPR', libelle_app: 'OPR', date_synchro: '2026-10-20', texte_carte: '2698 XYZ – OPR 20/10/26',
  nb_dates: 1, notion_modifie_le: null, ...extra,
})
const creation = (ligneId = 'R') => ({ action: 'creer', ligneId, titre: '2698 XYZ – OPR 20/10/26', semaine: '2026-10-20' })
const planCreation = (ligne = ligneAttente(), nouvelle = true) => ({
  jalons: [], cartes: [creation(ligne.id)], registre: { ecrire: [{ ligne, nouvelle }], supprimer: [] },
})
const options = (base, notion) => ({ base, ecrireCartes: notion.ecrireCartes, maintenant: () => MAINTENANT })

test('application : un autre appareil a relié notre ligne à notre carte → la carte reste', async () => {
  const base = fausseBase()
  const notion = fauxNotion({
    pendant: (op, id) => { if (op.action === 'creer') base.tables.notion_echeances.find((l) => l.id === 'R').page_id = id },
  })
  const { erreurs } = await appliquerPlan(planCreation(), options(base, notion))
  assert.deepEqual(notion.corbeilles(), [])
  assert.deepEqual(erreurs, [])
  assert.equal(base.tables.notion_echeances[0].page_id, 'carte-1')
})

test('application : ligne supprimée ou liée à une autre carte entre-temps → notre carte part à la corbeille', async () => {
  const supprimee = fausseBase()
  const n1 = fauxNotion({ pendant: (op) => { if (op.action === 'creer') supprimee.tables.notion_echeances = [] } })
  await appliquerPlan(planCreation(), options(supprimee, n1))
  assert.deepEqual(n1.corbeilles(), ['carte-1'])

  const autre = fausseBase()
  const n2 = fauxNotion({
    pendant: (op) => { if (op.action === 'creer') autre.tables.notion_echeances.find((l) => l.id === 'R').page_id = 'carte-autre' },
  })
  await appliquerPlan(planCreation(), options(autre, n2))
  assert.deepEqual(n2.corbeilles(), ['carte-1'])
  assert.equal(autre.tables.notion_echeances[0].page_id, 'carte-autre')
})

test('application : même carte, identifiant écrit sans tirets → reconnue, gardée', async () => {
  const base = fausseBase()
  const notion = fauxNotion({
    pendant: (op) => { if (op.action === 'creer') base.tables.notion_echeances[0].page_id = 'CARTE1' },
  })
  // `carte-1` et `CARTE1` désignent la même carte une fois les tirets ôtés
  await appliquerPlan(planCreation(), options(base, notion))
  assert.deepEqual(notion.corbeilles(), [])
})

test('application : échéance déjà réservée par un autre appareil → aucune carte créée', async () => {
  const base = fausseBase({ notion_echeances: [ligneAttente({ id: 'R-autre', updated_at: ilYa(0) })] })
  const notion = fauxNotion()
  await appliquerPlan(planCreation(), options(base, notion))
  assert.deepEqual(notion.appels, [])
})

test('application : ligne en attente existante → carte créée seulement au bail échu', async () => {
  const sousBail = fausseBase({ notion_echeances: [ligneAttente({ updated_at: ilYa(1) })] })
  const n1 = fauxNotion()
  await appliquerPlan(planCreation(ligneAttente(), false), options(sousBail, n1))
  assert.deepEqual(n1.appels, [])

  const echu = fausseBase({ notion_echeances: [ligneAttente({ updated_at: ilYa(5) })] })
  const n2 = fauxNotion()
  await appliquerPlan(planCreation(ligneAttente(), false), options(echu, n2))
  assert.equal(n2.appels.length, 1)
  assert.equal(echu.tables.notion_echeances[0].page_id, 'carte-1')
})

test('application : premier passage de 25 cartes → chaque lot réservé juste avant, adresses notées avant le lot suivant', async () => {
  const lignes = Array.from({ length: 25 }, (_, i) => ligneAttente({ id: `R${i}`, jalon_id: 100 + i }))
  const plan = {
    jalons: [], cartes: lignes.map((l) => creation(l.id)),
    registre: { ecrire: lignes.map((ligne) => ({ ligne, nouvelle: true })), supprimer: [] },
  }
  const base = fausseBase()
  const etats = []
  const notion = fauxNotion()
  const ecrireCartes = async (ops) => {
    const reg = base.tables.notion_echeances ?? []
    etats.push({ taille: ops.length, reservees: reg.length, adressees: reg.filter((l) => l.page_id).length })
    return notion.ecrireCartes(ops)
  }
  await appliquerPlan(plan, { base, ecrireCartes, maintenant: () => MAINTENANT })
  assert.deepEqual(etats, [
    { taille: 10, reservees: 10, adressees: 0 },
    { taille: 10, reservees: 20, adressees: 10 },
    { taille: 5, reservees: 25, adressees: 20 },
  ])
  assert.equal(base.tables.notion_echeances.filter((l) => l.page_id).length, 25)
  assert.deepEqual(notion.corbeilles(), [])
})

test('application : modification de carte refusée → sa ligne du registre n’est pas réécrite', async () => {
  const avant = ligneAttente({ page_id: 'carte-x', date_synchro: '2026-10-20' })
  const apres = { ...avant, date_synchro: '2026-10-27', texte_carte: '2698 XYZ – OPR 27/10/26' }
  const plan = () => ({
    jalons: [], cartes: [{ action: 'modifier', pageId: 'carte-x', titre: apres.texte_carte, semaine: '2026-10-27', ligneIds: ['R'] }],
    registre: { ecrire: [{ ligne: apres, nouvelle: false }], supprimer: [] },
  })
  const refusee = fausseBase({ notion_echeances: [{ ...avant }] })
  const { erreurs } = await appliquerPlan(plan(), options(refusee, fauxNotion({ echoue: () => true })))
  assert.equal(refusee.tables.notion_echeances[0].date_synchro, '2026-10-20')
  assert.deepEqual(erreurs, ['refus'])

  const reussie = fausseBase({ notion_echeances: [{ ...avant }] })
  await appliquerPlan(plan(), options(reussie, fauxNotion()))
  assert.equal(reussie.tables.notion_echeances[0].date_synchro, '2026-10-27')
})
