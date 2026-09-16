// ─── Rapport PDF du compte rendu : logique pure ──────────────────────────────
//
// Sélection des remarques selon les réglages d'export, nom du fichier et
// description du document pour pdfmake. Sans navigateur : les images arrivent
// déjà prêtes (data URL JPEG) ; testée par tests/rapport.test.js.

import { infosStatut, estEnRetard, affichagePresence, grouperParZone, libelleZone, auteurExterieur } from './crLogique'

export const REGLAGES_DEFAUT = {
  modele: 'complet',        // complet | synthese
  closes: 'afficher',       // afficher | masquer
  destinataire: '',         // '' | lot:<id> | interlo:<id>
  inclureGenerales: true,   // version par destinataire : garder les remarques sans destinataire
  photos: 'petites',        // aucune | petites | grandes
  plans: 'les_deux',        // aucun | extraits | planches | les_deux
  zones: 'non',             // non | grouper : regrouper les remarques par zone
  avancement: 'oui',        // oui | non : tableau d'avancement des lots
}

export const PIED_AGENCE = 'JGA Architectes • 69 rue de la République, 69002 Lyon • contact@jga-architectes.fr'

// La synthèse garde des photos petites, quel que soit le réglage
export function reglagesEffectifs(reglages) {
  const r = { ...REGLAGES_DEFAUT, ...reglages }
  if (r.modele === 'synthese' && r.photos === 'grandes') r.photos = 'petites'
  return r
}

function sansDestinataire(r) {
  return !r.lot_id && !r.interlocuteur_id && !r.copie_destinataire
}

/**
 * Sections du rapport selon les réglages. Quand un filtre retire des
 * remarques, les sous-sections et sections vides disparaissent ; sans filtre,
 * le rapport garde la structure complète du compte rendu.
 */
export function selectionnerSections(sections, reglages) {
  const r = reglagesEffectifs(reglages)
  const filtre = !!r.destinataire || r.closes === 'masquer'
  const garde = (rem) => {
    if (r.closes === 'masquer' && infosStatut(rem).clos) return false
    if (!r.destinataire) return true
    if (sansDestinataire(rem)) return r.inclureGenerales
    if (r.destinataire.startsWith('lot:')) return rem.lot_id === r.destinataire.slice(4)
    if (r.destinataire.startsWith('interlo:')) return rem.interlocuteur_id === r.destinataire.slice(8)
    return true
  }
  const preparer = (rem) => (r.modele === 'synthese' ? { ...rem, sous_remarques: [] } : rem)
  return (sections ?? [])
    .map((s) => ({
      ...s,
      sousSections: (s.sousSections ?? [])
        .map((ss) => ({ ...ss, remarques: (ss.remarques ?? []).filter(garde).map(preparer) }))
        .filter((ss) => !filtre || ss.remarques.length > 0),
      directRemarques: (s.directRemarques ?? []).filter(garde).map(preparer),
    }))
    .filter((s) => !filtre || s.sousSections.length > 0 || s.directRemarques.length > 0)
}

export function remarquesDesSections(sections) {
  return (sections ?? []).flatMap((s) => [
    ...(s.sousSections ?? []).flatMap((ss) => ss.remarques ?? []),
    ...(s.directRemarques ?? []),
  ])
}

// « CR05 – Groupe scolaire – 2026-09-15 – Lot 2 Gros œuvre.pdf »
export function nomFichierCr(cr, affaire, versionPour) {
  const morceaux = [
    `CR${String(cr.numero).padStart(2, '0')}`,
    affaire?.nom,
    cr.date_reunion,
    versionPour,
  ].filter(Boolean).map((m) => String(m).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim())
  return `${morceaux.join(' – ')}.pdf`
}

// ─── Description du document ─────────────────────────────────────────────────

export const COULEUR = { orange: '#E8602C', texte: '#1F1B17', gris: '#5E5854', grisClair: '#9C9591', filet: '#E5E7EB' }
const PRESENCES = { p: ['P', '#2A8A4E'], r: ['R', '#E8602C'], a: ['A', '#B8412C'], e: ['E', '#5E5854'] }
const CATEGORIES = {
  moa: "Maître d'ouvrage", moe: "Maître d'œuvre", be: "Bureau d'études",
  ct: 'Contrôle technique', csps: 'CSPS', administration: 'Administration', autre: 'Autre',
}
export const LARGEUR_UTILE = 523 // A4 moins les marges

