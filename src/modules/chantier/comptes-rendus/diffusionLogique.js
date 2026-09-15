// ─── Diffusion par la messagerie : logique pure ──────────────────────────────
//
// Destinataires, regroupement par entreprise, texte et lien « mailto: » de
// l'e-mail. Testée par tests/diffusion.test.js.

import { affichagePresence } from './crLogique'

export const DUREE_LIEN_JOURS = 30

// Au-delà, certaines messageries (Outlook sous Windows) tronquent un lien mailto
export const MAILTO_MAX = 1900

const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? '').trim())

/**
 * Participants joignables par e-mail, une ligne par adresse (une même adresse
 * sur deux fiches n'est proposée qu'une fois).
 */
export function participantsAvecEmail(presences) {
  const vus = new Set()
  const liste = []
  for (const p of presences ?? []) {
    const v = affichagePresence(p)
    const email = String(v.email ?? '').trim()
    if (!v.type || !emailValide(email) || vus.has(email.toLowerCase())) continue
    vus.add(email.toLowerCase())
    liste.push({
      id: p.id,
      email,
      type: v.type,
      nom: v.type === 'entreprise' ? (v.entreprise ?? v.contact ?? email) : (v.nom || v.organisation || email),
      detail: v.type === 'entreprise'
        ? [v.lotNom && `Lot ${v.lotNumero ?? ''} — ${v.lotNom}`, v.contact].filter(Boolean).join(' · ')
        : [v.categorieLabel, v.organisation].filter(Boolean).join(' · '),
      convoque: !!p.convoque,
      present: p.presence === 'p' || p.presence === 'r',
    })
  }
  return liste
}

// Cochés d'office : convoqués ou présents ; à défaut, tout le monde
export function selectionParDefaut(participants) {
  const retenus = participants.filter((x) => x.convoque || x.present)
  return new Set((retenus.length > 0 ? retenus : participants).map((x) => x.id))
}

/**
 * Entreprises à qui envoyer leur version : une ligne par lot, avec les adresses
 * de ses entreprises présentes dans la feuille de présence. Le lot vient de la
 * fiche liée (lot_entreprises.lot_id), sinon de son numéro.
 */
export function entreprisesDiffusion(presences, lots) {
  const parLot = new Map()
  for (const p of presences ?? []) {
    const v = affichagePresence(p)
    if (v.type !== 'entreprise') continue
    const lotId = p.lot_entreprises?.lot_id ?? (lots ?? []).find((l) => l.numero != null && l.numero === v.lotNumero)?.id
    if (!lotId) continue
    const lot = (lots ?? []).find((l) => l.id === lotId)
    const ligne = parLot.get(lotId) ?? {
      destinataire: `lot:${lotId}`,
      libelle: lot ? (lot.numero ? `Lot ${lot.numero} — ${lot.nom}` : lot.nom) : `Lot ${v.lotNumero ?? ''} — ${v.lotNom ?? ''}`,
      numero: lot?.numero ?? v.lotNumero ?? 999,
      entreprises: [],
      adresses: [],
    }
    if (v.entreprise && !ligne.entreprises.includes(v.entreprise)) ligne.entreprises.push(v.entreprise)
    const email = String(v.email ?? '').trim()
    if (emailValide(email) && !ligne.adresses.some((a) => a.toLowerCase() === email.toLowerCase())) ligne.adresses.push(email)
    parLot.set(lotId, ligne)
  }
  return [...parLot.values()].sort((a, b) => a.numero - b.numero)
}

export function dateExpiration(maintenant = new Date(), jours = DUREE_LIEN_JOURS) {
  return new Date(maintenant.getTime() + jours * 24 * 3600 * 1000)
}

const jourLong = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Objet et texte de l'e-mail */
export function texteEmail({ cr, affaire, versionPour, lien, expiration, signataire }) {
  const num = String(cr.numero).padStart(2, '0')
  const date = cr.date_reunion ? new Date(`${cr.date_reunion}T00:00:00`).toLocaleDateString('fr-FR') : ''
  const objet = [`Compte rendu de réunion n°${num}`, affaire?.nom, date].filter(Boolean).join(' — ')
  const dateTexte = cr.date_reunion
    ? ` du ${new Date(`${cr.date_reunion}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : ''
  const [h, m] = String(cr.heure_prochaine_reunion ?? '').split(':')
  const heure = cr.heure_prochaine_reunion ? ` à ${Number(h)} h${m && m !== '00' ? ` ${m}` : ''}` : ''
  const lignes = [
    'Bonjour,',
    '',
    `Veuillez trouver le compte rendu de la réunion de chantier n°${num}${dateTexte}${affaire?.nom ? ` (${affaire.nom})` : ''}${versionPour ? `, version pour ${versionPour}` : ''} :`,
    lien,
    `Lien valable jusqu'au ${expiration.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    ...(cr.date_prochaine_reunion ? ['', `Prochaine réunion : ${jourLong(cr.date_prochaine_reunion)}${heure}.`] : []),
    '',
    'Cordialement,',
    [signataire, 'JGA Architectures'].filter(Boolean).join(' — '),
  ]
  return { objet, corps: lignes.join('\n') }
}

/** Lien « mailto: » : destinataires visibles ou en copie cachée */
export function lienMailto({ adresses, copieCachee = false, objet, corps }) {
  const liste = (adresses ?? []).join(',')
  const params = [
    ...(copieCachee && liste ? [`bcc=${encodeURIComponent(liste)}`] : []),
    `subject=${encodeURIComponent(objet ?? '')}`,
    `body=${encodeURIComponent(corps ?? '')}`,
  ]
  return `mailto:${copieCachee ? '' : liste.split(',').map(encodeURIComponent).join(',')}?${params.join('&')}`
}

// Texte à coller dans la messagerie quand le lien mailto serait trop long
export function texteACopier({ adresses, copieCachee, objet, corps }) {
  return `${copieCachee ? 'Cci' : 'À'} : ${(adresses ?? []).join(', ')}\nObjet : ${objet}\n\n${corps}`
}
