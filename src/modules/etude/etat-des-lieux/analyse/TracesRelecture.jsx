import { useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { styleProposition, COULEUR_IA } from '../../../chantier/comptes-rendus/enregistrement/styleProposition'
import { typeEdl } from '../calquesEdl'
import { longueurCote, texteValeur } from '../tracesEdl'
import { libelleTrace, COULEUR_COMMANDE, COULEUR_COTE } from '../visite/tracesVisiteLogique'
import { etatTrace, lireSaisieCote } from './relectureAnalyseLogique'
import { ConfirmationEdl } from './ConfirmationEdl'

// ─── Liaisons et cotes d'une pièce, à la relecture (migration 084) ───────────
//
// Une proposition de Claude (liaison interrupteur → luminaire, valeur d'une
// cote) porte le bleu des propositions avec ce qui a été entendu : Valider,
// Modifier (la valeur d'une cote seulement ; une liaison se valide ou
// s'écarte) — modifier vaut validation —, Écarter (confirmé). Les traces
// validées restent listées et se suppriment (confirmé). Toucher une carte
// met la trace en évidence sur le plan, et inversement.

const ROUGE = '#B8412C'
const bouton = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.15)', background: 'white', color: '#1F1B17' }
const champ = {
  width: 140, boxSizing: 'border-box', minHeight: 40, padding: '8px 10px', fontSize: 13, color: '#1F1B17',
  border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 2, background: 'white', fontFamily: 'inherit',
}

const typeDe = (points, id) => typeEdl(points.find((p) => p.id === id)?.type)?.libelle ?? 'sans type'

function SaisieCote({ trace, libelleEnregistrer, onEnregistrer, onAnnuler }) {
  const [saisie, setSaisie] = useState(() => String(trace.valeur ?? '').replace(/\s*m$/, ''))
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const enregistrer = async () => {
    const lu = lireSaisieCote(saisie)
    if (lu.erreur) { setErreur(lu.erreur); return }
    setErreur(null)
    setEnCours(true)
    try { await onEnregistrer(lu.valeur) } finally { setEnCours(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5E5854' }}>
        Cote (m)
        <input
          type="text" inputMode="decimal" value={saisie} onChange={(e) => setSaisie(e.target.value)} style={champ} placeholder="3,45"
          onKeyDown={(e) => { if (e.key === 'Enter') enregistrer() }}
        />
      </label>
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 12, color: ROUGE }}>{erreur}</p>}
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

function CarteTrace({ trace: t, points, lectureSeule, enEvidence, onChoisir, onValider, onEcarter }) {
  const [edition, setEdition] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const cote = t.sorte === 'cote'
  const dessinee = cote ? texteValeur(longueurCote(t)) : null
  const sansValeur = cote && !String(t.valeur ?? '').trim()

  const valider = async () => {
    setEnCours(true)
    try { await onValider(t) } finally { setEnCours(false) }
  }

  return (
    <li style={{
      listStyle: 'none', padding: 12, borderRadius: 3, background: 'white', border: '0.5px solid rgba(0,0,0,0.1)',
      borderLeft: `3px solid ${cote ? COULEUR_COTE : COULEUR_COMMANDE}`,
      ...(t.a_valider ? styleProposition : null),
      ...(enEvidence ? { outline: `2px solid ${COULEUR_IA}`, outlineOffset: 2 } : null),
    }}>
      <button type="button" onClick={() => onChoisir(t.id)} aria-pressed={enEvidence}
        style={{ display: 'block', width: '100%', minHeight: 44, padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>{libelleTrace(t, points)}</span>
          {!cote && <span style={{ fontSize: 12, color: '#5E5854' }}>{typeDe(points, t.point_a)} → {typeDe(points, t.point_b)}</span>}
          <span style={{ fontSize: 11, color: t.a_valider ? COULEUR_IA : sansValeur ? '#92400E' : '#2A8A4E', fontWeight: t.a_valider ? 600 : 400 }}>{etatTrace(t)}</span>
        </span>
        {dessinee && <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#5E5854' }}>Longueur dessinée ≈ {dessinee}</span>}
        {t.extrait && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#5E5854', fontStyle: 'italic' }}>
            entendu : « {t.extrait} »
          </span>
        )}
      </button>

      {edition ? (
        <SaisieCote
          trace={t} libelleEnregistrer={t.a_valider ? 'Enregistrer et valider' : 'Enregistrer'}
          onAnnuler={() => setEdition(false)}
          onEnregistrer={async (valeur) => { if (await onValider(t, { valeur })) setEdition(false) }}
        />
      ) : !lectureSeule && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {t.a_valider && (
            <button type="button" onClick={valider} disabled={enCours}
              style={{ ...bouton, border: 'none', background: COULEUR_IA, color: 'white', fontWeight: 600, opacity: enCours ? 0.6 : 1 }}>
              <Check size={15} /> Valider
            </button>
          )}
          {cote && (
            <button type="button" onClick={() => setEdition(true)} disabled={enCours} style={bouton}>
              <Pencil size={14} /> {sansValeur ? 'Donner la valeur' : 'Modifier'}
            </button>
          )}
          <button type="button" onClick={() => onEcarter(t)} disabled={enCours} style={{ ...bouton, color: ROUGE }}>
            <Trash2 size={14} /> {t.a_valider ? 'Écarter' : 'Supprimer'}
          </button>
        </div>
      )}
    </li>
  )
}

// Ce que la confirmation dit de ce qui part
function texteEcart(t, points) {
  const nom = libelleTrace(t, points)
  if (t.a_valider && t.sorte === 'cote') return `La valeur proposée (${t.valeur}) sera retirée ; la cote reste sur le plan, à préciser. Une nouvelle analyse pourra la proposer à nouveau.`
  if (t.a_valider) return `« ${nom} » sera retirée de la pièce. Une nouvelle analyse pourra la proposer à nouveau si la visite en parle.`
  return `« ${nom} » sera supprimée du plan de la pièce.`
}

export function TracesRelecture({ traces, points, lectureSeule, traceChoisie, onChoisir, onValider, onEcarter }) {
  const [aEcarter, setAEcarter] = useState(null)
  const aValider = traces.filter((t) => t.a_valider).length

  return (
    <section aria-label="Liaisons et cotes" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 600, color: '#1F1B17' }}>
          Liaisons et cotes <span style={{ fontWeight: 400, color: '#9C9591' }}>{traces.length}</span>
        </h3>
        {aValider > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: COULEUR_IA }}>{aValider} à valider</span>}
      </div>

      {!traces.length && (
        <p style={{ margin: 0, fontSize: 13, color: '#9C9591' }}>Aucune liaison ni cote dans cette pièce.</p>
      )}
      {traces.length > 0 && (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {traces.map((t) => (
            <CarteTrace
              key={t.id} trace={t} points={points} lectureSeule={lectureSeule} enEvidence={t.id === traceChoisie}
              onChoisir={onChoisir} onValider={onValider} onEcarter={setAEcarter}
            />
          ))}
        </ul>
      )}

      {aEcarter && (
        <ConfirmationEdl
          danger
          titre={aEcarter.a_valider ? 'Écarter cette proposition ?' : (aEcarter.sorte === 'cote' ? 'Supprimer cette cote ?' : 'Supprimer cette liaison ?')}
          texte={texteEcart(aEcarter, points)}
          libelle={aEcarter.a_valider ? 'Écarter' : 'Supprimer'} libelleEnCours="Suppression…"
          onAnnuler={() => setAEcarter(null)}
          onConfirmer={async () => { await onEcarter(aEcarter); setAEcarter(null) }}
        />
      )}
    </section>
  )
}
