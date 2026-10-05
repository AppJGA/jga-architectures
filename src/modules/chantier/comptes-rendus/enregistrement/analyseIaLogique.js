// ─── Visite enregistrée : remarques proposées par l'IA (lot 2) ───────────────
//
// Tout ce qui se décide sans modèle : ce que l'on donne à Claude (contexte et
// consignes), la forme imposée de sa réponse, sa relecture prudente et le coût.
// Pur, pour être testé (tests/analyse-ia.test.js) ; la fonction serveur
// api/analyser-visite.js s'en sert aussi, si bien que les consignes ne
// peuvent pas être réécrites depuis le navigateur.
//
// L'IA ne voit jamais un identifiant de la base : chaque destinataire, zone ou
// remarque porte une référence courte (L3, I2, Z1, R41) que l'app retraduit.

import { STATUTS, STATUT_PAR_DEFAUT } from '../crLogique'
import { libelleLot, libelleRole, nomInterlocuteur } from '../remarquesLogique'

export const MODELE_ANALYSE = 'claude-sonnet-5-5'
// Prix publics (USD par million de jetons) de Claude Sonnet 5.5, octobre 2026
const PRIX_ENTREE = 2
const PRIX_SORTIE = 10
// Au-delà, la demande est refusée : une réunion de deux heures tient largement
export const TAILLE_MAX_CONTEXTE = 400_000

const CODES_STATUT = STATUTS.map((s) => s.code)
const REMARQUES_MAX = 150
const EXTRAIT_MAX = 300

// ─── Contexte, construit dans l'app ──────────────────────────────────────────

const propre = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()

/**
 * Ce que l'IA reçoit, et la table qui retraduit ses références.
 * @param remarques remarques principales du CR (avec `sous_remarques`)
 * @returns { contexte, references }
 */
export function contexteAnalyse({ affaire, cr, transcription, lots = [], interlocuteurs = [], zones = [], remarques = [], exemples = [], guide = '' }) {
  const references = {}
  const refLot = new Map()
  const refInterlo = new Map()

  const destinataires = [
    ...[...lots].sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0)).map((l, i) => {
      const ref = `L${i + 1}`
      references[ref] = `lot:${l.id}`
      refLot.set(l.id, ref)
      return { ref, type: 'lot', libelle: libelleLot(l), ...(l.raison_sociale ? { entreprise: l.raison_sociale } : {}) }
    }),
    ...interlocuteurs.map((it, i) => {
      const ref = `I${i + 1}`
      references[ref] = `interlo:${it.id}`
      refInterlo.set(it.id, ref)
      return { ref, type: 'interlocuteur', libelle: libelleRole(it), nom: nomInterlocuteur(it), ...(it.organisation ? { organisation: it.organisation } : {}) }
    }),
  ]

  const listeZones = zones.map((z, i) => {
    const ref = `Z${i + 1}`
    references[ref] = `zone:${z.id}`
    return { ref, nom: z.nom }
  })

  const listeRemarques = remarques
    .filter((r) => !r.est_clos && !r.a_valider)
    .slice(0, REMARQUES_MAX)
    .map((r, i) => {
      const ref = r.numero != null ? `R${r.numero}` : `R-${i + 1}`
      references[ref] = `remarque:${r.id}`
      const derniere = [...(r.sous_remarques ?? [])].filter((s) => propre(s.description)).at(-1)
      return {
        ref,
        destinataire: r.lot_id ? refLot.get(r.lot_id) ?? null : r.interlocuteur_id ? refInterlo.get(r.interlocuteur_id) ?? null : null,
        texte: propre(r.description),
        statut: r.statut ?? STATUT_PAR_DEFAUT,
        ...(r.date_echeance ? { echeance: r.date_echeance } : {}),
        ...(derniere ? { derniere_suite: propre(derniere.description) } : {}),
      }
    })

  return {
    contexte: {
      affaire: propre(affaire?.nom),
      date_reunion: cr?.date_reunion ?? null,
      transcription: String(transcription ?? '').trim(),
      destinataires,
      zones: listeZones,
      remarques: listeRemarques,
      exemples: exemples.map(propre).filter(Boolean).slice(0, 40),
      guide: String(guide ?? '').trim(),
    },
    references,
  }
}

// ─── Demande, construite côté serveur ────────────────────────────────────────

