// ─── Procès-verbaux de réception : logique pure ──────────────────────────────
//
// Cinq documents à signer à la main, remplis depuis l'affaire, le lot, la
// visite et ses réserves, complétés par quelques champs saisis :
// - marchés publics (CCAG Travaux, art. 41) : PV des opérations préalables à
//   la réception, propositions du maître d'œuvre, décision de réception ;
// - marchés privés (Code civil, art. 1792-6) : PV de réception ;
// - PV de levée des réserves.
// Modèles à faire valider par l'agence avant tout usage contractuel.

import { COULEUR, jour, tableauFin, piedPdf, entetePdf, blocAffaire } from '../comptes-rendus/rapportLogique'
import { libelleLot } from './oprLogique'

export const TYPES_PV = [
  { code: 'public_opr', marche: 'public', titre: 'Procès-verbal des opérations préalables à la réception', court: 'PV des OPR', reference: 'Article 41.2 du CCAG Travaux' },
  { code: 'public_propositions', marche: 'public', titre: 'Propositions du maître d’œuvre relatives à la réception', court: 'Propositions du MOE', reference: 'Article 41.3 du CCAG Travaux' },
  { code: 'public_decision', marche: 'public', titre: 'Décision de réception des travaux', court: 'Décision de réception', reference: 'Article 41.3 du CCAG Travaux' },
  { code: 'prive_reception', marche: 'prive', titre: 'Procès-verbal de réception des travaux', court: 'PV de réception', reference: 'Article 1792-6 du Code civil' },
  { code: 'levee', marche: 'tous', titre: 'Procès-verbal de levée des réserves', court: 'PV de levée des réserves', reference: null },
]
const PAR_CODE = new Map(TYPES_PV.map((t) => [t.code, t]))

// Constatations des OPR (art. 41.2) : oui / non / sans objet
export const CONSTATATIONS_OPR = [
  { cle: 'reconnaissance', libelle: 'Reconnaissance des ouvrages exécutés' },
  { cle: 'epreuves', libelle: 'Épreuves prévues au marché réalisées' },
  { cle: 'inexecution', libelle: 'Toutes les prestations prévues au marché sont exécutées' },
  { cle: 'pose', libelle: 'Conditions de pose des équipements conformes aux spécifications des fournisseurs' },
  { cle: 'malfacons', libelle: 'Absence d’imperfections ou de malfaçons' },
  { cle: 'repliement', libelle: 'Installations de chantier repliées, terrains et lieux remis en état' },
  { cle: 'achevement', libelle: 'Travaux achevés' },
]

export const CHAMPS_DEFAUT = {
  numero_marche: '',
  date_avis_achevement: '',
  constatations: {},        // cle → 'oui' | 'non' | 'so'
  titulaire_refus_signature: false,
  decision: 'avec_reserves', // sans_reserves | avec_reserves | refus
  date_effet: '',
  delai_levee: '',           // date limite de levée des réserves
  motifs: '',
  observations: '',
  date_pv_opr: '',
  date_propositions: '',
  date_reception: '',        // pour la levée : réception de référence
  lieu: 'Lyon',
  nb_exemplaires: '3',
}

/** Réserves à reprendre dans un PV, triées par numéro */
export function reservesPourPv(type, { reserves, lotId }) {
  const duLot = (reserves ?? []).filter((r) => r.lot_id === lotId).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
  if (type === 'levee') {
    return {
      levees: duLot.filter((r) => r.statut === 'levee'),
      restantes: duLot.filter((r) => r.statut === 'ouverte' || r.statut === 'contestee'),
    }
  }
  return { reserves: duLot.filter((r) => r.statut === 'ouverte' || r.statut === 'contestee') }
}

export function nomFichierPv(type, lot, affaire, date) {
  const t = PAR_CODE.get(type)
  return `${[t.court, affaire?.nom, lot ? libelleLot(lot) : null, date].filter(Boolean).join(' – ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ')}.pdf`
}

// ─── Éléments de mise en page ────────────────────────────────────────────────

function caseACocher(cochee) {
  return {
    width: 12,
    canvas: [
      { type: 'rect', x: 0, y: 1, w: 8, h: 8, lineWidth: 0.8, lineColor: COULEUR.texte },
      ...(cochee ? [
        { type: 'line', x1: 1.5, y1: 2.5, x2: 6.5, y2: 7.5, lineWidth: 1.2 },
        { type: 'line', x1: 6.5, y1: 2.5, x2: 1.5, y2: 7.5, lineWidth: 1.2 },
      ] : []),
    ],
  }
}

