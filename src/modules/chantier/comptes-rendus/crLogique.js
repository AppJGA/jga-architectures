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

// ─── Statuts des remarques ───────────────────────────────────────────────────
//
// Liste fixe (migration 038) : le statut décide seul du report d'une visite à
// l'autre. Les verts sont clos, tous les autres reviennent.

export const FAMILLES_STATUT = [
  { id: 'rouge',  libelle: 'À traiter',         couleur: '#B8412C', fond: 'rgba(184,65,44,0.10)' },
  { id: 'orange', libelle: 'En cours',          couleur: '#C2610C', fond: 'rgba(217,119,6,0.12)' },
  { id: 'bleu',   libelle: 'Pour information',  couleur: '#1B3A5C', fond: 'rgba(27,58,92,0.10)' },
  { id: 'vert',   libelle: 'Clos',              couleur: '#2A8A4E', fond: 'rgba(42,138,78,0.12)' },
]

export const STATUTS = [
  { code: 'a_faire',      libelle: 'À faire',      famille: 'rouge' },
  { code: 'urgent',       libelle: 'Urgent',       famille: 'rouge' },
  { code: 'en_cours',     libelle: 'En cours',     famille: 'orange' },
  { code: 'en_attente',   libelle: 'En attente',   famille: 'orange' },
  { code: 'pour_memoire', libelle: 'Pour mémoire', famille: 'bleu' },
  { code: 'a_prevoir',    libelle: 'À prévoir',    famille: 'bleu' },
  { code: 'fait',         libelle: 'Fait',         famille: 'vert', clos: true },
  { code: 'annule',       libelle: 'Annulé',       famille: 'vert', clos: true },
].map((st) => {
  const { couleur, fond } = FAMILLES_STATUT.find((f) => f.id === st.famille)
  return { ...st, clos: !!st.clos, couleur, fond }
})

export const STATUT_PAR_DEFAUT = 'a_faire'
const PAR_CODE = new Map(STATUTS.map((st) => [st.code, st]))

