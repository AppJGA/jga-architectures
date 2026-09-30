// ─── Importer un planning d'étude depuis une autre affaire ───────────────────
//
// Même intention qu'au chantier (`chantier/planning/importPlanning.js`), mais
// l'unité de temps change : le planning d'étude vit en **semaines ISO**, pas
// en dates. Le décalage se compte donc en semaines, avec `weeksBetween` et
// `addWeeks` — passer par des dates ferait perdre l'alignement sur le lundi.
//
// Le modèle est plus simple qu'au chantier : pas de lots, pas de zones, et
// pas de table de dépendances séparée — seul `depends_on` relie les phases.
// Comme au chantier, les identifiants d'origine sont conservés dans des champs
// `*Origine` et remappés à l'écriture, et les congés ne sont pas copiés (la
// table est commune aux deux plannings de l'affaire).

import { addWeeks, weeksBetween, getWeekStart, weekOfDate } from './types'

// La modale d'import est commune aux deux plannings : elle manipule des dates.
// Ces deux conversions font le pont avec les semaines ISO de l'étude.

/** { semaine, annee } → 'YYYY-MM-DD' : le lundi de cette semaine. */
export function dateDeSemaine(debut) {
  if (!debut) return ''
  const d = getWeekStart(debut.semaine, debut.annee)
  const deuxChiffres = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`
}

/** 'YYYY-MM-DD' → { semaine, annee } : n'importe quel jour vaut sa semaine. */
export function semaineDeDate(iso) {
  return iso ? weekOfDate(iso) : null
}

const maxOrdre = (lignes) => lignes.reduce((m, l) => Math.max(m, Number(l?.ordre) || 0), 0)

const COLONNES_PHASE_COPIEES = [
  'nom', 'type_tache', 'duree_semaines', 'label_barre', 'importance',
  'duree_arch', 'duree_bet', 'duree_econ', 'couleur_custom',
]
const COLONNES_SEGMENT_COPIEES = ['nom', 'duree_semaines']

const reprendre = (ligne, colonnes) => Object.fromEntries(
  colonnes.filter((c) => ligne[c] !== undefined).map((c) => [c, ligne[c]])
)

/** Première semaine du planning source, ou null. */
export function debutEtude(source) {
  const phases = source?.phases ?? []
  if (!phases.length) return null
  return phases.reduce((tot, p) => {
    const candidat = { semaine: p.semaine_debut, annee: p.annee_debut }
    if (!tot) return candidat
    if (candidat.annee !== tot.annee) return candidat.annee < tot.annee ? candidat : tot
    return candidat.semaine < tot.semaine ? candidat : tot
  }, null)
}

/**
 * @param source       { phases, segments, jalons } lus dans l'affaire d'origine
 * @param existant     { phases } de l'affaire d'accueil, pour la suite des `ordre`
 * @param nouveauDebut { semaine, annee } voulu, ou null pour garder l'origine
 */
export function preparerImportEtude({ source, existant = {}, nouveauDebut = null }) {
  const phases = source?.phases ?? []
  if (!phases.length) return null

  const segments = source.segments ?? []
  const jalons = source.jalons ?? []
  const phasesCibles = existant.phases ?? []

  const ancienDebut = debutEtude(source)
  const ecart = nouveauDebut && ancienDebut
    ? weeksBetween(ancienDebut.semaine, ancienDebut.annee, nouveauDebut.semaine, nouveauDebut.annee)
    : 0
  const bouger = (semaine, annee) => (ecart === 0
    ? { semaine, annee }
    : addWeeks(semaine, annee, ecart))

  const idsPhases = new Set(phases.map((p) => p.id))
  let ordre = maxOrdre(phasesCibles)

  const phasesPretes = phases
    .slice()
    .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
    .map((p) => {
      const { semaine, annee } = bouger(p.semaine_debut, p.annee_debut)
      return {
        origine: p.id,
        dependOrigine: idsPhases.has(p.depends_on) ? p.depends_on : null,
        lag_semaines: idsPhases.has(p.depends_on) ? (p.lag_semaines ?? 0) : null,
        ligne: {
          ...reprendre(p, COLONNES_PHASE_COPIEES),
          semaine_debut: semaine,
          annee_debut: annee,
          ordre: ++ordre,
        },
      }
    })

  const segmentsPrets = segments
    .filter((s) => idsPhases.has(s.phase_id))
    .map((s) => {
      const { semaine, annee } = bouger(s.semaine_debut, s.annee_debut)
      return {
        origine: s.id,
        phaseOrigine: s.phase_id,
        ligne: {
          ...reprendre(s, COLONNES_SEGMENT_COPIEES),
          semaine_debut: semaine,
          annee_debut: annee,
          ordre: s.ordre ?? 0,
        },
      }
    })

  const jalonsPrets = jalons.map((j) => {
    const { semaine, annee } = bouger(j.semaine, j.annee)
    return { ligne: { label: j.label, semaine, annee, couleur: j.couleur, ordre: j.ordre ?? 0 } }
  })

  return {
    ancienDebut,
    ecart,
    phases: phasesPretes,
    segments: segmentsPrets,
    jalons: jalonsPrets,
    resume: {
      phases: phasesPretes.length,
      segments: segmentsPrets.length,
      jalons: jalonsPrets.length,
      liaisons: phasesPretes.filter((p) => p.dependOrigine != null).length,
    },
  }
}

/** Résumé d'un planning d'étude source, pour la liste des affaires. */
export function resumerSourceEtude(source) {
  return {
    phases: source?.phases?.length ?? 0,
    jalons: source?.jalons?.length ?? 0,
  }
}
