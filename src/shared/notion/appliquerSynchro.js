// ─── Échéances partagées avec Notion : application d'un plan ─────────────────
//
// Ordre : échéances des plannings, lignes nouvelles du registre, cartes par
// lots de 10 (chaque carte à créer réservée juste avant son lot, son adresse
// notée juste après), puis le reste du registre. Une ligne dont l'écriture
// liée a échoué reste telle quelle, pour que le passage suivant reprenne la
// même décision. La base et Notion sont passés en paramètres : testé avec des
// doubles (tests/echeances-notion-application.test.js).

import { CHAMPS_DETACHE } from '../../modules/chantier/planning/jalonsAncres.js'
import { CHAMPS_DETACHE_ETUDE } from '../../modules/etude/planning/jalonsAncresEtude.js'
import { COULEUR_NOTION } from './codesAffaire.js'
import { BAIL_MS } from './synchroNotionLogique.js'

const TABLE = { etude: 'planning_etude_jalons', chantier: 'planning_jalons' }
const DETACHE = { etude: CHAMPS_DETACHE_ETUDE, chantier: CHAMPS_DETACHE }

/**
 * Applique un plan de `planSynchro`. `base` : le client Supabase (ou son
 * double dans les tests) ; `ecrireCartes(operations)` : les écritures Notion,
 * un résultat par opération ; `maintenant()` : l'heure, en millisecondes.
 */
