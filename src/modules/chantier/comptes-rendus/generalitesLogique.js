// ─── Généralités des comptes rendus (parties I à V) ──────────────────────────
//
// Refonte des comptes rendus, chantier 2 (migration 055). Ce ne sont pas des
// remarques : un texte de cadrage, presque identique d'un CR à l'autre et d'une
// affaire à l'autre, saisi une fois par affaire et imprimé dans chaque CR.
//
// Forme : { parties: [{ id, numero_romain, titre, paragraphes, rubriques:
//   [{ id, code, titre, paragraphes: [{ id, date, texte, suite }] }] }] }
// Les paragraphes vivent dans une rubrique, ou directement dans une partie
// (« IV - RESPECT » n'a pas de rubrique). `suite` : ligne ▶ rattachée à la
// précédente. `date` n'est plus saisie ni imprimée (des généralités valent pour
// tous les comptes rendus) ; elle reste lue pour ne rien perdre.
//
// Tout est pur et immuable, pour être testé (tests/generalites.test.js) :
// l'écran ne fait qu'appeler ces fonctions sur son brouillon.

import { DEFAULT_TEMPLATE_SECTIONS } from '../../../shared/hooks/modeleSections'

const liste = (v) => (Array.isArray(v) ? v : [])
const texte = (v) => (typeof v === 'string' ? v : '')

function paragraphe(p) {
  return { id: p?.id ?? null, date: p?.date ?? null, texte: texte(p?.texte), suite: !!p?.suite }
}

function rubrique(r) {
  return { id: r?.id ?? null, code: texte(r?.code), titre: texte(r?.titre), paragraphes: liste(r?.paragraphes).map(paragraphe) }
}

function partie(p) {
  return {
    id: p?.id ?? null, numero_romain: texte(p?.numero_romain), titre: texte(p?.titre),
    paragraphes: liste(p?.paragraphes).map(paragraphe),
    rubriques: liste(p?.rubriques).map(rubrique),
  }
}

/** Forme garantie, quelle que soit la valeur lue (vide, ancienne, abîmée). */
export function normaliserGeneralites(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { parties: [] }
  return { parties: liste(brut.parties).map(partie) }
}

const tousLesParagraphes = (g) => normaliserGeneralites(g).parties.flatMap((p) => [
  ...p.paragraphes, ...p.rubriques.flatMap((r) => r.paragraphes),
])

/** Y a-t-il quelque chose à imprimer (ou à importer) ? */
export function aDuTexte(g) {
  return tousLesParagraphes(g).some((p) => p.texte.trim() !== '')
}

// ─── Départ et import ────────────────────────────────────────────────────────

/** Les cinq parties habituelles de l'agence et leurs rubriques, sans texte. */
export function squeletteHabituel(nouvelId) {
  return {
    parties: DEFAULT_TEMPLATE_SECTIONS
      .filter((s) => !['VI', 'VII'].includes(s.numero_romain))
      .map((s) => ({
        id: nouvelId(), numero_romain: s.numero_romain, titre: s.titre, paragraphes: [],
        rubriques: (s.sous_sections ?? []).map((ss) => ({ id: nouvelId(), code: ss.code, titre: ss.titre, paragraphes: [] })),
      })),
  }
}

/** Copie d'une autre affaire : même contenu, identifiants neufs. */
export function copierPourImport(source, nouvelId) {
  const g = normaliserGeneralites(source)
  const para = (p) => ({ ...p, id: nouvelId() })
  return {
    parties: g.parties.map((p) => ({
      ...p, id: nouvelId(),
      paragraphes: p.paragraphes.map(para),
      rubriques: p.rubriques.map((r) => ({ ...r, id: nouvelId(), paragraphes: r.paragraphes.map(para) })),
    })),
  }
}

// ─── Numéros proposés ────────────────────────────────────────────────────────

const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']

export function prochainRomain(parties = []) {
  const dernier = parties[parties.length - 1]?.numero_romain
  const rang = ROMAINS.indexOf(String(dernier ?? '').trim().toUpperCase())
  return ROMAINS[rang >= 0 ? rang + 1 : parties.length] ?? String(parties.length + 1)
}

// Codes de l'agence : « 1-1 », « 1-2 »… dans chaque partie
export function prochainCode(p) {
  const rangs = liste(p?.rubriques).map((r) => Number(/(\d+)\s*$/.exec(r.code ?? '')?.[1]) || 0)
  return `1-${Math.max(0, ...rangs) + 1}`
}

// ─── Édition (par identifiant, à n'importe quel niveau) ─────────────────────

