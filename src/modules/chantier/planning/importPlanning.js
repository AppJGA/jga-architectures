// ─── Importer un planning de chantier depuis une autre affaire ───────────────
//
// Deux affaires se ressemblent souvent : refaire à la main un planning déjà
// monté ailleurs prend des heures. L'import recopie la trame — tâches,
// segments, liaisons, jalons, zones — dans l'affaire d'accueil.
//
// Trois règles tiennent tout le fichier :
//
//   · **Les dates glissent en jours ouvrés.** On donne la date de démarrage
//     voulue ; l'écart avec celle de l'origine est compté hors week-ends et
//     fermetures, comme dans `decalage.js`, dont on réutilise les fonctions.
//     Laisser la date d'origine donne une copie aux mêmes dates.
//   · **Rien n'est effacé.** Ce qui arrive se range à la suite de l'existant
//     (`ordre` repris après le dernier), et l'avancement repart à zéro : on
//     importe une trame, pas l'état d'avancement d'un autre chantier.
//   · **Les identifiants doivent être remappés.** Une dépendance désigne ses
//     tâches par leur identifiant interne, qui sera tout autre une fois la
//     ligne recréée. Ce fichier ne calcule donc pas les nouveaux identifiants
//     (la base les attribue) : il garde ceux de l'origine dans des champs
//     `*Origine`, et `appliquerImport` fait la correspondance au fil des
//     insertions.
//
// Ce qui n'est PAS copié :
//   · les congés et fermetures (`periodes_bloquees`) — ce sont des dates du
//     calendrier propres à l'affaire, et la table est **commune au planning
//     d'étude et à celui de chantier** : les recopier polluerait l'autre ;
//   · l'avancement, remis à zéro (voir plus haut).

import { debutActuel, ecartOuvre, decalerDate } from './decalage'

/** Rapprochement des lots et des zones par leur nom, pas par leur numéro :
 *  le lot 3 de deux affaires n'est presque jamais le même métier.
 *  Les ligatures sont défaites avant les accents : « œ » est une lettre à part
 *  entière, que `NFD` ne décompose pas — sans quoi « Gros œuvre » et
 *  « Gros oeuvre » resteraient deux lots différents. */
export const cleNom = (nom) => String(nom ?? '')
  .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .trim().toLowerCase().replace(/\s+/g, ' ')

const maxOrdre = (lignes) => lignes.reduce((m, l) => Math.max(m, Number(l?.ordre) || 0), 0)

// Colonnes recopiées telles quelles. `avancement` en est volontairement absent
// (remis à zéro), ainsi que tout ce qui est remappé ou calculé.
const COLONNES_TACHE_COPIEES = [
  'num_tache', 'nom', 'duree',
  'appro_actif', 'appro_duree', 'appro_materiau', 'delai_apres', 'label_apres',
]
const COLONNES_SEGMENT_COPIEES = ['duree_jours', 'delai_appro', 'nom', 'afficher_nom']

const reprendre = (ligne, colonnes) => Object.fromEntries(
  colonnes.filter((c) => ligne[c] !== undefined).map((c) => [c, ligne[c]])
)

/**
 * @param source   planning lu dans l'affaire d'origine :
 *                 { taches, segments, dependances, jalons, zones, lots }
 * @param existant ce que contient déjà l'affaire d'accueil : { taches, zones, lots }
 * @param nouveauDebut 'YYYY-MM-DD', ou null pour garder les dates d'origine
 * @param periodes fermetures de l'affaire d'accueil (pour compter les jours ouvrés)
 * @returns null si la source n'a aucune tâche, sinon le plan d'import complet
 */
