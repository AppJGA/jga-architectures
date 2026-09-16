// ─── File d'attente d'une visite hors ligne : logique pure ───────────────────
//
// Une modification faite sans réseau est appliquée tout de suite à l'écran et
// rangée dans une file. Deux règles tiennent l'ensemble :
//
//   · l'identifiant est décidé sur l'appareil (uuid), jamais par la base. Une
//     photo peut donc désigner sa remarque avant que l'une ou l'autre ne soit
//     partie, et un envoi rejoué deux fois écrit la même ligne ;
//   · l'ordre de création est l'ordre d'envoi. Créer puis modifier une
//     remarque ne s'inverse pas.
//
// Ce que la base calcule elle-même (numéro de remarque, copie du destinataire,
// clôture) manque tant que l'envoi n'a pas eu lieu : `numero` reste nul et
// l'écran affiche « n° en attente ».

import { estClos } from '../crLogique'

// Au-delà, l'iPad commence à peiner et la synchronisation devient longue :
// mieux vaut prévenir pendant la visite que perdre des photos au retour.
export const ALERTE_PHOTOS = 150

export const TYPES = {
  sectionCreer: 'section.creer',
  remarqueCreer: 'remarque.creer',
  remarqueModifier: 'remarque.modifier',
  suiviCreer: 'suivi.creer',
  presenceDefinir: 'presence.definir',
  photoAjouter: 'photo.ajouter',
  pastillePoser: 'pastille.poser',
}

// Trois échecs d'affilée : l'opération est mise de côté et signalée, plutôt
// que de bloquer indéfiniment la file derrière elle.
export const ESSAIS_MAX = 3

export function creerOperation(type, charge, { crId, id = null, creeLe = Date.now() } = {}) {
  return { id: id ?? crypto.randomUUID(), crId, type, charge, creeLe, essais: 0, erreur: null }
}

export function estEnEchec(op) {
  return (op?.essais ?? 0) >= ESSAIS_MAX
}

/** Opérations à envoyer, dans l'ordre, celles en échec mises de côté. */
export function aEnvoyer(operations) {
  return [...(operations ?? [])].filter((o) => !estEnEchec(o)).sort((a, b) => a.creeLe - b.creeLe)
}

/** Ce qu'affiche le bandeau : combien de modifications attendent, et quoi. */
export function resumeFile(operations) {
  const ops = operations ?? []
  const photos = ops.filter((o) => o.type === TYPES.photoAjouter).length
  const echecs = ops.filter(estEnEchec).length
  return {
    total: ops.length,
    photos,
    echecs,
    enAttente: ops.length - echecs,
    libelle: ops.length === 0
      ? 'Tout est enregistré'
      : `${ops.length} modification${ops.length > 1 ? 's' : ''} à envoyer${photos > 0 ? ` (dont ${photos} photo${photos > 1 ? 's' : ''})` : ''}`,
    alertePhotos: photos >= ALERTE_PHOTOS,
  }
}

// ─── Application d'une opération à l'état affiché ────────────────────────────

function remarqueLocale(champs, { id, crId, affaireId, parentId = null, sectionId = null, sousSectionId = null, ordre = 0 }) {
  return {
    id, cr_id: crId, affaire_id: affaireId, parent_id: parentId,
    section_id: sectionId, sous_section_id: sousSectionId, ordre,
    // La base les calcule à l'envoi : un numéro ne s'invente pas sur l'appareil
    numero: null, suivi_id: null, copie_destinataire: null, copie_zone: null,
    est_clos: champs.statut ? estClos({ statut: champs.statut }) : false,
    sous_remarques: [],
    created_at: new Date().toISOString(),
    ...champs,
  }
}

function majRemarque(sections, id, transformer) {
  const surListe = (liste) => (liste ?? []).map((r) => (r.id === id
    ? transformer(r)
    : { ...r, sous_remarques: (r.sous_remarques ?? []).map((sr) => (sr.id === id ? transformer(sr) : sr)) }))
  return sections.map((s) => ({
    ...s,
    directRemarques: surListe(s.directRemarques),
    sousSections: (s.sousSections ?? []).map((ss) => ({ ...ss, remarques: surListe(ss.remarques) })),
  }))
}

function ajouterRemarque(sections, remarque) {
  return sections.map((s) => {
    if (remarque.sous_section_id) {
      if (!(s.sousSections ?? []).some((ss) => ss.id === remarque.sous_section_id)) return s
      return {
        ...s,
        sousSections: s.sousSections.map((ss) => (ss.id === remarque.sous_section_id
          ? { ...ss, remarques: [...(ss.remarques ?? []), remarque] }
          : ss)),
      }
    }
    if (s.id !== remarque.section_id) return s
    return { ...s, directRemarques: [...(s.directRemarques ?? []), remarque] }
  })
}

function ajouterSuivi(sections, parentId, suivi) {
  return majRemarque(sections, parentId, (r) => ({ ...r, sous_remarques: [...(r.sous_remarques ?? []), suivi] }))
}

/**
 * Applique une opération de la file à l'état affiché, pour que l'écran montre
 * hors ligne ce que la base montrera après l'envoi.
 * @param etat { sections, presences, photos, pastilles }
 */
export function appliquerOperation(etat, op) {
  const { sections = [], presences = [], photos = [], pastilles = [] } = etat ?? {}
  const c = op.charge

  switch (op.type) {
    case TYPES.sectionCreer:
      return { ...etat, sections: [...sections, { ...c.section, sousSections: [], directRemarques: [] }] }

    case TYPES.remarqueCreer:
      return {
        ...etat,
        sections: ajouterRemarque(sections, remarqueLocale(c.champs, {
          id: c.id, crId: op.crId, affaireId: c.affaireId,
          sectionId: c.sectionId, sousSectionId: c.sousSectionId, ordre: c.ordre,
        })),
      }

    case TYPES.remarqueModifier:
      return {
        ...etat,
        sections: majRemarque(sections, c.id, (r) => ({
          ...r, ...c.champs,
          est_clos: c.champs.statut ? estClos({ statut: c.champs.statut }) : r.est_clos,
        })),
      }

    case TYPES.suiviCreer:
      return {
        ...etat,
        sections: ajouterSuivi(sections, c.parentId, remarqueLocale(c.champs, {
          id: c.id, crId: op.crId, affaireId: c.affaireId, parentId: c.parentId,
        })),
      }

    case TYPES.presenceDefinir:
      return { ...etat, presences: presences.map((p) => (p.id === c.presenceId ? { ...p, presence: c.presence } : p)) }

    case TYPES.photoAjouter:
      return { ...etat, photos: [...photos, { ...c.photo, cr_id: op.crId, remarque_id: c.remarqueId, ordre: c.ordre, locale: true }] }

    case TYPES.pastillePoser:
      return {
        ...etat,
        pastilles: [
          ...pastilles.filter((p) => p.remarque_id !== c.remarqueId),
          { id: c.id, cr_id: op.crId, remarque_id: c.remarqueId, plan_id: c.planId, version_id: c.versionId, x: c.x, y: c.y, locale: true },
        ],
      }

    default:
      return etat
  }
}

/**
 * État affiché hors ligne : l'instantané emporté, puis la file par-dessus.
 * Les opérations refusées par la base sont appliquées elles aussi — une
 * remarque écrite pendant la visite ne doit pas disparaître de l'écran ; le
 * bandeau dit à part ce qui n'est pas passé.
 */
export function etatAvecFile(instantane, operations) {
  const ordonnees = [...(operations ?? [])].sort((a, b) => a.creeLe - b.creeLe)
  return ordonnees.reduce(appliquerOperation, instantane)
}
