// ─── Un passage de transcription des morceaux d'état des lieux ───────────────
//
// L'enchaînement seul (quoi lire, quand envoyer, quand effacer), sans
// navigateur ni Supabase : tout ce qui touche l'extérieur arrive par `d`.
// Le branchement réel est dans transcriptionEdl.js ; le passage est essayé
// avec une base et un appareil simulés (tests/etat-des-lieux-transcription-edl.test.js).
//
// Deux règles qui protègent l'audio, irremplaçable :
//   · un morceau ne s'efface qu'après l'écriture réussie de sa transcription ;
//   · une absence n'est une preuve que si les lectures marchent : une lecture
//     soumise aux règles RLS peut rendre zéro ligne sans erreur (session
//     expirée, compte sans droit). Avant d'effacer les morceaux d'une visite
//     introuvable, il faut une session et une lecture de la même affaire qui
//     rende quelque chose (une de ses visites, ou son état des lieux).

import {
  ligneTranscription, morceauxAPurger, visitePasEncoreEnvoyee, morceauTranscriptible, rienAEnvoyer,
  refusCompte, refusPassager, ecriturePassagere,
} from './transcriptionEdlLogique'

const erreurParDefaut = (code, message) => Object.assign(new Error(message), { code })

/**
 * @param visite `{ edlVisiteId }` ou null (toutes les visites)
 * @param d dépendances :
 *   enLigne() → booléen ; aSession() → booléen (jeton présent) ;
 *   lireMorceaux(visite) → morceaux de l'appareil ;
 *   visitesLocales() → identifiants des visites encore dans la file de l'appareil (lève si illisible) ;
 *   migrationPassee() → booléen (lève sur une autre erreur) ;
 *   visitesDansLaBase(ids) → Set des visites lues ;
 *   lecturesProuvees(affaireId) → vrai si une lecture de l'affaire rend au moins une ligne ;
 *   transcrire(morceau) → { texte, segments } ; enregistrer(ligne) → { indisponible } ;
 *   effacer(id), marquerEchec(morceau, { dernierEchec }), signaler(detail), maintenant(), estCoupure(err),
 *   erreur(code, message) → l'erreur rendue, messageIndisponible,
 *   echecsMax (ECHECS_MAX des comptes rendus, passé par l'appelant : ce
 *   module reste chargeable sans le client Supabase).
 * @returns { transcrits, purges, erreur }
 */
export async function passeTranscriptionEdl(visite, d) {
  const erreur = d.erreur ?? erreurParDefaut
  const echecsMax = d.echecsMax ?? 3
  let transcrits = 0
  let purges = 0
  const fin = (e = null) => ({ transcrits, purges, erreur: e })
  // Hors ligne, on ne lit rien et surtout on n'efface rien
  if (!d.enLigne()) return fin(erreur('reseau', 'hors ligne'))

  const morceaux = (await d.lireMorceaux(visite)).filter((m) => m.edlVisiteId != null)
  if (!morceaux.length) return fin()
  // Rien d'envoyable (morceaux mis de côté, en attente après un refus, sans
  // heure) ni de purgeable : aucune lecture en ligne. Le moteur de synchro
  // repasse chaque minute ; sans cela, il interrogeait la base à chaque fois
  if (rienAEnvoyer(morceaux, { maintenant: d.maintenant(), echecsMax })) return fin()

  // Sans session, les lectures rendraient des listes vides sans erreur :
  // ni décision, ni appel payant
  if (!(await d.aSession())) return fin(erreur('session', 'session'))

  // La file de l'appareil d'abord, la base ensuite : une visite qui quitte la
  // file entre les deux lectures est déjà dans la base, elle est vue d'un côté
  // ou de l'autre. Dans l'ordre inverse, elle pouvait échapper aux deux.
  let locales
  try { locales = await d.visitesLocales() } catch { locales = null }

  let enBase
  try {
    const ids = [...new Set(morceaux.map((m) => m.edlVisiteId))]
    const [passee, lues] = await Promise.all([d.migrationPassee(), d.visitesDansLaBase(ids)])
    if (!passee) return fin(erreur('indisponible', d.messageIndisponible ?? 'migration 082'))
    enBase = lues
  } catch (err) {
    return fin(d.estCoupure(err) ? erreur('reseau', err?.message ?? 'réseau') : err)
  }

  // File de l'appareil illisible : dans le doute, rien n'est effacé
  const candidats = locales === null ? [] : morceauxAPurger(morceaux, new Set([...enBase, ...locales]), d.maintenant())
  const prouvees = new Map()
  for (const m of candidats) {
    if (!m.affaireId || !d.enLigne()) continue
    if (!prouvees.has(m.affaireId)) {
      let ok
      try { ok = (await d.lecturesProuvees(m.affaireId)) === true } catch { ok = false }
      prouvees.set(m.affaireId, ok)
    }
    if (!prouvees.get(m.affaireId)) continue
    await d.effacer(m.id)
    purges += 1
    d.signaler({ morceauId: m.id, visiteId: m.edlVisiteId, purge: true })
  }

  const passager = (err) => erreur('passager', err?.message ?? 'service indisponible')
  const compterEchec = async (m) => {
    await d.marquerEchec(m, { dernierEchec: d.maintenant() })
    d.signaler({ morceauId: m.id, visiteId: m.edlVisiteId, refus: true })
  }
  const pasEncore = new Set()
  for (const m of morceaux) {
    // Visite pas encore dans la base (créée hors ligne, envoi en route) :
    // le morceau attend, aucun échec n'est compté
    if (!enBase.has(m.edlVisiteId) || pasEncore.has(m.edlVisiteId)) continue
    // Voulu : un morceau refusé trois fois reste sur l'appareil, jamais effacé
    // ni retenté de lui-même (chaque essai se paie). Il ne bloque plus
    // l'analyse (morceauxQuiBloquent) : la parole qu'il porte en est absente
    // tant que « Réessayer le son refusé » (relecture) ne l'a pas repris.
    // Un refus plus récent que ESPACEMENT_ECHECS_MS attend ; un morceau sans
    // heure ne se placerait dans aucune pièce : il reste.
    if (!morceauTranscriptible(m, { maintenant: d.maintenant(), echecsMax })) continue
    let ligne
    try {
      ligne = ligneTranscription(m, await d.transcrire(m))
    } catch (err) {
      // Mistral saturé ou en panne : le morceau n'y est pour rien, arrêt
      // sans rien compter (comme une coupure), reprise au déclencheur suivant
      if (refusPassager(err)) return fin(passager(err))
      if (refusCompte(err)) { await compterEchec(m); continue }
      return fin(err)
    }
    try {
      const ecrit = await d.enregistrer(ligne)
      if (ecrit?.indisponible) return fin(erreur('indisponible', d.messageIndisponible ?? 'migration 082'))
    } catch (err) {
      // Visite supprimée ou pas encore arrivée depuis la lecture : on attend
      if (visitePasEncoreEnvoyee(err)) { pasEncore.add(m.edlVisiteId); continue }
      if (d.estCoupure(err)) return fin(erreur('reseau', err?.message ?? 'réseau'))
      // Base en panne ou trop lente : rien contre le morceau
      if (ecriturePassagere(err)) return fin(passager(err))
      await compterEchec(m)
      continue
    }
    await d.effacer(m.id)
    transcrits += 1
    d.signaler({ morceauId: m.id, visiteId: m.edlVisiteId, transcrit: true })
  }
  return fin()
}
