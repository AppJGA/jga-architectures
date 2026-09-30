import { useEffect, useMemo, useState } from 'react'
import { FolderInput, Search, AlertTriangle } from 'lucide-react'
import { DatePickerISO } from '../components/DatePickerISO'

// ─── Importer un planning depuis une autre affaire ───────────────────────────
//
// L'écran est le même pour l'étude et le chantier — choisir une affaire, une
// date de démarrage, lire le récapitulatif — seules les données changent. Tout
// ce qui est propre à un module arrive par `moteur`, que chaque planning
// construit chez lui : la modale ne connaît ni les tables ni les semaines ISO.
//
//   moteur = {
//     libelle,                        // « planning de chantier »
//     sources,                        // Map<affaire_id, nombre de lignes>
//     charger(affaireId),             // → { data: source } | { error }
//     debutPropose(source),           // → 'YYYY-MM-DD'
//     preparer(source, debutISO),     // → plan | null
//     lignesResume(plan),             // → ['42 tâches', '6 jalons', …]
//     avertissements(plan),           // → ['2 lots seront créés', …]
//     ecartTexte(plan),               // → '+ 7 semaines' | null
//   }

const LABEL = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#9C9591', display: 'block', marginBottom: 6,
}

export function ImportPlanningModal({ moteur, affaires = [], onValider, onAnnuler }) {
  const [recherche, setRecherche] = useState('')
  const [choisie, setChoisie] = useState(null)
  const [source, setSource] = useState(null)
  const [debut, setDebut] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)

  // Seules les affaires qui ont un planning de ce type peuvent servir de source
  const candidates = useMemo(() => {
    const texte = recherche.trim().toLowerCase()
    return affaires
      .filter((a) => moteur.sources.has(a.id))
      .filter((a) => !texte
        || `${a.code_affaire ?? ''} ${a.nom ?? ''}`.toLowerCase().includes(texte))
  }, [affaires, moteur.sources, recherche])

  const selectionner = async (affaire) => {
    setChoisie(affaire)
    setSource(null)
    setErreur(null)
    setChargement(true)
    const { data, error } = await moteur.charger(affaire.id)
    setChargement(false)
    if (error) { setErreur(`Lecture impossible : ${error.message}`); return }
    setSource(data)
    setDebut(moteur.debutPropose(data) ?? '')
  }

  const plan = useMemo(
    () => (source ? moteur.preparer(source, debut || null) : null),
    [source, debut, moteur]
  )

  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape' && !enCours) onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler, enCours])

  const valider = async () => {
    if (!plan || enCours) return
    setEnCours(true)
    setErreur(null)
    const resultat = await onValider(plan)
    setEnCours(false)
    if (resultat?.error) setErreur(`L’import a échoué : ${resultat.error.message}`)
  }

  const avertissements = plan ? moteur.avertissements(plan) : []
  const ecart = plan ? moteur.ecartTexte(plan) : null

  return (
    <div
      onClick={() => { if (!enCours) onAnnuler() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Importer un planning"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', padding: '24px 28px', maxWidth: 560, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
          border: '0.5px solid rgba(0,0,0,0.08)', borderTop: '3px solid #E8602C',
          boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FolderInput size={17} color="#E8602C" />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1F1B17' }}>Importer un planning</h2>
        </div>
        <p style={{ fontSize: 13, color: '#5E5854', lineHeight: 1.5, marginBottom: 18 }}>
          Recopie le {moteur.libelle} d’une autre affaire. Ce qui arrive se range à la
          suite de l’existant : rien n’est effacé, et l’avancement repart à zéro.
        </p>

        {/* ── Affaire d'origine ── */}
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>Affaire d’origine</label>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: 11, color: '#9C9591' }} />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une affaire…"
              style={{
                width: '100%', padding: '8px 10px 8px 30px', fontSize: 13, minHeight: 0,
                border: '0.5px solid rgba(0,0,0,0.15)', fontFamily: "'Inter', sans-serif",
              }}
            />
          </div>

          <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', maxHeight: 176, overflowY: 'auto' }}>
            {candidates.length === 0 && (
              <p style={{ fontSize: 12, color: '#9C9591', padding: '14px 12px', margin: 0, fontStyle: 'italic' }}>
                {affaires.length === 0
                  ? 'Chargement des affaires…'
                  : `Aucune autre affaire n’a de ${moteur.libelle}.`}
              </p>
            )}
            {candidates.map((a, i) => {
              const active = choisie?.id === a.id
              return (
                <button
                  key={a.id}
                  onClick={() => selectionner(a)}
                  disabled={enCours}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 12px', border: 'none', cursor: enCours ? 'default' : 'pointer',
                    borderBottom: i < candidates.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                    background: active ? 'rgba(232,96,44,0.08)' : 'white',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: active ? '#E8602C' : '#9C9591', marginRight: 8,
                  }}>
                    {a.code_affaire ?? '—'}
                  </span>
                  <span style={{ fontSize: 13, color: '#1F1B17', fontWeight: active ? 600 : 400 }}>
                    {a.nom}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Date de démarrage ── */}
        {choisie && (
          <div style={{ marginBottom: 16 }}>
            <label style={LABEL}>Date de démarrage dans cette affaire</label>
            {chargement && <p style={{ fontSize: 12, color: '#9C9591', fontStyle: 'italic' }}>Lecture du planning…</p>}
            {source && (
              <>
                <DatePickerISO value={debut} onChange={setDebut} />
                <p style={{ fontSize: 12, color: '#9C9591', marginTop: 5, lineHeight: 1.5 }}>
                  {ecart
                    ? `Le planning importé sera décalé de ${ecart}.`
                    : 'Les dates seront identiques à celles de l’affaire d’origine.'}
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Récapitulatif ── */}
        {plan && (
          <div style={{
            background: '#FAF7F2', border: '0.5px solid rgba(0,0,0,0.08)',
            padding: '12px 16px', fontSize: 13, color: '#1F1B17', lineHeight: 1.7, marginBottom: 16,
          }}>
            <strong>Sera ajouté à ce planning</strong>
            <div style={{ color: '#5E5854' }}>{moteur.lignesResume(plan).join(' · ')}</div>
            {avertissements.length > 0 && (
              <div style={{ display: 'flex', gap: 7, marginTop: 10, alignItems: 'flex-start' }}>
                <AlertTriangle size={13} strokeWidth={1.5} style={{ color: '#B8412C', flexShrink: 0, marginTop: 3 }} />
                <div style={{ fontSize: 12, color: '#B8412C', lineHeight: 1.6 }}>
                  {avertissements.map((a) => <div key={a}>{a}</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {erreur && (
          <p style={{
            fontSize: 12, color: '#B8412C', lineHeight: 1.5, marginBottom: 14,
            padding: '10px 12px', background: 'rgba(239,68,68,0.06)',
            border: '0.5px solid rgba(239,68,68,0.25)',
          }}>
            {erreur}
          </p>
        )}

        <p style={{ fontSize: 11, color: '#9C9591', fontStyle: 'italic', lineHeight: 1.6 }}>
          « Annuler » dans la barre d’outils (⌘Z) retire les tâches, segments et liaisons
          importés. Les jalons, lots et zones créés restent : d’autres écrans s’en servent
          peut-être déjà.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            type="button" onClick={onAnnuler} disabled={enCours}
            style={{
              padding: '9px 16px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)',
              background: 'white', color: '#374151', cursor: enCours ? 'default' : 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button" onClick={valider} disabled={!plan || enCours}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 500, border: 'none',
              background: '#E8602C', color: 'white',
              cursor: !plan || enCours ? 'default' : 'pointer',
              opacity: !plan || enCours ? 0.5 : 1,
            }}
          >
            {enCours ? 'Import…' : 'Importer le planning'}
          </button>
        </div>
      </div>
    </div>
  )
}