// Minuscules sans accents, pour comparer du texte saisi
export function sansAccents(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Code de statut d'une remarque. Avant la migration 038, le statut était du
 * texte libre (« Fait », « à prévoir »…) doublé d'une case « Clôturé » : on
 * reconnaît ce vocabulaire. La même correspondance est appliquée en base par
 * `cr_statut_normalise` — les deux doivent rester alignées.
 */
export function statutNormalise(r) {
  const t = sansAccents(r?.statut)
  let code = 'en_cours'
  if (PAR_CODE.has(r?.statut)) code = r.statut
  else if (/annul/.test(t)) code = 'annule'
  else if (/\bfaits?\b|sold|clos|clotur|\bleve/.test(t)) code = 'fait'
  else if (/urgent/.test(t)) code = 'urgent'
  else if (/prevoir|programm/.test(t)) code = 'a_prevoir'
  else if (/faire/.test(t)) code = 'a_faire'
  else if (/attente/.test(t)) code = 'en_attente'
  else if (/memoire|info/.test(t)) code = 'pour_memoire'
  // Ancienne case « Clôturé » cochée sur un statut resté ouvert (« Fait » non
  // coché revenait indéfiniment ; l'inverse est traité comme fait)
  if (r?.est_clos && !PAR_CODE.get(code).clos) code = 'fait'
  return code
}

export function infosStatut(r) {
  return PAR_CODE.get(statutNormalise(r))
}

export function estClos(r) {
  return infosStatut(r).clos
}

// Ouverte, avec une échéance antérieure à la date de référence (celle de la
// visite : un compte rendu dit ce qui était en retard ce jour-là).
export function estEnRetard(r, dateReference) {
  if (!r?.date_echeance || !dateReference || r.parent_id) return false
  return !estClos(r) && r.date_echeance < dateReference
}

// Présents à la réunion, retardataires compris. Les codes sont stockés en
// minuscules : la comparaison à 'P' faisait afficher 0 présent en permanence.
export function compterPresents(presences) {
  return (presences ?? []).filter((p) => p.presence === 'p' || p.presence === 'r').length
}

// Remarques principales encore ouvertes : ce sont elles, et elles seules, que
// la visite suivante reprend. Les suivis (sous-remarques) ne comptent pas.
export function compterPointsEnCours(remarques) {
  return (remarques ?? []).filter((r) => !r.parent_id && !estClos(r)).length
}

/**
 * Lignes à insérer pour reprendre la visite précédente dans un nouveau compte
 * rendu : toutes ses sections et sous-sections, ses remarques principales
 * ouvertes et leurs suivis.
 *
 * Une remarque close pendant la visite précédente revient une fois, barrée,
 * pour que les entreprises voient la levée ; sa copie est marquée
 * `cloture_reportee` et ne reviendra plus. Avant la migration 038 (colonne
 * absente), une remarque close n'est pas reprise.
 *
 * La copie garde le numéro et le `suivi_id` de la remarque : c'est ce qui la
 * relie à ses versions des visites précédentes.
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
    .filter((r) => !r.parent_id)
    .filter((r) => !estClos(r) || r.cloture_reportee === false)
    .forEach((r) => {
      const sousSectionId = r.sous_section_id ? idSousSection.get(r.sous_section_id) : null
      const sectionId = r.section_id ? idSection.get(r.section_id) ?? null : null
      // Rattachée à une sous-section ou une section qui n'existe plus : rien où la poser
      if (r.sous_section_id ? !sousSectionId : !sectionId) return
      const nouveau = nouvelId()
      idRemarque.set(r.id, nouveau)
      const statut = statutNormalise(r)
      const clos = PAR_CODE.get(statut).clos
      lignesRemarques.push({
        id: nouveau, cr_id: crId, affaire_id: affaireId,
        sous_section_id: sousSectionId ?? null, section_id: sectionId,
        lot_id: r.lot_id ?? null, interlocuteur_id: r.interlocuteur_id ?? null,
        // Le libellé d'un lot ou d'un interlocuteur supprimé depuis ; absent
        // tant que la migration 037 n'est pas passée
        ...(r.copie_destinataire !== undefined && { copie_destinataire: r.copie_destinataire }),
        date_note: r.date_note ?? null, pour: r.pour ?? null, description: r.description,
        statut, date_echeance: r.date_echeance ?? null,
        est_important: !!r.est_important, est_clos: clos, est_nouveau: false,
        ordre: r.ordre ?? 0,
        ...(r.suivi_id !== undefined && {
          suivi_id: r.suivi_id ?? r.id,
          numero: r.numero ?? null,
          date_cloture: clos ? r.date_cloture ?? null : null,
          cloture_reportee: clos,
        }),
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

// ─── Historique d'une remarque ───────────────────────────────────────────────

/**
 * Parcours d'une remarque de visite en visite : ses copies partagent le même
 * `suivi_id`. `remarques` couvre l'affaire (remarques principales), `crs` donne
 * le numéro et la date de chaque compte rendu.
 *
 * @returns [{ crId, crNumero, date, statut, description, texteModifie }] du plus ancien au plus récent
 */
export function historiqueRemarque(remarque, remarques, crs) {
  const cle = remarque.suivi_id
  if (!cle) return []
  const parCr = new Map((crs ?? []).map((c) => [c.id, c]))
  const etapes = (remarques ?? [])
    .filter((r) => !r.parent_id && r.suivi_id === cle && parCr.has(r.cr_id))
    .map((r) => ({ r, cr: parCr.get(r.cr_id) }))
    .sort((a, b) => a.cr.numero - b.cr.numero)
  return etapes.map(({ r, cr }, i) => ({
    crId: cr.id,
    crNumero: cr.numero,
    date: cr.date_reunion ?? null,
    statut: infosStatut(r),
    description: r.description,
    texteModifie: i > 0 && r.description !== etapes[i - 1].r.description,
  }))
}

// ─── Filtres de l'éditeur ────────────────────────────────────────────────────

export const FILTRE_VIDE = { familles: [], destinataire: '', enRetard: false, recherche: '' }

export function filtreActif(filtre) {
  return filtre.familles.length > 0 || !!filtre.destinataire || filtre.enRetard || !!filtre.recherche.trim()
}

/**
 * La remarque passe-t-elle le filtre ?
 * - familles : couleurs de statut retenues (aucune = toutes) ;
 * - destinataire : '' (tous), 'aucun', 'lot:<id>' ou 'interlo:<id>' ;
 * - enRetard : seulement les échéances dépassées à `dateReference` ;
 * - recherche : mots du texte, initiales « pour », destinataire, ou numéro (« 12 », « n°12 »).
 */
export function passeFiltre(r, filtre, dateReference) {
  if (filtre.familles.length > 0 && !filtre.familles.includes(infosStatut(r).famille)) return false
  const d = filtre.destinataire
  if (d === 'aucun' && (r.lot_id || r.interlocuteur_id || r.copie_destinataire)) return false
  if (d.startsWith('lot:') && r.lot_id !== d.slice(4)) return false
  if (d.startsWith('interlo:') && r.interlocuteur_id !== d.slice(8)) return false
  if (filtre.enRetard && !estEnRetard(r, dateReference)) return false
  const q = sansAccents(filtre.recherche).trim()
  if (q) {
    const numero = q.replace(/^n\s*°?\s*/, '')
    if (/^\d+$/.test(numero)) return String(r.numero ?? '') === numero
    const texte = sansAccents([r.description, r.pour, r.copie_destinataire].filter(Boolean).join(' '))
    if (!q.split(/\s+/).every((mot) => texte.includes(mot))) return false
  }
  return true
}
