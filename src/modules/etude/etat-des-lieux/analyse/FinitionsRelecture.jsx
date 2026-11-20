import { useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { styleProposition, COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { couleurFinition } from '../tracesEdl'
import { libelleStatut } from '../statutsEdl'
import { lireSaisieFinition } from './relectureAnalyseLogique'
import { MenuStatut } from './FicheRelecture'
import { ConfirmationEdl } from './ConfirmationEdl'

// ─── Finitions de murs d'une pièce, à la relecture (migration 085) ──────────
//
// Une finition de mur naît d'une proposition de Claude (un mur touché et sa
// finition dite) : bleue tant qu'elle n'est pas relue, avec ce qui a été
// entendu. Valider, Modifier (le texte et le statut — modifier vaut
// validation), Écarter (confirmé). Une finition validée se modifie ou se
// supprime. Toucher une carte met le mur en évidence sur le plan, et
// toucher la finition sur le plan met sa carte en évidence.

const ROUGE = '#B8412C'
const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }
const champ = {
  flex: 1, minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '8px 10px', fontSize: 13, color: '#1F1B17',
  border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', fontFamily: 'inherit',
}

function SaisieFinition({ finition, libelleEnregistrer, onEnregistrer, onAnnuler }) {
  const [valeur, setValeur] = useState(() => String(finition.valeur ?? ''))
  const [statut, setStatut] = useState(() => finition.statut ?? '')
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const enregistrer = async () => {
    const lu = lireSaisieFinition({ valeur, statut })
    if (lu.erreur) { setErreur(lu.erreur); return }
    setErreur(null)
    setEnCours(true)
    try { await onEnregistrer(lu) } finally { setEnCours(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="text" aria-label="Finition du mur" value={valeur} onChange={(e) => setValeur(e.target.value)} style={champ}
          placeholder="Faïence toute hauteur" onKeyDown={(e) => { if (e.key === 'Enter') enregistrer() }}
        />
        <MenuStatut id={`statut-${finition.id}`} rubrique="finition du mur" valeur={statut} lectureSeule={false} onChange={setStatut} />
      </div>
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: ROUGE }}>{erreur}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onAnnuler} disabled={enCours} style={bouton}>Annuler</button>
        <button type="button" onClick={enregistrer} disabled={enCours}
          style={{ ...bouton, border: 'none', background: COULEUR_IA, color: 'white', fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
          <Check size={15} /> {enCours ? 'Enregistrement…' : libelleEnregistrer}
        </button>
      </div>
    </div>
  )
}

const longueur = (t) => {
  const l = Math.hypot(Number(t.xb) - Number(t.xa), Number(t.yb) - Number(t.ya))
  return Number.isFinite(l) && l > 0 ? `${l.toFixed(2).replace('.', ',')} m` : null
}

function CarteFinition({ finition: t, lectureSeule, enEvidence, onChoisir, onValider, onEcarter }) {
  const [edition, setEdition] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const couleur = couleurFinition(t.valeur)
  const valider = async () => {
    setEnCours(true)
    try { await onValider(t) } finally { setEnCours(false) }
  }
  return (
    <li style={{
      listStyle: 'none', padding: 12, borderRadius: 3, background: 'white', border: '0.5px solid rgba(0,0,0,0.1)',
      borderLeft: `3px solid ${couleur}`,
      ...(t.a_valider ? styleProposition : null),
      ...(enEvidence ? { outline: `2px solid ${COULEUR_IA}`, outlineOffset: 2 } : null),
    }}>
      <button type="button" onClick={() => onChoisir(t.id)} aria-pressed={enEvidence}
        style={{ display: 'block', width: '100%', minHeight: 44, padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span aria-hidden style={{ width: 18, height: 5, background: couleur, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>{String(t.valeur ?? '').trim() || 'Finition à préciser'}</span>
          <span style={{ fontSize: 12, color: '#5E5854' }}>{libelleStatut(t.statut)}</span>
          <span style={{ fontSize: 11, color: t.a_valider ? COULEUR_IA : '#2A8A4E', fontWeight: t.a_valider ? 600 : 400 }}>
            {t.a_valider ? 'proposée' : t.origine === 'ia' ? 'validée' : 'posée à la main'}
          </span>
        </span>
        {longueur(t) && <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#5E5854' }}>Mur de {longueur(t)}</span>}
        {t.extrait && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#5E5854', fontStyle: 'italic' }}>
            entendu : « {t.extrait} »
          </span>
        )}
      </button>
      {edition ? (
        <SaisieFinition
          finition={t} libelleEnregistrer={t.a_valider ? 'Enregistrer et valider' : 'Enregistrer'}
          onAnnuler={() => setEdition(false)}
          onEnregistrer={async (champs) => { if (await onValider(t, champs)) setEdition(false) }}
        />
      ) : !lectureSeule && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {t.a_valider && (
            <button type="button" onClick={valider} disabled={enCours}
              style={{ ...bouton, border: 'none', background: COULEUR_IA, color: 'white', fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
              <Check size={15} /> Valider
            </button>
          )}
          <button type="button" onClick={() => setEdition(true)} disabled={enCours} style={bouton}><Pencil size={14} /> Modifier</button>
          <button type="button" onClick={() => onEcarter(t)} disabled={enCours} style={{ ...bouton, color: ROUGE }}>
            <Trash2 size={14} /> {t.a_valider ? 'Écarter' : 'Supprimer'}
          </button>
        </div>
      )}
    </li>
  )
}

export function FinitionsRelecture({ finitions, lectureSeule, traceChoisie, onChoisir, onValider, onEcarter }) {
  const [aEcarter, setAEcarter] = useState(null)
  const aValider = finitions.filter((t) => t.a_valider).length
  return (
    <section aria-label="Finitions de murs" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>
          Finitions de murs <span style={{ fontWeight: 400, color: '#9C9591' }}>{finitions.length}</span>
        </h3>
        {aValider > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: COULEUR_IA }}>{aValider} à valider</span>}
      </div>
      {!finitions.length ? (
        <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>
          Aucune finition de mur : en visite, touchez le mur et dites sa finition (faïence, crédence, lambris…).
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {finitions.map((t) => (
            <CarteFinition
              key={t.id} finition={t} lectureSeule={lectureSeule} enEvidence={t.id === traceChoisie}
              onChoisir={onChoisir} onValider={onValider} onEcarter={setAEcarter}
            />
          ))}
        </ul>
      )}
      {aEcarter && (
        <ConfirmationEdl
          danger
          titre={aEcarter.a_valider ? 'Écarter cette proposition ?' : 'Supprimer cette finition de mur ?'}
          texte={aEcarter.a_valider
            ? `« ${aEcarter.valeur} » sera retirée du mur. Une nouvelle analyse pourra la proposer à nouveau si la visite en parle.`
            : `« ${aEcarter.valeur} » sera supprimée du plan de la pièce.`}
          libelle={aEcarter.a_valider ? 'Écarter' : 'Supprimer'} libelleEnCours="Suppression…"
          onAnnuler={() => setAEcarter(null)}
          onConfirmer={async () => { await onEcarter(aEcarter); setAEcarter(null) }}
        />
      )}
    </section>
  )
}
