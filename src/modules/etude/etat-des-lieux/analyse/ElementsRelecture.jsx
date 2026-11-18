import { useMemo, useState } from 'react'
import { Check, Pencil, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { styleProposition, COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { typeEdl } from '../calquesEdl'
import {
  elementsParCalque, optionsType, pointsProposes, saisieElement, champsElementSaisis, erreurSaisieElement, titreElement,
} from './relectureAnalyseLogique'
import { ConfirmationEdl } from './ConfirmationEdl'

// ─── Éléments relevés dans une pièce, à la relecture ─────────────────────────
//
// Rangés par calque. Une proposition de Claude porte le bleu des
// propositions de l'IA des comptes rendus, avec ce qui a été entendu :
// Valider, Modifier (modifier vaut validation), Écarter (confirmé). Survoler
// ou toucher un élément met son point en évidence sur le plan ; toucher un
// point du plan met ses éléments en évidence ici.

const AMBRE = { fond: '#FFFBEB', trait: '#F59E0B', texte: '#92400E' }
const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }
const champ = {
  width: '100%', boxSizing: 'border-box', minHeight: 40, padding: '8px 10px', fontSize: 13, color: '#1F1B17',
  border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', fontFamily: 'inherit',
}
const etiquette = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#5E5854' }

function FormulaireElement({ element = null, pieceId, points, libelleEnregistrer, onEnregistrer, onAnnuler }) {
  const [saisie, setSaisie] = useState(() => saisieElement(element))
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const groupes = useMemo(() => optionsType(element?.calque ?? null), [element?.calque])
  const proposes = useMemo(() => pointsProposes(points, pieceId, element?.point_id ?? null), [points, pieceId, element?.point_id])
  const changer = (cle) => (e) => { const v = e.target.value; setSaisie((s) => ({ ...s, [cle]: v })) }

  const enregistrer = async () => {
    const motif = erreurSaisieElement(saisie)
    if (motif) { setErreur(motif); return }
    setErreur(null)
    setEnCours(true)
    try {
      await onEnregistrer(champsElementSaisis(saisie))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: element ? 10 : 0 }}>
      <label style={etiquette}>
        Type
        <select value={saisie.typeValeur} onChange={changer('typeValeur')} style={champ}>
          {!saisie.typeValeur && <option value="">Choisir…</option>}
          {groupes.map((g) => (
            <optgroup key={g.code} label={g.libelle}>
              {g.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label style={etiquette}>
        Libellé
        <input type="text" value={saisie.libelle} onChange={changer('libelle')} style={champ} placeholder="Ce qui a été relevé" />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <label style={etiquette}>
          Cotes
          <input type="text" value={saisie.cotes} onChange={changer('cotes')} style={champ} placeholder="allège 90, largeur 120" />
        </label>
        <label style={etiquette}>
          Point
          <select value={saisie.pointId} onChange={changer('pointId')} style={champ}>
            <option value="">Aucun</option>
            {proposes.map((p) => (
              <option key={p.id} value={p.id}>
                P{p.numero}{typeEdl(p.type) ? ` · ${typeEdl(p.type).libelle}` : ''}{p.piece_id !== pieceId ? ' (autre pièce)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B8412C' }}>{erreur}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onAnnuler} disabled={enCours} style={bouton}>Annuler</button>
        <button type="button" onClick={enregistrer} disabled={enCours}
          style={{ ...bouton, border: 'none', background: COULEUR_IA, color: 'white', fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
          <Check size={15} /> {enCours ? 'Enregistrement…' : libelleEnregistrer}
        </button>
      </div>
    </div>
  )
}

function CarteElement({ element: e, numeroPoint, pieceId, points, lectureSeule, enEvidence, onSurvol, onChoisir, onValider, onEcarter }) {
  const [edition, setEdition] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const type = typeEdl(e.type)
  const titre = titreElement(e)

  const valider = async () => {
    setEnCours(true)
    try { await onValider(e.id) } finally { setEnCours(false) }
  }

  return (
    <li
      onMouseEnter={() => onSurvol(e.point_id ?? null)} onMouseLeave={() => onSurvol(null)}
      style={{
        listStyle: 'none', padding: 12, borderRadius: 3, background: 'white', border: '0.5px solid rgba(0,0,0,0.1)',
        ...(e.a_valider ? styleProposition : null),
        ...(enEvidence ? { outline: `2px solid ${COULEUR_IA}`, outlineOffset: 2 } : null),
      }}
    >
      {/* Toucher la carte (iPad, pas de survol) : son point sur le plan */}
      <button type="button" onClick={() => onChoisir(e.id)} aria-pressed={enEvidence}
        style={{ display: 'block', width: '100%', minHeight: 44, padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          {numeroPoint != null && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: 'white', background: 'var(--affaire-accent, #E8602C)', padding: '1px 6px', borderRadius: 2 }}>
              P{numeroPoint}
            </span>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>{titre}</span>
          {type && type.libelle !== titre && <span style={{ fontSize: 12, color: '#5E5854' }}>{type.libelle}</span>}
          {e.a_verifier && (
            <span title="Claude a noté une hésitation" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '1px 6px', borderRadius: 2, background: AMBRE.fond, color: AMBRE.texte, border: `0.5px solid ${AMBRE.trait}` }}>
              <AlertTriangle size={11} /> à vérifier
            </span>
          )}
          {!e.a_valider && (
            <span style={{ fontSize: 11, color: '#2A8A4E' }}>{e.origine === 'main' ? 'ajouté à la main' : 'validé'}</span>
          )}
        </span>
        {e.cotes && <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: '#1F1B17' }}>Cotes : {e.cotes}</span>}
        {e.extrait && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#5E5854', fontStyle: 'italic' }}>
            entendu : « {e.extrait} »
          </span>
        )}
      </button>

      {edition ? (
        <FormulaireElement
          element={e} pieceId={pieceId} points={points}
          libelleEnregistrer={e.a_valider ? 'Enregistrer et valider' : 'Enregistrer'}
          onAnnuler={() => setEdition(false)}
          onEnregistrer={async (champs) => { if (await onValider(e.id, champs)) setEdition(false) }}
        />
      ) : !lectureSeule && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
          {e.a_valider && (
            <button type="button" onClick={valider} disabled={enCours}
              style={{ ...bouton, border: 'none', background: COULEUR_IA, color: 'white', fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
              <Check size={15} /> Valider
            </button>
          )}
          <button type="button" onClick={() => setEdition(true)} disabled={enCours} style={bouton}><Pencil size={14} /> Modifier</button>
          <button type="button" onClick={() => onEcarter(e)} disabled={enCours} style={{ ...bouton, color: '#B8412C' }}>
            <Trash2 size={14} /> {e.a_valider ? 'Écarter' : 'Supprimer'}
          </button>
        </div>
      )}
    </li>
  )
}

export function ElementsRelecture({
  piece, elements, points, lectureSeule, elementChoisi, pointChoisi, onSurvol, onChoisir, onValider, onEcarter, onAjouter,
}) {
  const [ajout, setAjout] = useState(false)
  const [aEcarter, setAEcarter] = useState(null)
  const groupes = useMemo(() => elementsParCalque(elements), [elements])
  const numeros = useMemo(() => new Map((points ?? []).map((p) => [p.id, p.numero])), [points])
  const aValider = elements.filter((e) => e.a_valider).length

  return (
    <section aria-label="Éléments relevés" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>
          Éléments <span style={{ fontWeight: 400, color: '#9C9591' }}>{elements.length}</span>
        </h3>
        {aValider > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: COULEUR_IA }}>{aValider} à valider</span>}
      </div>

      {!elements.length && !ajout && (
        <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Aucun élément relevé dans cette pièce.</p>
      )}

      {groupes.map((g) => (
        <div key={g.code} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9C9591' }}>
            {g.libelle} · {g.elements.length}
          </h4>
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.elements.map((e) => (
              <CarteElement
                key={e.id} element={e} numeroPoint={e.point_id ? numeros.get(e.point_id) ?? null : null}
                pieceId={piece.id} points={points} lectureSeule={lectureSeule}
                enEvidence={e.id === elementChoisi || (!!pointChoisi && e.point_id === pointChoisi)}
                onSurvol={onSurvol} onChoisir={onChoisir} onValider={onValider} onEcarter={setAEcarter}
              />
            ))}
          </ul>
        </div>
      ))}

      {!lectureSeule && (ajout ? (
        <div style={{ padding: 12, background: 'white', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 3 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#1F1B17' }}>Nouvel élément</h4>
          <FormulaireElement
            pieceId={piece.id} points={points} libelleEnregistrer="Ajouter"
            onAnnuler={() => setAjout(false)}
            onEnregistrer={async (champs) => { if (await onAjouter(champs)) setAjout(false) }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAjout(true)} style={{ ...bouton, alignSelf: 'flex-start', borderStyle: 'dashed' }}>
          <Plus size={15} /> Ajouter un élément
        </button>
      ))}

      {aEcarter && (
        <ConfirmationEdl
          danger
          titre={aEcarter.a_valider ? 'Écarter cette proposition ?' : 'Supprimer cet élément ?'}
          texte={`« ${titreElement(aEcarter)} » sera retiré de la pièce. ${aEcarter.a_valider ? 'Une nouvelle analyse pourra le proposer à nouveau si la visite en parle.' : 'Cet élément avait été validé.'}`}
          libelle={aEcarter.a_valider ? 'Écarter' : 'Supprimer'} libelleEnCours="Suppression…"
          onAnnuler={() => setAEcarter(null)}
          onConfirmer={async () => { await onEcarter(aEcarter.id); setAEcarter(null) }}
        />
      )}
    </section>
  )
}
