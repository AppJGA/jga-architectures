// ─── Export des contacts d'une affaire ───────────────────────────────────────
//
// Deux formats, parce que les deux cibles n'acceptent pas la même chose :
// - vCard (.vcf) pour le téléphone : l'iPhone et Android proposent « Ajouter
//   les N contacts » à l'ouverture d'un fichier qui en contient plusieurs ;
// - CSV pour Outlook : l'Outlook classique sur Windows ne retient que le
//   premier contact d'un .vcf, son import en nombre passe par un CSV.
// Pur, pour être testé (tests/export-contacts.test.js). Les fiches viennent
// d'`annuaireAffaire`.

import { telephones } from './annuaireLogique'

const nomComplet = (f) => [f.prenom, f.nomFamille].filter(Boolean).join(' ')

// 06 / 07 en France : Outlook range un mobile dans sa propre colonne
export function estMobile(numero) {
  const chiffres = String(numero ?? '').replace(/[^\d+]/g, '')
  return /^(0[67]|\+33[67]|0033[67])/.test(chiffres)
}

// Ce qui permet de retrouver, dans le téléphone, pourquoi on a ce contact
export function noteContact(fiche, affaire) {
  return [affaire?.nom ? `Affaire ${affaire.nom}` : null, fiche.role].filter(Boolean).join(' – ')
}

// ─── vCard 3.0 ───────────────────────────────────────────────────────────────

const echapper = (texte) => String(texte ?? '')
  .replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

// La norme coupe les lignes à 75 octets (suite précédée d'une espace). Coupe
// entre deux caractères, jamais au milieu d'un accent encodé sur deux octets.
function plier(ligne) {
  const morceaux = []
  let courant = ''
  let octets = 0
  for (const c of ligne) {
    const taille = new TextEncoder().encode(c).length
    const plafond = morceaux.length === 0 ? 75 : 74
    if (octets + taille > plafond) { morceaux.push(courant); courant = ''; octets = 0 }
    courant += c
    octets += taille
  }
  morceaux.push(courant)
  return morceaux.join('\r\n ')
}

export function vcard(fiche, affaire) {
  const personne = nomComplet(fiche)
  const lignes = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${echapper(fiche.nomFamille)};${echapper(fiche.prenom)};;;`,
    `FN:${echapper(personne || fiche.organisation || fiche.nom)}`,
  ]
  if (fiche.organisation) lignes.push(`ORG:${echapper(fiche.organisation)}`)
  // Sans personne nommée, l'iPhone affiche la société plutôt qu'un nom vide
  if (!personne) lignes.push('X-ABShowAs:COMPANY')
  if (fiche.fonction) lignes.push(`TITLE:${echapper(fiche.fonction)}`)
  for (const n of telephones(fiche.telephone)) {
    lignes.push(`TEL;TYPE=${estMobile(n) ? 'CELL' : 'WORK'},VOICE:${n}`)
  }
  if (fiche.email) lignes.push(`EMAIL;TYPE=INTERNET,WORK:${fiche.email}`)
  const note = noteContact(fiche, affaire)
  if (note) lignes.push(`NOTE:${echapper(note)}`)
  if (affaire?.nom) lignes.push(`CATEGORIES:${echapper(affaire.nom)}`)
  lignes.push('END:VCARD')
  return lignes.map(plier).join('\r\n') + '\r\n'
}

export function vcards(fiches, affaire) {
  return fiches.map((f) => vcard(f, affaire)).join('')
}

// ─── CSV au modèle d'Outlook ─────────────────────────────────────────────────

// Les en-têtes de l'export d'Outlook : son import les reconnaît d'office
export const COLONNES_OUTLOOK = [
  'First Name', 'Last Name', 'Company', 'Job Title',
  'Business Phone', 'Business Phone 2', 'Mobile Phone', 'Other Phone',
  'E-mail Address', 'Notes', 'Categories',
]

const cellule = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function ligneOutlook(fiche, affaire) {
  const numeros = telephones(fiche.telephone)
  const mobiles = numeros.filter(estMobile)
  const fixes = numeros.filter((n) => !estMobile(n))
  const personne = nomComplet(fiche)
  return {
    'First Name': fiche.prenom ?? '',
    // Sans personne nommée, la société tient lieu de nom : un contact sans nom
    // se perd dans la liste d'Outlook
    'Last Name': fiche.nomFamille ?? (personne ? '' : fiche.organisation ?? fiche.nom ?? ''),
    'Company': fiche.organisation ?? '',
    'Job Title': fiche.fonction ?? '',
    'Business Phone': fixes[0] ?? '',
    'Business Phone 2': fixes[1] ?? '',
    'Mobile Phone': mobiles[0] ?? '',
    // Ce qui ne trouve pas de place ailleurs
    'Other Phone': [...fixes.slice(2), ...mobiles.slice(1)].join(' / '),
    'E-mail Address': fiche.email ?? '',
    'Notes': noteContact(fiche, affaire),
    'Categories': affaire?.nom ?? '',
  }
}

/** Le texte du fichier, précédé de la marque UTF-8 : sans elle, Outlook lit les accents de travers. */
export function csvOutlook(fiches, affaire) {
  const lignes = [
    COLONNES_OUTLOOK.map(cellule).join(','),
    ...fiches.map((f) => { const l = ligneOutlook(f, affaire); return COLONNES_OUTLOOK.map((c) => cellule(l[c])).join(',') }),
  ]
  return '\uFEFF' + lignes.join('\r\n') + '\r\n'
}

// ─── Noms de fichier ─────────────────────────────────────────────────────────

const propre = (t) => String(t ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()

export function nomFichierContacts(affaire, extension) {
  return `${['Contacts', propre(affaire?.nom)].filter(Boolean).join(' – ')}.${extension}`
}

export function nomFichierContact(fiche) {
  return `${propre(nomComplet(fiche) || fiche.organisation || fiche.nom) || 'Contact'}.vcf`
}