function option(cochee, texte) {
  return { columns: [caseACocher(cochee), { text: texte, width: '*' }], columnGap: 4, margin: [0, 2, 0, 2] }
}

function titreSection(texte) {
  return { text: texte.toUpperCase(), bold: true, fontSize: 9.5, color: COULEUR.orange, margin: [0, 12, 0, 5] }
}

function ligneChamp(libelle, valeur) {
  return { text: [{ text: `${libelle} : `, color: COULEUR.gris }, { text: valeur || '................................................', bold: !!valeur }], margin: [0, 2, 0, 2] }
}

function blocMarche({ lot, entreprise, champs, marche }) {
  return {
    table: {
      widths: ['*', '*', 120],
      body: [
        ['Lot', marche === 'public' ? 'Titulaire' : marche === 'prive' ? 'Entrepreneur' : 'Entreprise', 'Marché n°'].map((t) => ({ text: t.toUpperCase(), fontSize: 7, color: COULEUR.gris })),
        [
          { text: lot ? libelleLot(lot) : '—', bold: true },
          { text: entreprise?.raison_sociale ?? '—', bold: true },
          { text: champs.numero_marche || '—' },
        ],
      ],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#F5F5F5', paddingLeft: () => 8, paddingTop: () => 3, paddingBottom: () => 3 },
    margin: [0, 0, 0, 6],
  }
}

function tableauReserves(reserves, { avecDate = false, vide = 'Aucune réserve.' } = {}) {
  if (!reserves.length) return { text: vide, italics: true, color: COULEUR.gris, margin: [0, 2, 0, 4] }
  return {
    layout: tableauFin,
    table: {
      headerRows: 1, dontBreakRows: true,
      widths: [30, 90, '*', ...(avecDate ? [60] : [])],
      body: [
        ['N°', 'Localisation', 'Réserve', ...(avecDate ? ['Levée le'] : [])].map((t) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, color: COULEUR.gris })),
        ...reserves.map((r) => [
          { text: String(r.numero ?? ''), bold: true, color: COULEUR.orange },
          { text: r.localisation ?? '—', color: COULEUR.gris },
          { text: r.description },
          ...(avecDate ? [{ text: r.date_statut ? new Date(r.date_statut).toLocaleDateString('fr-FR') : '—' }] : []),
        ]),
      ],
    },
  }
}

