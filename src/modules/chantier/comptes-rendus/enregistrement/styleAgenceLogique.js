// ─── La façon d'écrire de l'agence (lot 3 de la visite enregistrée) ─────────
//
// L'IA ne s'entraîne pas : à chaque analyse, elle reçoit un guide de rédaction
// et des exemples réels. Le guide de départ ci-dessous a été tiré de CR de
// l'agence (2024-2026, plusieurs rédacteurs) ; il ne cite aucune affaire réelle,
// le dépôt étant public. L'agence le modifie dans l'app (table
// `agence_reglages`, migration 059) ; sans réglage enregistré, c'est lui qui part.
// Les exemples sont pris dans les CR émis (`choisirExemples`).
// Pur (tests/style-agence.test.js).

import { cleNom } from '../../planning/importPlanning'

export const CLE_GUIDE = 'guide_redaction_ia'

export const GUIDE_PAR_DEFAUT = `Ton et forme
- Style de compte rendu de maîtrise d'œuvre : court, factuel, sans formule de politesse, sans « je » ni « nous ». Une remarque = un sujet.
- Une demande commence par l'action, à l'infinitif : « Transmettre vos fiches techniques au BC et à l'architecte. », « Reprendre le joint en pied de menuiserie. », « Prévoir un capotage des tubes de la PAC. », « Fournir un devis avant intervention. »
- Un constat dit ce qui a été vu, puis ce qu'il faut faire : « Volet de la chambre Nord posé à l'envers. Le reprendre rapidement. »
- « L'entreprise doit… » ou le nom de l'entreprise en capitales quand il faut dire qui agit, surtout si un autre lot est concerné : « Bavette fournie et posée par le lot menuiseries aluminium. »
- On s'adresse à l'entreprise par « vos » : « Transmettre vos DOE. », « Merci de chiffrer la plus-value. »
- « Attention : … » pour un risque ou un point de vigilance ; « Pour rappel, … » pour une règle déjà dite.

Précision
- Toujours localiser : bâtiment, niveau (RDC, R+1), logement ou pièce, façade (Nord, Sud…), repère (ME12). Ex. : « Au R+1, chambre du logement Sud : … »
- Garder les chiffres dits : cotes en cm, quantités (« 17 protections d'angle à 90° »), références et teintes (« RAL 7016 », « carrelage gris 60x60 »).
- Planning en semaines et en jours : « Intervention S31 – 2 jours. », « Livraison S37, 2 semaines d'intervention. », « Intervention lundi 29 juin. »
- Dates au format 15/10 ou 15/10/2026.

Suivi d'une remarque existante
- La suite est courte et dit le nouvel état : « Reçu le 08/04. », « Transmis le 28/04. », « Posé. Reste la porte du vestiaire. », « Toujours pas réalisé. »
- Ne pas recopier la remarque d'origine dans la suite.
- Décisions : « Validé par le MO. », « Ok sur le principe, détail à produire. », « Avis du BC demandé. »
- Montants : « À chiffrer. », « Transmettre un devis. », « Plus-value à fournir. », « À déduire. »

Statut, d'après ce qui est dit
- Rappel d'une demande déjà faite, urgence, retard qui pose problème : urgent.
- Information sans action (« Pour mémoire ») : pour_memoire.
- « À prévoir », « à programmer » plus tard : a_prevoir.
- Commencé : en_cours. En attente d'un retour, d'un avis, d'une validation : en_attente.
- Réglé, posé, reçu : fait.

Abréviations de l'agence, à garder telles quelles
MO / MOA, MOE, BC (bureau de contrôle), CSPS, BET, OPC, EXE, DOE, DGD, PPSPS, VIC, DC4, FT (fiches techniques), FDES, PAC, VMC, EP, EU, EF, ECS, RDC, R+1, Hsp, BA13, CF (coupe-feu), PMR, ITE, DPGF, RAL, S37 (semaine 37).

À éviter
- Les initiales du rédacteur et les « Pour : … » : le destinataire est porté par la remarque.
- La paraphrase de la discussion (« Il a été discuté que… ») : seulement ce qui est décidé ou demandé.`

/** Le guide qui part chez l'IA : celui de l'agence, ou celui de départ. */
export function guideEffectif(enregistre) {
  const texte = String(enregistre ?? '').trim()
  return texte || GUIDE_PAR_DEFAUT
}

export const EXEMPLES_MAX = 40
const MEME_AFFAIRE_MAX = 15
const LONGUEUR_MIN = 12
const LONGUEUR_MAX = 400

const propre = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()

/**
 * Exemples de rédaction, pris dans les remarques des CR émis : d'abord la
 * même affaire (continuité du vocabulaire), puis les autres affaires pour les
 * mêmes lots (rapprochés par le nom), puis le reste. Seules les remarques de
 * l'agence comptent — pas celles d'un intervenant extérieur ni une proposition
 * de l'IA restée à valider — et une remarque recopiée de visite en visite ne
 * compte qu'une fois.
 * @param remarques lignes de cr_remarques, du plus récent au plus ancien, avec
 *   `lot_nom` et `cr_affaire_id` aplatis
 * @returns [« Gros œuvre : texte », …]
 */
export function choisirExemples({ remarques = [], affaireId, crId = null, lots = [], auteursExterieurs = [], max = EXEMPLES_MAX } = {}) {
  const exterieurs = new Set(auteursExterieurs)
  const lotsAffaire = new Set(lots.map((l) => cleNom(l.nom)).filter(Boolean))
  const vus = new Set()
  const candidates = []
  for (const r of remarques) {
    const texte = propre(r.description)
    if (texte.length < LONGUEUR_MIN || texte.length > LONGUEUR_MAX) continue
    if (r.a_valider || r.cr_id === crId || exterieurs.has(r.created_by)) continue
    if (!r.lot_id && !r.interlocuteur_id) continue
    const cleSuivi = r.suivi_id ? `s:${r.suivi_id}` : null
    const cleTexte = `t:${cleNom(texte)}`
    if ((cleSuivi && vus.has(cleSuivi)) || vus.has(cleTexte)) continue
    if (cleSuivi) vus.add(cleSuivi)
    vus.add(cleTexte)
    const destinataire = propre(r.lot_nom) || propre(r.copie_destinataire)
    candidates.push({
      ligne: destinataire ? `${destinataire} : ${texte}` : texte,
      groupe: (r.cr_affaire_id ?? r.affaire_id) === affaireId ? 0 : lotsAffaire.has(cleNom(r.lot_nom)) ? 1 : 2,
    })
  }
  const memeAffaire = candidates.filter((c) => c.groupe === 0).slice(0, MEME_AFFAIRE_MAX)
  const memesLots = candidates.filter((c) => c.groupe === 1)
  const autres = candidates.filter((c) => c.groupe === 2)
  return [...memeAffaire, ...memesLots, ...autres].slice(0, max).map((c) => c.ligne)
}
