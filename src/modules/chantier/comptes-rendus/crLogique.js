// ─── Comptes rendus de chantier : logique pure ───────────────────────────────
//
// Sans accès à la base ni à l'écran, pour être testée (tests/comptes-rendus.test.js).

// Date du jour au format 'YYYY-MM-DD', dans le fuseau de l'utilisateur.
// `toISOString()` donnait la date en temps universel : une visite créée entre
// minuit et 2 h du matin en France prenait la date de la veille.
export function dateDuJour(maintenant = new Date()) {
  const a = maintenant.getFullYear()
  const m = String(maintenant.getMonth() + 1).padStart(2, '0')
  const j = String(maintenant.getDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

// Présents à la réunion, retardataires compris. Les codes sont stockés en
// minuscules : la comparaison à 'P' faisait afficher 0 présent en permanence.
export function compterPresents(presences) {
  return (presences ?? []).filter((p) => p.presence === 'p' || p.presence === 'r').length
}

// Remarques principales encore ouvertes : ce sont elles, et elles seules, que
// la visite suivante reprend. Les suivis (sous-remarques) ne comptent pas.
export function compterPointsEnCours(remarques) {
  return (remarques ?? []).filter((r) => !r.est_clos && !r.parent_id).length
}

/**
 * Lignes à insérer pour reprendre la visite précédente dans un nouveau compte
 * rendu : toutes ses sections et sous-sections, ses remarques principales
 * non closes et leurs suivis.
 *
 * Les identifiants sont attribués ici (`nouvelId`) : les liens entre lignes
 * sont ainsi connus d'avance, et chaque niveau s'insère en une seule requête
 * au lieu d'une par ligne — une reprise ne peut plus s'arrêter à moitié sans
 * que l'erreur remonte.
 *
 * Une remarque reprise n'est pas « nouvelle » (▶) : le repère désigne ce qui
 * est apparu dans cette visite. Les suivis gardent leur état clos.
 *
 * @returns { sections, sousSections, remarques, sousRemarques }
 */
export function preparerReprise({ sections = [], sousSections = [], remarques = [], crId, affaireId, nouvelId }) {
  const idSection = new Map()
  const lignesSections = sections.map((s) => {
    const nouveau = nouvelId()
    idSection.set(s.id, nouveau)
    return {
      id: nouveau, cr_id: crId, numero_romain: s.numero_romain, titre: s.titre,
      ordre: s.ordre ?? 0, type_section: s.type_section ?? 'general',
    }
  })

  const idSousSection = new Map()
  const lignesSousSections = sousSections
    .filter((ss) => idSection.has(ss.section_id))
    .map((ss) => {
      const nouveau = nouvelId()
      idSousSection.set(ss.id, nouveau)
      return {
        id: nouveau, cr_id: crId, section_id: idSection.get(ss.section_id),
        code: ss.code, titre: ss.titre, ordre: ss.ordre ?? 0,
      }
    })

  const idRemarque = new Map()
  const lignesRemarques = []
  remarques
    .filter((r) => !r.parent_id && !r.est_clos)
    .forEach((r) => {
      const sousSectionId = r.sous_section_id ? idSousSection.get(r.sous_section_id) : null
      const sectionId = r.section_id ? idSection.get(r.section_id) ?? null : null
      // Rattachée à une sous-section ou une section qui n'existe plus : rien où la poser
      if (r.sous_section_id ? !sousSectionId : !sectionId) return
      const nouveau = nouvelId()
      idRemarque.set(r.id, nouveau)
      lignesRemarques.push({
        id: nouveau, cr_id: crId, affaire_id: affaireId,
        sous_section_id: sousSectionId ?? null, section_id: sectionId,
        lot_id: r.lot_id ?? null, interlocuteur_id: r.interlocuteur_id ?? null,
        // Le libellé d'un lot ou d'un interlocuteur supprimé depuis ; absent
        // tant que la migration 037 n'est pas passée
        ...(r.copie_destinataire !== undefined && { copie_destinataire: r.copie_destinataire }),
        date_note: r.date_note ?? null, pour: r.pour ?? null, description: r.description,
        statut: r.statut ?? null, date_echeance: r.date_echeance ?? null,
        est_important: !!r.est_important, est_clos: false, est_nouveau: false,
        ordre: r.ordre ?? 0,
      })
    })

  const lignesSousRemarques = remarques
    .filter((r) => r.parent_id && idRemarque.has(r.parent_id))
    .map((r) => ({
      id: nouvelId(), cr_id: crId, affaire_id: affaireId,
      parent_id: idRemarque.get(r.parent_id),
      date_note: r.date_note ?? null, pour: r.pour ?? null, description: r.description,
      est_clos: !!r.est_clos, est_nouveau: false, est_important: !!r.est_important,
    }))

  return {
    sections: lignesSections,
    sousSections: lignesSousSections,
    remarques: lignesRemarques,
    sousRemarques: lignesSousRemarques,
  }
}

// ─── Historique des participants ─────────────────────────────────────────────
//
// Chaque présence garde une copie du participant (colonnes `copie_*`, migration
// 037) : supprimer ensuite la fiche ne vide plus les anciens comptes rendus.

const COPIE_VIDE = {
  copie_type: null, copie_categorie: null, copie_categorie_label: null,
  copie_prenom: null, copie_nom: null, copie_fonction: null,
  copie_organisation: null, copie_adresse: null, copie_email: null,
  copie_telephone: null, copie_ordre: null,
  copie_lot_numero: null, copie_lot_nom: null, copie_entreprise: null,
}

/**
 * Copie à enregistrer pour une présence, depuis la fiche liée (jointures
 * `affaire_interlocuteurs` ou `lot_entreprises`). Null si aucune fiche.
 */
export function copiePresence(p) {
  const i = p.affaire_interlocuteurs
  if (p.interlocuteur_id && i) {
    return {
      ...COPIE_VIDE,
      copie_type: 'interlocuteur',
      copie_categorie: i.categorie ?? null, copie_categorie_label: i.categorie_label ?? null,
      copie_prenom: i.prenom ?? null, copie_nom: i.nom ?? null, copie_fonction: i.fonction ?? null,
      copie_organisation: i.organisation ?? null, copie_adresse: i.adresse ?? null,
      copie_email: i.email ?? null, copie_telephone: i.telephone ?? null, copie_ordre: i.ordre ?? null,
    }
  }
  const le = p.lot_entreprises
  if (p.lot_entreprise_id && le) {
    const contact = le.interlocuteurs ?? {}
    return {
      ...COPIE_VIDE,
      copie_type: 'entreprise',
      copie_lot_numero: le.lots?.numero ?? null, copie_lot_nom: le.lots?.nom ?? null,
      copie_entreprise: le.entreprises?.raison_sociale ?? null,
      copie_prenom: contact.prenom ?? null, copie_nom: contact.nom ?? null,
      copie_email: contact.email ?? le.entreprises?.email ?? null,
      copie_telephone: contact.telephone ?? le.entreprises?.telephone ?? null,
    }
  }
  return null
}

// La copie enregistrée diffère-t-elle de la fiche actuelle ?
export function copieAJour(p) {
  const copie = copiePresence(p)
  if (!copie) return true
  return Object.keys(copie).every((c) => (p[c] ?? null) === copie[c])
}

/**
 * Ce qu'on affiche d'une présence (écran et PDF) : la copie enregistrée, tenue
 * à jour tant que le compte rendu est en brouillon ; à défaut (données
 * antérieures à la migration), la fiche liée.
 *
 * @returns { type: 'interlocuteur' | 'entreprise' | null, ... }
 */
export function affichagePresence(p) {
  const c = p.copie_type ? p : { ...p, ...(copiePresence(p) ?? {}) }
  const nomComplet = [c.copie_prenom, c.copie_nom].filter(Boolean).join(' ')
  return {
    type: c.copie_type ?? null,
    categorie: c.copie_categorie ?? null,
    categorieLabel: c.copie_categorie_label ?? null,
    nom: nomComplet || c.copie_organisation || '',
    prenom: c.copie_prenom ?? null,
    fonction: c.copie_fonction ?? null,
    organisation: c.copie_organisation ?? null,
    adresse: c.copie_adresse ?? null,
    email: c.copie_email ?? null,
    telephone: c.copie_telephone ?? null,
    ordre: c.copie_ordre ?? 99,
    lotNumero: c.copie_lot_numero ?? null,
    lotNom: c.copie_lot_nom ?? null,
    entreprise: c.copie_entreprise ?? null,
    contact: c.copie_type === 'entreprise' ? nomComplet : null,
  }
}