// Applique `f` à chaque liste de l'arbre ; `f` reçoit la liste et rend la nouvelle
function surChaqueListe(g, f) {
  return {
    parties: f(g.parties, 'parties').map((p) => ({
      ...p,
      paragraphes: f(p.paragraphes, 'paragraphes'),
      rubriques: f(p.rubriques, 'rubriques').map((r) => ({ ...r, paragraphes: f(r.paragraphes, 'paragraphes') })),
    })),
  }
}

/**
 * Ajoute un élément vide : une partie (parentId null), une rubrique dans une
 * partie, un paragraphe dans une partie ou une rubrique.
 */
export function ajouter(contenu, parentId, type, nouvelId, valeurs = {}) {
  const g = normaliserGeneralites(contenu)
  if (type === 'partie') {
    return { parties: [...g.parties, { id: nouvelId(), numero_romain: prochainRomain(g.parties), titre: '', paragraphes: [], rubriques: [], ...valeurs }] }
  }
  return {
    parties: g.parties.map((p) => {
      if (p.id === parentId && type === 'rubrique') {
        return { ...p, rubriques: [...p.rubriques, { id: nouvelId(), code: prochainCode(p), titre: '', paragraphes: [], ...valeurs }] }
      }
      const nouveau = () => ({ id: nouvelId(), date: null, texte: '', suite: false, ...valeurs })
      if (p.id === parentId && type === 'paragraphe') return { ...p, paragraphes: [...p.paragraphes, nouveau()] }
      return {
        ...p,
        rubriques: p.rubriques.map((r) => (r.id === parentId && type === 'paragraphe'
          ? { ...r, paragraphes: [...r.paragraphes, nouveau()] }
          : r)),
      }
    }),
  }
}

export function modifier(contenu, id, champs) {
  return surChaqueListe(normaliserGeneralites(contenu), (l) => l.map((e) => (e.id === id ? { ...e, ...champs } : e)))
}

export function supprimer(contenu, id) {
  return surChaqueListe(normaliserGeneralites(contenu), (l) => l.filter((e) => e.id !== id))
}

/**
 * Ce qu'emporterait la suppression d'un élément, pour la demande de
 * confirmation : son type, son nom, ce qu'il contient. `vide` : rien de saisi,
 * la suppression peut se passer de confirmation.
 */
export function decrireElement(contenu, id) {
  const g = normaliserGeneralites(contenu)
  const plein = (paragraphes) => paragraphes.filter((p) => p.texte.trim()).length
  for (const p of g.parties) {
    if (p.id === id) {
      const nbParagraphes = plein(p.paragraphes) + p.rubriques.reduce((n, r) => n + plein(r.paragraphes), 0)
      return {
        type: 'partie', libelle: [p.numero_romain, p.titre].filter(Boolean).join(' - '),
        nbRubriques: p.rubriques.length, nbParagraphes, vide: nbParagraphes === 0 && !p.titre.trim() && p.rubriques.length === 0,
      }
    }
    for (const r of p.rubriques) {
      if (r.id === id) {
        const nbParagraphes = plein(r.paragraphes)
        return { type: 'rubrique', libelle: [r.code, r.titre].filter(Boolean).join(' '), nbRubriques: 0, nbParagraphes, vide: nbParagraphes === 0 && !r.titre.trim() }
      }
    }
    const para = [...p.paragraphes, ...p.rubriques.flatMap((r) => r.paragraphes)].find((x) => x.id === id)
    if (para) return { type: 'paragraphe', libelle: para.texte.trim(), nbRubriques: 0, nbParagraphes: para.texte.trim() ? 1 : 0, vide: !para.texte.trim() }
  }
  return null
}

/** Monte (sens -1) ou descend (sens +1) un élément parmi ses voisins. */
export function deplacer(contenu, id, sens) {
  return surChaqueListe(normaliserGeneralites(contenu), (l) => {
    const i = l.findIndex((e) => e.id === id)
    const j = i + sens
    if (i < 0 || j < 0 || j >= l.length) return l
    const copie = [...l]
    ;[copie[i], copie[j]] = [copie[j], copie[i]]
    return copie
  })
}

// ─── Impression ──────────────────────────────────────────────────────────────

/**
 * Généralités d'un compte rendu : la copie faite à l'émission pour un CR émis
 * (il garde la version de son jour), celles de l'affaire sinon — et pour un CR
 * émis avant la migration 055, qui n'a pas de copie.
 */
export function generalitesAImprimer(cr, generalitesAffaire) {
  if (cr?.statut === 'emis' && cr.generalites) return normaliserGeneralites(cr.generalites)
  return normaliserGeneralites(generalitesAffaire)
}
