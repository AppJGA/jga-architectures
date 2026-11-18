import { useState } from 'react'
import { Check } from 'lucide-react'
import { styleProposition, COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { RUBRIQUES_FICHE } from './analyseEdlLogique'
import { LIBELLES_FICHE, brouillonFiche, ficheDepuisBrouillon, ficheModifiee, rubriquesManquantes, suiteFicheRecue } from './relectureAnalyseLogique'

// ─── Fiche d'une pièce, à la relecture ───────────────────────────────────────
//
// Sol, murs, plafond, plinthes, HSP, remarques. Tant que l'agence ne l'a pas
// relue (`fiche_a_valider`), la carte porte le bleu des propositions de l'IA
// des comptes rendus. Comme pour une remarque proposée, modifier vaut
// validation : « Enregistrer » valide aussi. Les rubriques que la visite n'a
// pas dites sont signalées en ambre (l'orange est la couleur de la phase).
// Une fiche reçue de la base (nouvelle analyse, enregistrement relu)
// remplace le brouillon s'il est propre ; un brouillon modifié est gardé
// (`suiteFicheRecue`), avec un avis et de quoi charger la nouvelle fiche.

const AMBRE = { fond: '#FFFBEB', trait: '#F59E0B', texte: '#92400E' }
const champ = {
  width: '100%', boxSizing: 'border-box', minHeight: 40, padding: '8px 10px', fontSize: 13, color: '#1F1B17',
  border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', fontFamily: 'inherit',
}
const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 3, fontSize: 13, cursor: 'pointer' }

const metres = (v) => `${String(Math.round(Number(v) * 100) / 100).replace('.', ',')} m`

// Ce qui distingue une fiche reçue de la précédente : son contenu et l'heure d'analyse
const cleFiche = (piece) => `${piece.analyse_le ?? ''}|${JSON.stringify(brouillonFiche(piece.fiche))}`

export function FicheRelecture({ piece, lectureSeule, onEnregistrer }) {
  const [brouillon, setBrouillon] = useState(() => brouillonFiche(piece.fiche))
  const [enCours, setEnCours] = useState(false)
  // Fiche vue au dernier rendu, et avis d'une analyse arrivée sur un brouillon modifié
  const [vue, setVue] = useState(() => ({ cle: cleFiche(piece), fiche: piece.fiche, analyseLe: piece.analyse_le ?? null }))
  const [nouvelleAnalyse, setNouvelleAnalyse] = useState(false)
  const cle = cleFiche(piece)
  if (cle !== vue.cle) {
    // Ajusté pendant le rendu (et non dans un effet) : le brouillon périmé
    // ne s'affiche jamais, même une image
    const suite = suiteFicheRecue({ precedente: vue.fiche, brouillon, recue: piece.fiche })
    setVue({ cle, fiche: piece.fiche, analyseLe: piece.analyse_le ?? null })
    if (suite === 'remplacer') {
      setBrouillon(brouillonFiche(piece.fiche))
      setNouvelleAnalyse(false)
    } else if ((piece.analyse_le ?? null) !== vue.analyseLe) {
      setNouvelleAnalyse(true)
    }
  }
  const chargerNouvelle = () => {
    setBrouillon(brouillonFiche(piece.fiche))
    setNouvelleAnalyse(false)
  }
  const aValider = piece.fiche_a_valider === true
  const modifiee = ficheModifiee(piece.fiche, brouillon)
  const manquantes = new Set(rubriquesManquantes(piece, brouillon))
  const hspLue = Number(piece.hsp_lue) > 0 ? piece.hsp_lue : null

  // Modifier vaut validation : la fiche part toujours relue
  const enregistrer = async () => {
    setEnCours(true)
    try {
      await onEnregistrer(ficheDepuisBrouillon(piece.fiche, brouillon))
    } finally {
      setEnCours(false)
    }
  }

  const rubrique = (r) => {
    const manque = manquantes.has(r)
    const long = r === 'remarques'
    const proprietes = {
      id: `fiche-${piece.id}-${r}`, value: brouillon[r], readOnly: lectureSeule,
      onChange: (e) => { const v = e.target.value; setBrouillon((b) => ({ ...b, [r]: v })) },
      style: { ...champ, ...(manque ? { background: AMBRE.fond, borderColor: AMBRE.trait } : null), ...(long ? { minHeight: 72, resize: 'vertical' } : null) },
    }
    return (
      <div key={r} style={{ gridColumn: long ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor={proprietes.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5E5854' }}>
          {LIBELLES_FICHE[r]}
          {manque && (
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 2, background: AMBRE.fond, color: AMBRE.texte, border: `0.5px solid ${AMBRE.trait}` }}>
              non dit
            </span>
          )}
          {r === 'hsp' && hspLue && <span style={{ color: '#9C9591' }}>· lue sur le plan : {metres(hspLue)}</span>}
        </label>
        {long ? <textarea rows={3} {...proprietes} /> : <input type="text" {...proprietes} />}
      </div>
    )
  }

  return (
    <section aria-label="Fiche de la pièce" style={{ padding: 14, background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 3, ...(aValider ? styleProposition : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>Fiche de la pièce</h3>
        {aValider && <span style={{ fontSize: 12, fontWeight: 600, color: COULEUR_IA }}>Proposée par l’IA, à relire</span>}
      </div>
      {nouvelleAnalyse && (
        <p role="status" style={{ margin: '0 0 10px', fontSize: 12, color: AMBRE.texte, background: AMBRE.fond, border: `0.5px solid ${AMBRE.trait}`, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>Nouvelle analyse reçue — vos modifications ne sont pas enregistrées.</span>
          <button type="button" disabled={enCours} onClick={chargerNouvelle}
            style={{ ...bouton, border: `0.5px solid ${AMBRE.trait}`, background: 'white', color: AMBRE.texte }}>
            Charger la nouvelle fiche
          </button>
        </p>
      )}
      {manquantes.size > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: AMBRE.texte, background: AMBRE.fond, border: `0.5px solid ${AMBRE.trait}`, padding: '6px 10px' }}>
          Pas dit pendant la visite : {[...manquantes].map((r) => LIBELLES_FICHE[r].toLowerCase()).join(', ')}.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {RUBRIQUES_FICHE.map(rubrique)}
      </div>
      {!lectureSeule && (modifiee || aValider) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          {modifiee && (
            <button type="button" disabled={enCours} onClick={chargerNouvelle}
              style={{ ...bouton, border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }}>
              Annuler les modifications
            </button>
          )}
          <button type="button" disabled={enCours} onClick={enregistrer}
            style={{ ...bouton, border: 'none', background: aValider ? COULEUR_IA : 'var(--affaire-accent, #E8602C)', color: 'white', fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
            <Check size={15} /> {enCours ? 'Enregistrement…' : modifiee ? 'Enregistrer' : 'Valider la fiche'}
          </button>
        </div>
      )}
    </section>
  )
}