export async function appliquerPlan(plan, { base, ecrireCartes, maintenant = () => Date.now() }) {
  const erreurs = []
  let changementsApp = 0
  const echecs = new Set()   // lignes du registre dont une écriture liée a échoué : on n'y touche pas

  // (i) Échéances des plannings
  const jalonCree = new Map()   // ligneId → id de l'échéance créée
  for (const op of plan.jalons) {
    const table = TABLE[op.origine]
    let reponse
    if (op.action === 'creer') {
      const champs = { affaire_id: op.affaire_id, label: op.label, couleur: COULEUR_NOTION, ordre: 0 }
      if (op.origine === 'etude') Object.assign(champs, { semaine: op.semaine, annee: op.annee })
      else champs.date = op.date
      reponse = await base.from(table).insert(champs).select('id').single()
      if (!reponse.error) jalonCree.set(op.ligneId, reponse.data.id)
    } else if (op.action === 'deplacer') {
      const champs = op.origine === 'etude' ? { semaine: op.semaine, annee: op.annee } : { date: op.date }
      reponse = await base.from(table).update({ ...champs, ...(op.decrocher ? DETACHE[op.origine] : {}) }).eq('id', op.id).select('id')
    } else if (op.action === 'renommer') {
      reponse = await base.from(table).update({ label: op.label }).eq('id', op.id).select('id')
    } else {
      reponse = await base.from(table).delete().eq('id', op.id).select('id')
    }
    // Un refus RLS ne rend pas d'erreur : seule une ligne rendue prouve l'écriture
    const touchee = op.action === 'creer' ? !reponse.error : (reponse.data?.length ?? 0) > 0
    if (reponse.error) erreurs.push(reponse.error.message)
    if (touchee) changementsApp++
    else if (op.action !== 'supprimer' || reponse.error) { if (op.ligneId != null) echecs.add(op.ligneId) }
  }

  const ligneAvecJalon = (ligne) => (jalonCree.has(ligne.id) ? { ...ligne, jalon_id: jalonCree.get(ligne.id) } : ligne)
  const creations = new Set(plan.cartes.filter((c) => c.action === 'creer').map((c) => c.ligneId))

  // (ii) Lignes nouvelles. Celles d'une carte à créer ne sont réservées que
  // juste avant leur lot (iii) : le bail de deux minutes court à partir de là.
  const aReserver = new Map()
  const existantes = []
  for (const { ligne, nouvelle } of plan.registre.ecrire) {
    if (echecs.has(ligne.id)) continue
    const l = ligneAvecJalon(ligne)
    if (!nouvelle) { existantes.push(l); continue }
    if (creations.has(l.id)) { aReserver.set(l.id, l); continue }
    const { error } = await base.from('notion_echeances').insert(l)
    if (error && error.code !== '23505') erreurs.push(error.message)
  }

  // Une carte à créer exige une ligne qu'on vient d'insérer ou une ligne en
  // attente prise à bail : sans cela, deux appareils créeraient chacun la leur.
  const ecrites = new Map(existantes.map((l) => [l.id, l]))
  const bailPris = new Set()
  const reserver = async (c) => {
    const nouvelle = aReserver.get(c.ligneId)
    if (nouvelle) {
      const { error } = await base.from('notion_echeances').insert(nouvelle)
      // 23505 : un autre appareil a déjà réservé cette échéance ; il crée la carte
      if (error && error.code !== '23505') erreurs.push(error.message)
      return !error
    }
    const champs = ecrites.get(c.ligneId) ?? { texte_carte: c.titre }
    const sansId = { ...champs }
    delete sansId.id
    const limite = new Date(maintenant() - BAIL_MS).toISOString()
    const { data, error } = await base.from('notion_echeances').update(sansId).eq('id', c.ligneId).is('page_id', null).lt('updated_at', limite).select('id')
    if (error) { erreurs.push(error.message); return false }
    if (data?.length !== 1) return false
    bailPris.add(c.ligneId)
    return true
  }

  // (iv) Adresse d'une carte créée, seulement si sa ligne l'attend encore.
  // Sinon on relit la ligne : un autre appareil a pu la relier à cette même
  // carte (rien à faire) ; la carte n'est de trop que si la ligne a disparu ou
  // désigne une autre carte. Dans le doute, on garde la carte : une carte en
  // double se voit et se rattrape, une échéance effacée non.
  const noterAdresse = async (c, r) => {
    const { data, error } = await base.from('notion_echeances').update({ page_id: r.id, notion_modifie_le: r.modifieLe })
      .eq('id', c.ligneId).is('page_id', null).select('id')
    if (error) { erreurs.push(error.message); return }
    if (data?.length) return
    const relue = await base.from('notion_echeances').select('page_id, synchro_id:id').eq('id', c.ligneId).maybeSingle()
    if (relue.error) { erreurs.push(relue.error.message); return }
    const pageLigne = relue.data?.page_id ?? null
    if (relue.data && !pageLigne) { erreurs.push('adresse de la carte non notée'); return }
    if (relue.data && memeCarte(pageLigne, r.id)) return
    const [retrait] = await ecrireCartes([{ action: 'corbeille', pageId: r.id }])
    if (!retrait?.ok) erreurs.push(retrait?.erreur ?? 'carte en double')
  }

  // (iii) Cartes, par lots de 10 (un appel au passeur) : chaque lot réserve
  // ses lignes, écrit, puis note les adresses avant le lot suivant. Un premier
  // passage peut compter des centaines de cartes : écrire les adresses à la
  // fin laisserait expirer les bails et un autre appareil prendrait les lignes.
  const operations = plan.cartes.filter((c) => c.action !== 'creer'
    || !(echecs.has(c.ligneId) || echecsCreation(plan, jalonCree, c.ligneId)))
  for (let i = 0; i < operations.length; i += 10) {
    const partantes = []
    for (const c of operations.slice(i, i + 10)) {
      if (c.action !== 'creer' || await reserver(c)) partantes.push(c)
    }
    if (!partantes.length) continue
    const resultats = await ecrireCartes(partantes)
    for (const [k, c] of partantes.entries()) {
      const r = resultats[k]
      if (!r?.ok) {
        erreurs.push(r?.erreur ?? 'carte')
        if (c.action === 'creer') echecs.add(c.ligneId)
        else (c.ligneIds ?? []).forEach((id) => echecs.add(id))
      } else if (c.action === 'creer') {
        await noterAdresse(c, r)
      }
    }
  }

  // (v) Le reste du registre, sauf les lignes dont une écriture liée a échoué
  const aSupprimer = plan.registre.supprimer.filter((id) => !echecs.has(id))
  if (aSupprimer.length) {
    const { error } = await base.from('notion_echeances').delete().in('id', aSupprimer)
    if (error) erreurs.push(error.message)
  }
  const aMettreAJour = existantes.filter((l) => !echecs.has(l.id) && !bailPris.has(l.id) && !creations.has(l.id))
  if (aMettreAJour.length) {
    const { error } = await base.from('notion_echeances').upsert(aMettreAJour, { onConflict: 'id' })
    if (error) erreurs.push(error.message)
  }
  return { erreurs, changementsApp }
}

// Notion rend ses identifiants avec tirets ; on compare sans
const memeCarte = (a, b) => String(a ?? '').replace(/-/g, '').toLowerCase() === String(b ?? '').replace(/-/g, '').toLowerCase()

// Création d'échéance ratée : sa ligne n'a pas d'échéance, donc pas de carte
const echecsCreation = (plan, jalonCree, ligneId) =>
  plan.jalons.some((o) => o.action === 'creer' && o.ligneId === ligneId) && !jalonCree.has(ligneId)