// Cadres de signature : chaque signataire, nom et qualité, date, place pour signer
function signatures(signataires, { lieu, date } = {}) {
  return [
    ...(lieu || date ? [{ text: `Fait à ${lieu || '....................'}, le ${date ? jour(date) : '....................'}`, margin: [0, 14, 0, 6] }] : [{ text: '', margin: [0, 8, 0, 0] }]),
    {
      unbreakable: true,
      table: {
        widths: signataires.map(() => '*'),
        body: [
          signataires.map((s) => ({ text: s.qualite, bold: true, fontSize: 8.5 })),
          signataires.map((s) => ({ stack: [
            { text: `Nom : ${s.nom ?? ''}`, fontSize: 8, color: COULEUR.gris },
            { text: 'Date :', fontSize: 8, color: COULEUR.gris, margin: [0, 2, 0, 0] },
            { text: 'Signature :', fontSize: 8, color: COULEUR.gris, margin: [0, 2, 0, 46] },
            ...(s.mention ? [{ text: s.mention, fontSize: 7.5, italics: true, color: COULEUR.gris }] : []),
          ] })),
        ],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#C9C4C0', vLineColor: () => '#C9C4C0', paddingLeft: () => 6, paddingTop: () => 5 },
    },
  ]
}

// ─── Contenu de chaque PV ────────────────────────────────────────────────────

function contenuPvOpr(d) {
  const { champs, visite, reserves } = d
  const ouiNonSo = (cle) => champs.constatations?.[cle] ?? ''
  return [
    { text: [
      'Les opérations préalables à la réception des travaux du lot désigné ci-dessus ont été effectuées le ',
      { text: jour(visite?.date_visite) || '....................', bold: true },
      ...(champs.date_avis_achevement ? [', suite à l’avis d’achèvement des travaux du titulaire du ', { text: jour(champs.date_avis_achevement), bold: true }] : []),
      ', le titulaire ayant été convoqué.',
    ], margin: [0, 4, 0, 4] },
    titreSection('Constatations'),
    {
      layout: tableauFin,
      table: {
        headerRows: 1, widths: ['*', 34, 34, 50],
        body: [
          ['', 'Oui', 'Non', 'Sans objet'].map((t) => ({ text: t, bold: true, fontSize: 7.5, color: COULEUR.gris, alignment: t ? 'center' : 'left' })),
          ...CONSTATATIONS_OPR.map((c) => [
            { text: c.libelle },
            { ...caseACocher(ouiNonSo(c.cle) === 'oui'), alignment: 'center', margin: [9, 0, 0, 0] },
            { ...caseACocher(ouiNonSo(c.cle) === 'non'), margin: [9, 0, 0, 0] },
            { ...caseACocher(ouiNonSo(c.cle) === 'so'), margin: [18, 0, 0, 0] },
          ]),
        ],
      },
    },
    titreSection('Imperfections, malfaçons et prestations non exécutées'),
    tableauReserves(reserves.reserves, { vide: 'Aucune réserve constatée pour ce lot.' }),
    ...(champs.observations ? [titreSection('Observations'), { text: champs.observations }] : []),
    { text: 'Le présent procès-verbal est dressé sur-le-champ par le maître d’œuvre et signé par lui et par le titulaire. Il est transmis au maître d’ouvrage avec les propositions du maître d’œuvre.', fontSize: 8, color: COULEUR.gris, margin: [0, 10, 0, 0] },
    ...signatures([
      { qualite: 'Le maître d’œuvre', nom: d.moe },
      { qualite: 'Le titulaire', nom: d.entreprise?.raison_sociale, mention: champs.titulaire_refus_signature ? 'Le titulaire a refusé de signer.' : 'Si le titulaire refuse de signer, il en est fait mention.' },
    ], { lieu: champs.lieu, date: visite?.date_visite }),
  ]
}

function blocDecision(champs, { verbe }) {
  return [
    option(champs.decision === 'sans_reserves', `${verbe} la réception sans réserve.`),
    option(champs.decision === 'avec_reserves', `${verbe} la réception avec les réserves listées ci-dessous, qui devront être levées avant le ${champs.delai_levee ? jour(champs.delai_levee) : '....................'}.`),
    option(champs.decision === 'refus', `Ne pas ${verbe.toLowerCase()} la réception, pour les motifs suivants : ${champs.decision === 'refus' && champs.motifs ? champs.motifs : '..................................................'}`),
  ]
}

function contenuPropositions(d) {
  const { champs, reserves } = d
  return [
    { text: [
      'Au vu du procès-verbal des opérations préalables à la réception du ',
      { text: jour(champs.date_pv_opr || d.visite?.date_visite) || '....................', bold: true },
      ', le maître d’œuvre propose au maître d’ouvrage de :',
    ], margin: [0, 4, 0, 6] },
    ...blocDecision(champs, { verbe: 'Prononcer' }),
    ligneChamp('Date d’achèvement des travaux proposée', champs.date_effet ? jour(champs.date_effet) : ''),
    titreSection('Réserves'),
    tableauReserves(champs.decision === 'avec_reserves' ? reserves.reserves : [], { vide: champs.decision === 'avec_reserves' ? 'Aucune réserve.' : 'Sans objet.' }),
    ...(champs.observations ? [titreSection('Autres propositions'), { text: champs.observations }] : []),
    ...signatures([{ qualite: 'Le maître d’œuvre', nom: d.moe }], { lieu: champs.lieu, date: champs.date_propositions }),
  ]
}

function contenuDecision(d) {
  const { champs, reserves } = d
  return [
    { text: [
      'Au vu du procès-verbal des opérations préalables à la réception du ',
      { text: jour(champs.date_pv_opr || d.visite?.date_visite) || '....................', bold: true },
      ' et des propositions du maître d’œuvre du ',
      { text: jour(champs.date_propositions) || '....................', bold: true },
      ', le maître d’ouvrage décide de :',
    ], margin: [0, 4, 0, 6] },
    ...blocDecision(champs, { verbe: 'Prononcer' }),
    ligneChamp('Date d’achèvement des travaux retenue (date d’effet de la réception)', champs.date_effet ? jour(champs.date_effet) : ''),
    titreSection('Réserves'),
    tableauReserves(champs.decision === 'avec_reserves' ? reserves.reserves : [], { vide: champs.decision === 'avec_reserves' ? 'Aucune réserve.' : 'Sans objet.' }),
    { text: 'Le délai de garantie court à compter de la date d’effet de la réception. La présente décision est notifiée au titulaire.', fontSize: 8, color: COULEUR.gris, margin: [0, 10, 0, 0] },
    ...signatures([
      { qualite: 'Le maître d’ouvrage (représentant du pouvoir adjudicateur)', nom: d.affaire?.moa_nom },
      { qualite: 'Notification au titulaire', nom: d.entreprise?.raison_sociale, mention: 'Reçu le :' },
    ], { lieu: champs.lieu, date: champs.date_reception }),
  ]
}

function contenuPrive(d) {
  const { champs, reserves, visite } = d
  return [
    { text: [
      'Après visite contradictoire des travaux effectuée le ',
      { text: jour(visite?.date_visite) || '....................', bold: true },
      ' en présence des parties soussignées, le maître d’ouvrage déclare :',
    ], margin: [0, 4, 0, 6] },
    option(champs.decision === 'sans_reserves', 'Accepter les travaux et prononcer la réception sans réserve.'),
    option(champs.decision === 'avec_reserves', `Prononcer la réception avec les réserves listées ci-dessous. Les travaux correspondants seront exécutés par l’entrepreneur avant le ${champs.delai_levee ? jour(champs.delai_levee) : '....................'}.`),
    option(champs.decision === 'refus', `Refuser la réception pour les motifs suivants : ${champs.decision === 'refus' && champs.motifs ? champs.motifs : '..................................................'}`),
    ligneChamp('Date d’effet de la réception', champs.date_effet ? jour(champs.date_effet) : ''),
    titreSection('Réserves'),
    tableauReserves(champs.decision === 'avec_reserves' ? reserves.reserves : [], { vide: champs.decision === 'avec_reserves' ? 'Aucune réserve.' : 'Sans objet.' }),
    ...(champs.observations ? [titreSection('Observations'), { text: champs.observations }] : []),
    { text: 'La réception constitue le point de départ de la garantie de parfait achèvement (un an), de la garantie de bon fonctionnement (deux ans) et de la responsabilité décennale.', fontSize: 8, color: COULEUR.gris, margin: [0, 10, 0, 0] },
    ...signatures([
      { qualite: 'Le maître d’ouvrage', nom: d.affaire?.moa_nom },
      { qualite: 'L’entrepreneur', nom: d.entreprise?.raison_sociale },
      { qualite: 'Le maître d’œuvre', nom: d.moe },
    ], { lieu: champs.lieu, date: champs.date_reception || visite?.date_visite }),
    { text: `Fait en ${champs.nb_exemplaires || '....'} exemplaires originaux.`, fontSize: 8, color: COULEUR.gris, margin: [0, 6, 0, 0] },
  ]
}

function contenuLevee(d) {
  const { champs, reserves, visite } = d
  return [
    { text: [
      'La réception des travaux du lot désigné ci-dessus a été prononcée avec réserves',
      ...(champs.date_reception ? [' le ', { text: jour(champs.date_reception), bold: true }] : []),
      '. Lors de la visite du ',
      { text: jour(visite?.date_visite) || '....................', bold: true },
      ', il a été constaté :',
    ], margin: [0, 4, 0, 6] },
    titreSection('Réserves levées'),
    tableauReserves(reserves.levees, { avecDate: true, vide: 'Aucune réserve levée.' }),
    titreSection('Réserves restant à lever'),
    tableauReserves(reserves.restantes, { vide: 'Aucune : toutes les réserves sont levées.' }),
    option(reserves.restantes.length === 0, 'Toutes les réserves sont levées.'),
    option(reserves.restantes.length > 0, `Les réserves restantes devront être levées avant le ${champs.delai_levee ? jour(champs.delai_levee) : '....................'}.`),
    ...(champs.observations ? [titreSection('Observations'), { text: champs.observations }] : []),
    ...signatures([
      { qualite: 'Le maître d’œuvre', nom: d.moe },
      { qualite: 'L’entrepreneur', nom: d.entreprise?.raison_sociale },
      { qualite: 'Le maître d’ouvrage', nom: d.affaire?.moa_nom },
    ], { lieu: champs.lieu, date: visite?.date_visite }),
  ]
}

const CONTENUS = {
  public_opr: contenuPvOpr,
  public_propositions: contenuPropositions,
  public_decision: contenuDecision,
  prive_reception: contenuPrive,
  levee: contenuLevee,
}

/**
 * Description pdfmake d'un PV.
 * @param donnees { type, affaire, lot, entreprise, visite, reserves (de l'affaire),
 *   champs, logo, moe (nom du maître d'œuvre) }
 */
export function definitionPv({ type, affaire, lot, entreprise, visite, reserves, champs: brut, logo, moe = 'JGA Architectures' }) {
  const t = PAR_CODE.get(type)
  if (!t) throw new Error(`Type de PV inconnu : ${type}`)
  const champs = { ...CHAMPS_DEFAUT, ...brut }
  const donnees = { affaire, lot, entreprise, visite, champs, moe, reserves: reservesPourPv(type, { reserves, lotId: lot?.id }) }
  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    info: { title: `${t.titre}${affaire?.nom ? ` — ${affaire.nom}` : ''}`, author: 'JGA Architectes' },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COULEUR.texte, lineHeight: 1.2 },
    footer: piedPdf,
    content: [
      ...entetePdf({ logo, titre: t.titre, sousTitre: t.reference ?? (t.marche === 'public' ? 'Marché public de travaux' : ''), emis: false }).map((b, i) => (i === 0
        ? { ...b, columns: b.columns.map((c, j) => (j === 1 ? { ...c, stack: [{ ...c.stack[0], fontSize: 14 }, { ...c.stack[1], fontSize: 9, color: COULEUR.gris }] } : j === 2 ? { text: '', width: 100 } : c)) }
        : b)),
      blocAffaire(affaire),
      blocMarche({ lot, entreprise, champs, marche: t.marche }),
      ...CONTENUS[type](donnees),
    ],
  }
}

