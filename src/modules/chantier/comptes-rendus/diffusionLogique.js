// ─── Diffusion par la messagerie : logique pure ──────────────────────────────
//
// Destinataires, regroupement par entreprise, texte et lien « mailto: » de
// l'e-mail. Testée par tests/diffusion.test.js.

import { affichagePresence } from './crLogique'
import { libelleNumeroLot } from '../../../shared/lots/numeroLot'

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
        ? [v.lotNom && `Lot ${v.lotNumeroAffiche ?? ''} — ${v.lotNom}`, v.contact].filter(Boolean).join(' · ')
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
      libelle: lot ? libelleNumeroLot(lot) : `Lot ${v.lotNumero ?? ''} — ${v.lotNom ?? ''}`,
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

/**
 * Objet et texte de l'e-mail d'un document.
 * @param intitule   pour l'objet (« Compte rendu de réunion »)
 * @param designation dans la phrase (« le compte rendu de la réunion de chantier »)
 */
export function texteEmailDocument({ intitule, designation, numero, date, affaire, versionPour, lien, expiration, prochaine, signataire }) {
  const num = String(numero).padStart(2, '0')
  const objet = [`${intitule} n°${num}`, affaire?.nom, date ? new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR') : null].filter(Boolean).join(' — ')
  const dateTexte = date ? ` du ${new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
  const lignes = [
    'Bonjour,',
    '',
    // Le PDF part en pièce jointe (Outlook) ; le lien reste pour qui ne
    // reçoit pas les pièces jointes, ou par une autre messagerie
    `Veuillez trouver ci-joint ${designation} n°${num}${dateTexte}${affaire?.nom ? ` (${affaire.nom})` : ''}${versionPour ? `, version pour ${versionPour}` : ''}.`,
    `Il est aussi téléchargeable jusqu'au ${expiration.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} :`,
    lien,
    ...(prochaine ? ['', prochaine] : []),
    '',
    'Cordialement,',
    [signataire, 'JGA Architectures'].filter(Boolean).join(' — '),
  ]
  return { objet, corps: lignes.join('\n') }
}

/** Objet et texte de l'e-mail d'un compte rendu */
export function texteEmail({ cr, affaire, versionPour, lien, expiration, signataire }) {
  const [h, m] = String(cr.heure_prochaine_reunion ?? '').split(':')
  const heure = cr.heure_prochaine_reunion ? ` à ${Number(h)} h${m && m !== '00' ? ` ${m}` : ''}` : ''
  return texteEmailDocument({
    intitule: 'Compte rendu de réunion', designation: 'le compte rendu de la réunion de chantier',
    numero: cr.numero, date: cr.date_reunion, affaire, versionPour, lien, expiration, signataire,
    prochaine: cr.date_prochaine_reunion ? `Prochaine réunion : ${jourLong(cr.date_prochaine_reunion)}${heure}.` : null,
  })
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

// ─── Fichier e-mail pour Outlook ─────────────────────────────────────────────
//
// Un mailto ouvre la messagerie « par défaut » du Mac (Chrome et Gmail chez
// l'agence) et ne porte pas de pièce jointe. Un modèle Outlook (.emltpl) ouvre
// toujours Outlook, sur un e-mail modifiable : destinataires, objet, texte
// mis en forme. Essayé le 2026-10-06 sur le nouvel Outlook pour Mac : il
// ignore les pièces jointes d'un modèle (et un .eml s'ouvre en lecture
// seule) — le PDF se télécharge donc à côté, à glisser dans l'e-mail.

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Texte de l'e-mail en HTML : paragraphes, retours à la ligne, liens cliquables */
export function corpsHtml(corps) {
  const paragraphes = String(corps ?? '').split(/\n{2,}/).map((p) => p
    .split('\n')
    .map((ligne) => echapper(ligne).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`))
    .join('<br>'))
  return `<html><head><meta charset="utf-8"></head><body style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 11pt">${paragraphes.map((p) => `<p>${p}</p>`).join('')}</body></html>`
}

// Base64 d'un texte UTF-8, en lignes de 76 caractères (norme MIME)
function base64Utf8(texte) {
  const octets = new TextEncoder().encode(texte)
  let binaire = ''
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire).replace(/.{1,76}/g, '$&\r\n').trimEnd()
}

/** Modèle d'e-mail Outlook (.emltpl), au format MIME */
export function fichierOutlook({ adresses, copieCachee = false, objet, corps }) {
  const liste = (adresses ?? []).join(', ')
  return [
    ...(liste ? [`${copieCachee ? 'Bcc' : 'To'}: ${liste}`] : []),
    `Subject: =?UTF-8?B?${base64Utf8(objet ?? '').replace(/\r\n/g, '')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Utf8(corpsHtml(corps)),
    '',
  ].join('\r\n')
}

/** Nom du fichier e-mail, d'après celui du PDF */
export function nomFichierOutlook(nomPdf) {
  return `${String(nomPdf ?? 'E-mail').replace(/\.pdf$/i, '')}.emltpl`
}

// ─── Lien de téléchargement court (migration 065) ────────────────────────────
//
// « https://<site>/pdf/2618-LVV-CR03-02-Gros-oeuvre-k7Pq9x » plutôt que le
// lien signé du stockage : on lit l'affaire, le document et la version ; les
// 6 derniers caractères, tirés au hasard, empêchent de deviner une adresse.

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans l, o, 0, 1, I, O : lisibles à la main

export function aleaLien(taille = 6, hasard = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return [...hasard(taille)].map((o) => ALPHABET[o % ALPHABET.length]).join('')
}

const morceau = (t) => String(t ?? '')
  .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Code du lien : affaire, document et numéro, version (lot ou interlocuteur,
 * raccourcie), puis l'aléa.
 */
export function codeLien({ codeAffaire, document = 'CR', numero, version, alea }) {
  const parties = [
    morceau(codeAffaire),
    `${morceau(document)}${numero != null ? String(numero).padStart(2, '0') : ''}`,
    morceau(version).slice(0, 24).replace(/-+$/, ''),
    alea,
  ].filter(Boolean)
  return parties.join('-')
}

export function adresseLien(origine, code) {
  return `${String(origine).replace(/\/+$/, '')}/pdf/${code}`
}