export function jour(d, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', options) : ''
}

function destinataireDe(rem, lots, interlocuteurs) {
  if (rem.lot_id) {
    const l = (lots ?? []).find((x) => x.id === rem.lot_id)
    if (l) return l.numero ? `Lot ${l.numero} — ${l.nom}` : l.nom
  }
  if (rem.interlocuteur_id) {
    const i = (interlocuteurs ?? []).find((x) => x.id === rem.interlocuteur_id)
    if (i) return [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation
  }
  return rem.copie_destinataire ?? null
}

export const tableauFin = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => COULEUR.filet,
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4,
}

export function lignePhotos(photos, taille) {
  const parLigne = taille === 'grandes' ? 2 : 3
  const largeur = (LARGEUR_UTILE * 0.84 - 8 * (parLigne - 1) - 12) / parLigne
  const lignes = []
  for (let i = 0; i < photos.length; i += parLigne) {
    const morceau = photos.slice(i, i + parLigne)
    lignes.push({
      columnGap: 8, margin: [0, 0, 0, 6],
      columns: [
        ...morceau.map((ph) => ({
          width: largeur,
          stack: [
            { image: ph.image, fit: [largeur, largeur * 0.75] },
            ...(ph.legende ? [{ text: ph.legende, fontSize: 7, color: COULEUR.gris, margin: [0, 2, 0, 0] }] : []),
          ],
        })),
        ...Array(parLigne - morceau.length).fill({ width: largeur, text: '' }),
      ],
    })
  }
  return lignes
}

function lignesRemarque(rem, contexte) {
  const { lots, interlocuteurs, dateReference, images, reglages, profils } = contexte
  const statut = infosStatut(rem)
  const retard = estEnRetard(rem, dateReference)
  const destinataire = destinataireDe(rem, lots, interlocuteurs)
  const lignes = [[
    {
      stack: [
        ...(rem.numero != null ? [{ text: `n°${rem.numero}`, fontSize: 7, color: COULEUR.grisClair }] : []),
        { text: [rem.est_nouveau ? { text: '» ', color: COULEUR.orange } : '', jour(rem.date_note) || '—'], fontSize: 8, color: COULEUR.gris },
        ...(rem.pour ? [{ text: rem.pour, fontSize: 8, bold: true, color: COULEUR.orange }] : []),
        ...(destinataire ? [{ text: `(${destinataire})`, fontSize: 7, italics: true, color: COULEUR.gris }] : []),
        ...(rem._section ? [{ text: rem._section, fontSize: 7, color: COULEUR.grisClair }] : []),
        ...(!rem._section && libelleZone(rem, contexte.zones) ? [{ text: libelleZone(rem, contexte.zones), fontSize: 7, color: '#1B3A5C' }] : []),
        // L'observation d'un intervenant extérieur est signée : le lecteur doit
        // savoir qu'elle ne vient pas de l'agence (migration 050).
        ...(auteurExterieur(rem, profils) ? [{ text: auteurExterieur(rem, profils), fontSize: 7, italics: true, color: '#6B4E9B' }] : []),
      ],
    },
    {
      text: rem.description,
      decoration: statut.clos ? 'lineThrough' : undefined,
      color: statut.clos ? COULEUR.grisClair : rem.est_important ? COULEUR.orange : COULEUR.texte,
      bold: !!rem.est_important,
    },
    {
      stack: rem.date_echeance
        ? [
          { text: jour(rem.date_echeance), fontSize: 8, color: retard ? '#B8412C' : COULEUR.gris, bold: retard },
          ...(retard ? [{ text: 'EN RETARD', fontSize: 6.5, bold: true, color: 'white', background: '#B8412C' }] : []),
        ]
        : [{ text: '—', fontSize: 8, color: COULEUR.grisClair }],
    },
    {
      stack: [
        { text: statut.libelle, fontSize: 8, bold: true, color: statut.couleur },
        ...(statut.clos && rem.date_cloture ? [{ text: `le ${jour(rem.date_cloture)}`, fontSize: 7, color: COULEUR.gris }] : []),
      ],
    },
  ]]

  const photos = reglages.photos !== 'aucune' ? images.photos?.get(rem.id) ?? [] : []
  if (photos.length > 0) {
    lignes.push(['', { colSpan: 3, stack: lignePhotos(photos, reglages.photos) }, '', ''])
  }
  const extrait = ['extraits', 'les_deux'].includes(reglages.plans) ? images.extraits?.get(rem.id) : null
  if (extrait) {
    lignes.push(['', {
      colSpan: 3,
      stack: [
        { image: extrait.image, width: 220 },
        { text: extrait.legende, fontSize: 7, color: COULEUR.gris, margin: [0, 2, 0, 0] },
      ],
    }, '', ''])
  }
  for (const sr of rem.sous_remarques ?? []) {
    lignes.push([
      { text: jour(sr.date_note, { day: '2-digit', month: '2-digit' }) || '—', fontSize: 7, color: COULEUR.gris, margin: [10, 0, 0, 0], fillColor: '#FAFAFA' },
      { text: [sr.pour ? { text: `${sr.pour} `, bold: true, color: COULEUR.orange } : '', sr.description], fontSize: 8, color: sr.est_clos ? COULEUR.grisClair : '#374151', decoration: sr.est_clos ? 'lineThrough' : undefined, fillColor: '#FAFAFA' },
      { text: '', fillColor: '#FAFAFA' },
      { text: '', fillColor: '#FAFAFA' },
    ])
  }
  return lignes
}