export function preparerImport({ source, existant = {}, nouveauDebut = null, periodes = [] }) {
  const taches = source?.taches ?? []
  if (!taches.length) return null

  const segments = source.segments ?? []
  const dependances = source.dependances ?? []
  const jalons = source.jalons ?? []
  const zonesSource = source.zones ?? []
  const lotsSource = source.lots ?? []

  const tachesCibles = existant.taches ?? []
  const zonesCibles = existant.zones ?? []
  const lotsCibles = existant.lots ?? []

  // 1. Décalage, en jours ouvrés
  const ancienDebut = debutActuel({ tasks: taches, segments })
  const ecart = nouveauDebut && ancienDebut
    ? ecartOuvre(ancienDebut, nouveauDebut, periodes)
    : 0
  const bouger = (date) => (ecart === 0 ? String(date).split('T')[0] : decalerDate(date, ecart, periodes))

  // 2. Zones : réutiliser celle qui porte déjà ce nom, sinon la créer
  const zoneParNom = new Map(zonesCibles.map((z) => [cleNom(z.nom), z.id]))
  let ordreZone = maxOrdre(zonesCibles)
  const zones = zonesSource.map((z) => {
    const existante = zoneParNom.get(cleNom(z.nom)) ?? null
    return {
      origine: z.id,
      existante,
      ligne: existante ? null : { nom: z.nom, couleur: z.couleur, ordre: ++ordreZone },
    }
  })

  // 3. Lots : même rapprochement par nom. Le numéro ne peut pas être repris
  // tel quel — `unique(affaire_id, numero)` le refuserait dès qu'il est pris.
  const lotParNom = new Map(lotsCibles.map((l) => [cleNom(l.nom), l.id]))
  let numeroLibre = lotsCibles.reduce((m, l) => Math.max(m, Number(l?.numero) || 0), 0)
  let ordreLot = maxOrdre(lotsCibles)
  const lots = lotsSource.map((l) => {
    const existante = lotParNom.get(cleNom(l.nom)) ?? null
    return {
      origine: l.id,
      existante,
      ligne: existante ? null : {
        numero: ++numeroLibre, nom: l.nom, couleur: l.couleur, ordre: ++ordreLot,
      },
    }
  })

  // Seuls les lots et zones réellement utilisés méritent d'être créés : une
  // affaire d'origine peut en porter que le planning n'emploie pas.
  const zonesUtilisees = new Set([
    ...taches.map((t) => t.zone_id), ...segments.map((s) => s.zone_id),
  ].filter(Boolean))
  const lotsUtilises = new Set(taches.map((t) => t.lot_id).filter(Boolean))
  const zonesRetenues = zones.filter((z) => zonesUtilisees.has(z.origine))
  const lotsRetenus = lots.filter((l) => lotsUtilises.has(l.origine))

  // 4. Tâches. `depends_on` reste exprimé en identifiants d'origine ; il n'est
  // gardé que si la tâche parente fait elle aussi partie de l'import.
  const idsTaches = new Set(taches.map((t) => t.id))
  let ordreTache = maxOrdre(tachesCibles)
  const tachesPretes = taches
    .slice()
    .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
    .map((t) => ({
      origine: t.id,
      lotOrigine: lotsUtilises.has(t.lot_id) ? t.lot_id : null,
      zoneOrigine: zonesUtilisees.has(t.zone_id) ? t.zone_id : null,
      dependOrigine: idsTaches.has(t.depends_on) ? t.depends_on : null,
      lag_days: idsTaches.has(t.depends_on) ? (t.lag_days ?? 0) : null,
      ligne: {
        ...reprendre(t, COLONNES_TACHE_COPIEES),
        debut: bouger(t.debut),
        avancement: 0,
        ordre: ++ordreTache,
      },
    }))

  // 5. Segments : rattachés à leur tâche par l'identifiant d'origine
  const segmentsPrets = segments
    .filter((s) => idsTaches.has(s.tache_id))
    .map((s) => ({
      origine: s.id,
      tacheOrigine: s.tache_id,
      zoneOrigine: zonesUtilisees.has(s.zone_id) ? s.zone_id : null,
      ligne: {
        ...reprendre(s, COLONNES_SEGMENT_COPIEES),
        date_debut: bouger(s.date_debut),
        ordre: s.ordre ?? 0,
      },
    }))

  // 6. Dépendances : gardées seulement si leurs deux extrémités sont importées
  const idsSegments = new Set(segmentsPrets.map((s) => s.origine))
  const presente = (tacheId, segmentId) => (
    segmentId != null ? idsSegments.has(segmentId) : idsTaches.has(tacheId)
  )
  const dependancesPretes = dependances
    .filter((d) => presente(d.source_tache_id, d.source_segment_id)
      && presente(d.cible_tache_id, d.cible_segment_id))
    .map((d) => ({
      sourceTacheOrigine: d.source_segment_id != null ? null : d.source_tache_id,
      sourceSegmentOrigine: d.source_segment_id ?? null,
      cibleTacheOrigine: d.cible_segment_id != null ? null : d.cible_tache_id,
      cibleSegmentOrigine: d.cible_segment_id ?? null,
      lag_jours: d.lag_jours ?? 0,
    }))

  // 7. Jalons : aucune référence à remapper, seulement la date à décaler
  const jalonsPrets = jalons.map((j) => ({
    ligne: { label: j.label, date: bouger(j.date), couleur: j.couleur, ordre: j.ordre ?? 0 },
  }))

  return {
    ancienDebut,
    ecart,
    zones: zonesRetenues,
    lots: lotsRetenus,
    taches: tachesPretes,
    segments: segmentsPrets,
    dependances: dependancesPretes,
    jalons: jalonsPrets,
    resume: {
      taches: tachesPretes.length,
      segments: segmentsPrets.length,
      dependances: dependancesPretes.length,
      jalons: jalonsPrets.length,
      zonesCreees: zonesRetenues.filter((z) => z.ligne).length,
      lotsCrees: lotsRetenus.filter((l) => l.ligne).length,
      liaisons: tachesPretes.filter((t) => t.dependOrigine != null).length,
    },
  }
}

/** Résumé d'un planning source, pour la liste des affaires de la modale. */
export function resumerSource(source) {
  return {
    taches: source?.taches?.length ?? 0,
    jalons: source?.jalons?.length ?? 0,
    zones: source?.zones?.length ?? 0,
  }
}