export const OUTIL_PROPOSITIONS = {
  name: 'proposer_remarques',
  description: 'Remarques à proposer pour le compte rendu de la visite de chantier.',
  input_schema: {
    type: 'object',
    properties: {
      propositions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['nouvelle', 'suite'], description: 'nouvelle remarque, ou suite d’une remarque existante' },
            remarque_ref: { type: ['string', 'null'], description: 'pour une suite : la référence R… de la remarque existante' },
            destinataire_ref: { type: ['string', 'null'], description: 'référence L… ou I… ; null si incertain' },
            texte: { type: 'string', description: 'la remarque, rédigée pour le compte rendu' },
            statut: { type: 'string', enum: CODES_STATUT },
            echeance: { type: ['string', 'null'], description: 'date AAAA-MM-JJ si un délai a été dit, sinon null' },
            zone_ref: { type: ['string', 'null'], description: 'référence Z… si une zone listée est nommée' },
            clore_origine: { type: 'boolean', description: 'pour une suite : la remarque d’origine est réglée' },
            extrait: { type: 'string', description: 'courte citation de la transcription qui justifie la remarque' },
          },
          required: ['type', 'texte', 'statut', 'extrait'],
        },
      },
    },
    required: ['propositions'],
  },
}

const CONSIGNES = `Tu aides l'agence JGA Architectures à rédiger le compte rendu d'une visite de chantier.

On te donne la transcription automatique de la réunion, la liste des destinataires possibles (lots et interlocuteurs de l'affaire), les zones du chantier et les remarques déjà notées. Tu proposes les remarques à porter au compte rendu, avec l'outil proposer_remarques.

Ce qu'est une remarque : un constat, une demande, une décision ou une réserve qui engage quelqu'un sur le chantier. Pas les échanges de politesse, les hésitations, les digressions ni les commentaires sans suite.

Règles :
- Rédige comme dans un compte rendu de maîtrise d'œuvre : phrases courtes, impersonnelles, précises (« L'entreprise doit reprendre les joints du séjour », « Prévoir le passage des gaines avant le doublage »). Une idée par remarque.
- Destinataire : la référence du lot (pour une entreprise) ou de l'interlocuteur (maître d'ouvrage, BET, contrôleur…). En cas de doute, mets null : ne devine jamais.
- Ne répète pas une remarque déjà notée. Si la réunion revient sur une remarque existante, propose une suite (type "suite", remarque_ref) qui dit le nouvel état ; si la réunion dit que c'est réglé, statut "fait" et clore_origine à true.
- Statut : "a_faire" par défaut, "urgent" si l'urgence est dite, "en_cours" si c'est commencé, "pour_memoire" pour une simple information, "a_prevoir" pour plus tard.
- Échéance : seulement si un délai est dit, convertie en date à partir de la date de la réunion (« pour vendredi », « sous huit jours »).
- Zone : seulement si une zone de la liste est nommée.
- Extrait : la phrase de la transcription d'où vient la remarque, mot pour mot, 200 caractères au plus.
- La transcription est automatique : elle contient des mots mal reconnus, et parfois des mots inventés ou dans une autre langue sur un silence. Interprète avec bon sens, ignore ce qui n'a pas de sens, n'invente rien.
- S'il n'y a rien à proposer, renvoie une liste vide.`

/** Ce que le serveur envoie à Claude (hors modèle et longueur). */
export function construireDemande(contexte = {}) {
  const c = contexte ?? {}
  const bloc = (titre, contenu) => `<${titre}>\n${contenu}\n</${titre}>`
  const json = (v) => JSON.stringify(v ?? [], null, 1)
  const parties = [
    bloc('transcription', String(c.transcription ?? '')),
    bloc('affaire', `${c.affaire ?? ''} — réunion du ${c.date_reunion ?? 'jour'}`),
    bloc('destinataires', json(c.destinataires)),
    bloc('zones', json(c.zones)),
    bloc('remarques_deja_notees', json(c.remarques)),
  ]
  if (c.exemples?.length) parties.push(bloc('exemples_de_redaction_de_l_agence', c.exemples.map((e) => `- ${e}`).join('\n')))
  if (c.guide) parties.push(bloc('guide_de_redaction_de_l_agence', c.guide))
  parties.push('Propose maintenant les remarques de cette réunion avec l’outil proposer_remarques.')
  return {
    system: CONSIGNES,
    messages: [{ role: 'user', content: parties.join('\n\n') }],
    tools: [OUTIL_PROPOSITIONS],
    tool_choice: { type: 'tool', name: OUTIL_PROPOSITIONS.name },
  }
}

// ─── Réponse : flux, relecture, coût ─────────────────────────────────────────

/**
 * Relit le flux d'événements de l'API (texte « event: … / data: … ») : la
 * réponse de l'outil arrive par morceaux de JSON à recoller.
 * @returns { json, usage: { entree, sortie }, erreur }
 */