function tableauRemarques(remarques, contexte) {
  if (remarques.length === 0) return { text: 'Aucune remarque', italics: true, fontSize: 8, color: COULEUR.grisClair, margin: [0, 2, 0, 6] }
  return {
    margin: [0, 0, 0, 8],
    layout: tableauFin,
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['16%', '*', '14%', '16%'],
      body: [
        ['Note du', 'Description', 'Pour le', 'Statut'].map((t) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, color: COULEUR.gris })),
        ...remarques.flatMap((r) => lignesRemarque(r, contexte)),
      ],
    },
  }
}

function tableauPresences(titre, lignes, colonnes) {
  if (lignes.length === 0) return []
  return [
    { text: titre, bold: true, fontSize: 10, margin: [0, 8, 0, 4] },
    {
      layout: { ...tableauFin, fillColor: (i) => (i === 0 ? COULEUR.texte : i % 2 === 0 ? '#FAFAFA' : null) },
      table: {
        headerRows: 1,
        widths: colonnes.map((c) => c.largeur),
        body: [
          colonnes.map((c) => ({ text: c.titre, bold: true, fontSize: 8, color: 'white' })),
          ...lignes.map((l) => colonnes.map((c) => c.cellule(l))),
        ],
      },
    },
  ]
}

const cellulePresence = ({ p }) => {
  const [lettre, couleur] = PRESENCES[p.presence] ?? ['—', null]
  return couleur
    ? { text: lettre, bold: true, color: 'white', fillColor: couleur, alignment: 'center', fontSize: 8 }
    : { text: '—', color: COULEUR.grisClair, alignment: 'center', fontSize: 8 }
}
const celluleConvoque = ({ p }) => ({ text: p.convoque ? `Oui${p.heure_convocation ? ` ${p.heure_convocation.slice(0, 5)}` : ''}` : '—', fontSize: 8, color: p.convoque ? '#2A8A4E' : COULEUR.grisClair })
const celluleContact = ({ v }) => ({ stack: [v.email, v.telephone].filter(Boolean).map((t) => ({ text: t, fontSize: 8 })) })

/**
 * Description pdfmake du compte rendu.
 * @param donnees { cr, affaire, sections (déjà sélectionnées), presences, lots,
 *   interlocuteurs, reglages, versionPour, images: { logo, photos: Map, extraits: Map, planches: [] } }
 */