// ─── Préparation dans le module ──────────────────────────────────────────────

/** PV proposés pour une visite, selon le type de marché de l'affaire */
export function typesPvPourVisite(visite, marche) {
  if (visite?.type === 'levee') return TYPES_PV.filter((t) => t.code === 'levee')
  return TYPES_PV.filter((t) => t.marche === marche)
}

/**
 * Champs pré-remplis d'un nouveau PV : dates de la visite, date limite de levée
 * la plus lointaine des réserves ouvertes du lot, et ce qui a déjà été saisi
 * dans les autres PV du même lot (numéro de marché, lieu, dates des PV liés).
 */
export function champsInitiaux(type, { visite, pvs, reserves, lotId }) {
  const duLot = (pvs ?? []).filter((p) => p.lot_id === lotId)
  const champsDe = (code) => duLot.find((p) => p.type === code)?.champs ?? {}
  const connus = duLot.reduce((acc, p) => ({ ...acc, ...(p.champs ?? {}) }), {})
  const ouvertes = (reserves ?? []).filter((r) => r.lot_id === lotId && (r.statut === 'ouverte' || r.statut === 'contestee'))
  const delai = ouvertes.map((r) => r.date_limite).filter(Boolean).sort().at(-1) ?? ''
  const base = {
    ...CHAMPS_DEFAUT,
    numero_marche: connus.numero_marche ?? '',
    lieu: connus.lieu ?? CHAMPS_DEFAUT.lieu,
    delai_levee: connus.delai_levee || delai,
  }
  const dateVisite = visite?.date_visite ?? ''
  switch (type) {
    case 'public_opr':
      return { ...base, decision: ouvertes.length ? 'avec_reserves' : 'sans_reserves' }
    case 'public_propositions':
      return { ...base, date_pv_opr: dateVisite, date_effet: dateVisite, date_propositions: dateVisite, decision: ouvertes.length ? 'avec_reserves' : 'sans_reserves' }
    case 'public_decision':
      return {
        ...base, date_pv_opr: dateVisite,
        date_propositions: champsDe('public_propositions').date_propositions ?? '',
        date_effet: champsDe('public_propositions').date_effet ?? dateVisite,
        decision: champsDe('public_propositions').decision ?? (ouvertes.length ? 'avec_reserves' : 'sans_reserves'),
        date_reception: '',
      }
    case 'prive_reception':
      return { ...base, date_effet: dateVisite, date_reception: dateVisite, decision: ouvertes.length ? 'avec_reserves' : 'sans_reserves' }
    case 'levee':
      return { ...base, date_reception: connus.date_reception || connus.date_effet || '' }
    default:
      return base
  }
}

/** Champs à saisir pour chaque type de PV (dans l'ordre du formulaire) */
export const CHAMPS_PAR_TYPE = {
  public_opr: ['numero_marche', 'date_avis_achevement', 'constatations', 'titulaire_refus_signature', 'observations', 'lieu'],
  public_propositions: ['numero_marche', 'date_pv_opr', 'decision', 'date_effet', 'delai_levee', 'motifs', 'observations', 'date_propositions', 'lieu'],
  public_decision: ['numero_marche', 'date_pv_opr', 'date_propositions', 'decision', 'date_effet', 'delai_levee', 'motifs', 'date_reception', 'lieu'],
  prive_reception: ['numero_marche', 'decision', 'date_effet', 'delai_levee', 'motifs', 'observations', 'date_reception', 'lieu', 'nb_exemplaires'],
  levee: ['numero_marche', 'date_reception', 'delai_levee', 'observations', 'lieu'],
}