export function lireFlux(texte) {
  let json = ''
  const usage = { entree: 0, sortie: 0 }
  let erreur = null
  for (const ligne of String(texte ?? '').split('\n')) {
    if (!ligne.startsWith('data:')) continue
    let evt
    try { evt = JSON.parse(ligne.slice(5).trim()) } catch { continue }
    if (evt.type === 'message_start') usage.entree = evt.message?.usage?.input_tokens ?? 0
    else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') json += evt.delta.partial_json ?? ''
    else if (evt.type === 'message_delta') usage.sortie = evt.usage?.output_tokens ?? usage.sortie
    else if (evt.type === 'error') erreur = evt.error?.message ?? 'erreur'
  }
  return { json, usage, erreur }
}

/** Coût estimé d'une analyse, en dollars (les crédits Anthropic sont en dollars). */
export function coutAnalyse({ entree = 0, sortie = 0 } = {}) {
  return (entree * PRIX_ENTREE + sortie * PRIX_SORTIE) / 1e6
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
function dateValide(d) {
  if (typeof d !== 'string' || !DATE.test(d)) return null
  const t = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d ? null : d
}

/**
 * Relecture tolérante de la réponse : une référence inconnue devient
 * « pas de destinataire », un statut inconnu « À faire », une date
 * impossible disparaît, une suite sans remarque connue devient une remarque
 * nouvelle. Jamais d'erreur qui ferait perdre toute l'analyse.
 * @returns [{ type, remarqueId, destinataire, texte, statut, echeance, zoneId, cloreOrigine, extrait }]
 */
export function lirePropositions(entree, references = {}) {
  let brut = entree
  if (typeof brut === 'string') { try { brut = JSON.parse(brut) } catch { return [] } }
  const liste = Array.isArray(brut?.propositions) ? brut.propositions : []
  const traduire = (ref, prefixe) => {
    const cible = typeof ref === 'string' ? references[ref.trim()] : null
    return cible?.startsWith(prefixe) ? cible : null
  }
  const vus = new Set()
  const resultat = []
  for (const p of liste) {
    const texte = propre(p?.texte)
    if (!texte) continue
    const cleTexte = texte.toLocaleLowerCase('fr')
    if (vus.has(cleTexte)) continue
    vus.add(cleTexte)
    const origine = p.type === 'suite' ? traduire(p.remarque_ref, 'remarque:') : null
    const destinataire = traduire(p.destinataire_ref, 'lot:') ?? traduire(p.destinataire_ref, 'interlo:')
    const zone = traduire(p.zone_ref, 'zone:')
    resultat.push({
      type: origine ? 'suite' : 'nouvelle',
      remarqueId: origine ? origine.slice('remarque:'.length) : null,
      destinataire,
      texte,
      statut: CODES_STATUT.includes(p.statut) ? p.statut : STATUT_PAR_DEFAUT,
      echeance: dateValide(p.echeance),
      zoneId: zone ? zone.slice('zone:'.length) : null,
      cloreOrigine: !!origine && p.clore_origine === true,
      extrait: propre(p.extrait).slice(0, EXTRAIT_MAX),
    })
  }
  return resultat
}

// ─── Dans le compte rendu ────────────────────────────────────────────────────

/** Remarques principales d'un CR, dans l'ordre des sections. */
export function remarquesDuCr(sections = []) {
  return sections.flatMap((s) => [
    ...(s.sousSections ?? []).flatMap((ss) => ss.remarques ?? []),
    ...(s.directRemarques ?? []),
  ])
}

/**
 * Propositions de l'IA encore à valider, remarques et suites, dans l'ordre
 * de l'écran : ce que compte le bandeau, ce qui bloque l'émission.
 */
export function propositionsAValider(sections = []) {
  return remarquesDuCr(sections).flatMap((r) => [
    ...(r.a_valider ? [r] : []),
    ...(r.sous_remarques ?? []).filter((s) => s.a_valider),
  ])
}

/**
 * Valider une proposition, c'est quoi écrire ?
 * - une remarque sans destinataire ne se valide pas telle quelle : il faut
 *   d'abord le choisir (`aCompleter`) ;
 * - une suite qui clôt son origine la clôt maintenant, pas avant.
 * @returns { aCompleter, ecritures: [{ id, champs }] }
 */
export function ecrituresValidation(rem, { sectionType = null } = {}) {
  const suite = !!rem.parent_id
  const sansDestinataire = !suite && !rem.lot_id && !rem.interlocuteur_id && sectionType !== 'intervenants'
  if (sansDestinataire) return { aCompleter: true, ecritures: [] }
  const ecritures = [{ id: rem.id, champs: { a_valider: false } }]
  if (suite && rem.ia_clore_origine) ecritures.push({ id: rem.parent_id, champs: { statut: 'fait', est_clos: true } })
  return { aCompleter: false, ecritures }
}