export function definitionPdf({ cr, affaire, sections, presences, lots, interlocuteurs, zones = [], avancement = [], profils = [], reglages: brut, versionPour, images = {} }) {
  const reglages = reglagesEffectifs(brut)
  const complet = reglages.modele === 'complet'
  const num = String(cr.numero).padStart(2, '0')
  const contexte = { lots, interlocuteurs, zones, profils, dateReference: cr.date_reunion, images, reglages }
  const prochaine = cr.date_prochaine_reunion
    ? `${jour(cr.date_prochaine_reunion, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${cr.heure_prochaine_reunion ? ` à ${cr.heure_prochaine_reunion.slice(0, 5)}` : ''}`
    : 'À définir'

  // Regroupement par zone : la structure en sections laisse place aux zones du
  // planning, le titre de section restant rappelé sur chaque remarque.
  const contenuZones = () => {
    const avecSection = (sections ?? []).flatMap((s) => [
      ...(s.sousSections ?? []).flatMap((ss) => (ss.remarques ?? []).map((r) => ({ ...r, _section: `${s.numero_romain} · ${ss.code}` }))),
      ...(s.directRemarques ?? []).map((r) => ({ ...r, _section: s.numero_romain })),
    ])
    return grouperParZone(avecSection, zones).map((g) => ({
      stack: [
        {
          margin: [0, 10, 0, 6],
          table: { widths: ['*'], body: [[{ text: (g.libelle ?? 'Sans zone').toUpperCase(), bold: true, fontSize: 10.5, fillColor: '#F2F5F9' }]] },
          layout: { hLineWidth: (i) => (i === 1 ? 1.2 : 0), vLineWidth: () => 0, hLineColor: () => '#1B3A5C', paddingLeft: () => 6, paddingTop: () => 5, paddingBottom: () => 5 },
        },
        tableauRemarques(g.elements, contexte),
      ],
    }))
  }

  const contenuSections = (sections ?? []).map((s) => ({
    stack: [
      {
        margin: [0, 10, 0, 6],
        table: { widths: ['*'], body: [[{ text: [{ text: `${s.numero_romain}  `, color: COULEUR.orange }, (s.titre ?? '').toUpperCase()], bold: true, fontSize: 10.5, fillColor: '#FFF8F5' }]] },
        layout: { hLineWidth: (i) => (i === 1 ? 1.2 : 0), vLineWidth: () => 0, hLineColor: () => COULEUR.orange, paddingLeft: () => 6, paddingTop: () => 5, paddingBottom: () => 5 },
      },
      ...(s.sousSections ?? []).flatMap((ss) => [
        { text: `${ss.code} — ${ss.titre}`, bold: true, fontSize: 9.5, margin: [2, 2, 0, 4] },
        tableauRemarques(ss.remarques ?? [], contexte),
      ]),
      ...((s.directRemarques ?? []).length > 0 || (s.sousSections ?? []).length === 0
        ? [tableauRemarques(s.directRemarques ?? [], contexte)]
        : []),
    ],
  }))

  const planches = ['planches', 'les_deux'].includes(reglages.plans) ? images.planches ?? [] : []

  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    info: { title: `Compte rendu n°${num}${affaire?.nom ? ` — ${affaire.nom}` : ''}`, author: 'JGA Architectes' },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COULEUR.texte, lineHeight: 1.15 },
    footer: piedPdf,
    content: [
      ...entetePdf({
        logo: images.logo,
        titre: `Réunion n°${num}`,
        sousTitre: cr.date_reunion ? jour(cr.date_reunion, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date non définie',
        emis: cr.statut === 'emis', dateEmission: cr.date_emission, versionPour,
      }),
      blocAffaire(affaire),
      {
        table: { widths: ['auto', '*'], body: [[{ text: 'PROCHAINE RÉUNION', bold: true, fontSize: 8, color: COULEUR.orange }, { text: prochaine, bold: true }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#FDEFE9', paddingLeft: () => 8, paddingTop: () => 5, paddingBottom: () => 5 },
        margin: [0, 0, 0, 6],
      },
      ...blocsPresences(presences, complet),
      ...(reglages.avancement === 'oui' ? blocAvancement(avancement) : []),
      ...(reglages.zones === 'grouper' ? contenuZones() : contenuSections),
      ...blocPlanches(planches),
    ],
  }
}

// ─── Blocs communs aux documents (compte rendu, OPR) ─────────────────────────

export function piedPdf(page, pages) {
  return {
    margin: [36, 14, 36, 0],
    columns: [
      { text: PIED_AGENCE, fontSize: 7, color: COULEUR.gris },
      { text: `Page ${page} / ${pages}`, fontSize: 7, color: COULEUR.gris, alignment: 'right', width: 70 },
    ],
  }
}

export function entetePdf({ logo, titre, sousTitre, emis, dateEmission, versionPour }) {
  return [
    {
      columns: [
        logo ? { image: logo, fit: [90, 44], width: 100 } : { text: '', width: 100 },
        {
          width: '*', alignment: 'center',
          stack: [
            { text: titre, fontSize: 20, bold: true },
            { text: sousTitre, fontSize: 13, color: COULEUR.orange },
          ],
        },
        {
          width: 100, alignment: 'right', fontSize: 8,
          stack: emis
            ? [{ text: 'Émis', bold: true, color: '#2A8A4E' }, ...(dateEmission ? [{ text: `le ${new Date(dateEmission).toLocaleDateString('fr-FR')}`, color: COULEUR.gris }] : [])]
            : [{ text: 'Brouillon', color: COULEUR.grisClair }],
        },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 6, x2: LARGEUR_UTILE, y2: 6, lineWidth: 1.5, lineColor: COULEUR.orange }], margin: [0, 0, 0, 10] },
    ...(versionPour ? [{ text: `Version pour : ${versionPour}`, bold: true, fontSize: 10, color: COULEUR.orange, margin: [0, 0, 0, 8] }] : []),
  ]
}

export function blocAffaire(affaire) {
  return {
    table: {
      widths: ['*', 70, '*', '*'],
      body: [
        ['Affaire', 'Code', 'Adresse', "Maître d'ouvrage"].map((t) => ({ text: t.toUpperCase(), fontSize: 7, color: COULEUR.gris })),
        [
          { text: affaire?.nom ?? '—', bold: true },
          { text: affaire?.code_affaire ?? '—' },
          { text: [affaire?.projet_adresse, affaire?.projet_commune].filter(Boolean).join(' ') || '—' },
          { text: affaire?.moa_nom ?? '—' },
        ],
      ],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#F5F5F5', paddingLeft: () => 8, paddingTop: () => 3, paddingBottom: () => 3 },
    margin: [0, 0, 0, 8],
  }
}

/** Feuille de présence : légende, interlocuteurs, entreprises (coordonnées si `complet`) */
export function blocsPresences(presences, complet) {
  const participants = (presences ?? []).map((p) => ({ p, v: affichagePresence(p) }))
  const interlos = participants.filter((l) => l.v.type === 'interlocuteur').sort((a, b) => a.v.ordre - b.v.ordre)
  const entreprises = participants.filter((l) => l.v.type === 'entreprise').sort((a, b) => (a.v.lotNumero ?? 99) - (b.v.lotNumero ?? 99))

  const colonnesInterlos = [
    { titre: 'Rôle', largeur: 80, cellule: ({ v }) => ({ text: v.categorieLabel || CATEGORIES[v.categorie] || v.categorie || '', fontSize: 8, color: COULEUR.gris }) },
    { titre: 'Contact', largeur: '*', cellule: ({ v }) => ({ stack: [{ text: v.prenom || v.nom !== v.organisation ? v.nom : '', bold: true, fontSize: 8 }, ...(v.organisation ? [{ text: v.organisation, fontSize: 7.5, color: COULEUR.gris }] : [])] }) },
    ...(complet ? [
      { titre: 'Adresse', largeur: 100, cellule: ({ v }) => ({ text: v.adresse ?? '', fontSize: 7.5 }) },
      { titre: 'Email / Tél', largeur: 110, cellule: celluleContact },
    ] : []),
    { titre: 'Présence', largeur: 44, cellule: cellulePresence },
    { titre: 'Convoqué', largeur: 50, cellule: celluleConvoque },
  ]
  const colonnesEntreprises = [
    { titre: 'Lot', largeur: 110, cellule: ({ v }) => ({ text: v.lotNom ? `Lot ${v.lotNumero ?? ''} — ${v.lotNom}` : '—', fontSize: 8 }) },
    { titre: 'Entreprise', largeur: '*', cellule: ({ v }) => ({ stack: [{ text: v.entreprise ?? '—', bold: true, fontSize: 8 }, ...(v.contact ? [{ text: v.contact, fontSize: 7.5, color: COULEUR.gris }] : [])] }) },
    ...(complet ? [{ titre: 'Email / Tél', largeur: 120, cellule: celluleContact }] : []),
    { titre: 'Présence', largeur: 44, cellule: cellulePresence },
    { titre: 'Convoqué', largeur: 50, cellule: celluleConvoque },
  ]

  return [
    ...(participants.length > 0 ? [{ text: 'Présence : P présent · R retard · A absent · E excusé', fontSize: 7.5, color: COULEUR.gris, margin: [0, 2, 0, 0] }] : []),
    ...tableauPresences('Personnes relatives au projet', interlos, colonnesInterlos),
    ...tableauPresences('Entreprises', entreprises, colonnesEntreprises),
  ]
}

/**
 * Tableau d'avancement des lots. Les lignes arrivent calculées
 * (`avancementLogique.js`) : ce sont celles du jour de la réunion, ou celles
 * figées à l'émission.
 */
export function blocAvancement(lignes) {
  if (!lignes?.length) return []
  const total = lignes.reduce((acc, l) => {
    acc.jours += l.jours
    acc.realise += l.realise * l.jours
    acc.prevu += l.prevu * l.jours
    return acc
  }, { jours: 0, realise: 0, prevu: 0 })
  const moyenne = (v) => (total.jours ? Math.round(v / total.jours) : 0)
  const ecart = (l) => {
    const e = l.realise - l.prevu
    return { text: e === 0 ? '—' : `${e > 0 ? '+' : ''}${e} pts`, fontSize: 8, alignment: 'right', color: e <= -5 ? '#B8412C' : e >= 5 ? '#2A8A4E' : COULEUR.gris }
  }

  return [
    { text: 'AVANCEMENT DES LOTS', bold: true, fontSize: 10.5, color: COULEUR.orange, margin: [0, 10, 0, 4] },
    {
      layout: { ...tableauFin, fillColor: (i) => (i === 0 ? COULEUR.texte : i % 2 === 0 ? '#FAFAFA' : null) },
      table: {
        headerRows: 1,
        widths: ['*', 50, 50, 60],
        body: [
          [
            { text: 'Lot', bold: true, fontSize: 8, color: 'white' },
            { text: 'Réalisé', bold: true, fontSize: 8, color: 'white', alignment: 'right' },
            { text: 'Prévu', bold: true, fontSize: 8, color: 'white', alignment: 'right' },
            { text: 'Écart', bold: true, fontSize: 8, color: 'white', alignment: 'right' },
          ],
          ...lignes.map((l) => [
            { text: l.nom, fontSize: 8 },
            { text: `${l.realise} %`, fontSize: 8, bold: true, alignment: 'right' },
            { text: `${l.prevu} %`, fontSize: 8, color: COULEUR.gris, alignment: 'right' },
            ecart(l),
          ]),
          [
            { text: 'Opération', bold: true, fontSize: 8 },
            { text: `${moyenne(total.realise)} %`, bold: true, fontSize: 8, alignment: 'right' },
            { text: `${moyenne(total.prevu)} %`, fontSize: 8, color: COULEUR.gris, alignment: 'right' },
            ecart({ realise: moyenne(total.realise), prevu: moyenne(total.prevu) }),
          ],
        ],
      },
    },
  ]
}

export function blocPlanches(planches) {
  if (!planches?.length) return []
  return [
    { text: 'PLANS', bold: true, fontSize: 10.5, color: COULEUR.orange, pageBreak: 'before', margin: [0, 0, 0, 8] },
    ...planches.map((p) => ({
      unbreakable: true, margin: [0, 0, 0, 14],
      stack: [
        { text: p.titre, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
        { image: p.image, fit: [LARGEUR_UTILE, 700], alignment: 'center' },
      ],
    })),
  ]
}
