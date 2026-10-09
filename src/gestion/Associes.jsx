import { useEffect, useState } from 'react'
import { useAuth } from '../core/auth/useAuth'
import { listerComptesAgence, designerAssocie } from './gestionDonnees'
import { ACCENT } from './manifest'

// ─── Associés ────────────────────────────────────────────────────────────────
//
// Qui a accès à la gestion d'agence. La base décide (migrations 067, 068,
// `designer_associe`) : un associé (ou l'administrateur) coche ou décoche,
// et personne ne touche à sa propre ligne — un associé ne se retire pas,
// l'administrateur ne se fait pas associé par mégarde. L'administrateur
// n'apparaît pas comme tel : il est ici un compte comme les autres.

function Interrupteur({ actif, desactive, onClick, libelle }) {
  return (
    <button type="button" role="switch" aria-checked={actif} aria-label={libelle} onClick={onClick} disabled={desactive}
      style={{
        width: 46, height: 26, borderRadius: 13, border: 'none', padding: 3, flexShrink: 0,
        background: actif ? ACCENT : '#D6D1CC', cursor: desactive ? 'default' : 'pointer', opacity: desactive ? 0.5 : 1,
        display: 'flex', justifyContent: actif ? 'flex-end' : 'flex-start', transition: 'background-color 0.15s ease',
      }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

export default function Associes() {
  const { user } = useAuth()
  const [comptes, setComptes] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(null)

  useEffect(() => {
    listerComptesAgence().then(setComptes).catch((e) => setErreur(e?.message ?? String(e)))
  }, [])

  const basculer = async (c) => {
    setEnCours(c.id); setErreur(null)
    try {
      await designerAssocie(c.id, !c.est_associe)
      setComptes((liste) => liste.map((x) => (x.id === c.id ? { ...x, est_associe: !c.est_associe } : x)))
    } catch (e) { setErreur(e?.message ?? String(e)) }
    setEnCours(null)
  }

  if (!comptes) return erreur ? <p role="alert" style={{ fontSize: 13, color: '#B8412C' }}>Lecture impossible : {erreur}</p> : <p style={{ fontSize: 13, color: '#9C9591' }}>Chargement…</p>
  if (comptes.length > 0 && comptes.every((c) => c.est_associe === undefined)) {
    return <p role="status" style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '10px 14px', maxWidth: 760 }}>La migration 067 (associés) n’est pas encore passée dans Supabase.</p>
  }

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#5E5854', lineHeight: 1.5 }}>
        Les associés voient la bulle « Gestion d’agence » sur l’accueil et ses outils. Un associé peut en désigner un autre ; personne ne modifie sa propre ligne.
      </p>
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C' }}>Non enregistré : {erreur}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
        {comptes.map((c) => {
          const moi = c.id === user?.id
          const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email
          return (
            <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#1F1B17' }}>{nom}{moi && <span style={{ fontSize: 12, fontWeight: 400, color: '#9C9591' }}> · vous</span>}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9C9591' }}>{c.email}</p>
              </div>
              <span style={{ fontSize: 12, color: c.est_associe ? ACCENT : '#9C9591', fontWeight: c.est_associe ? 600 : 400 }}>{c.est_associe ? 'Associé' : '—'}</span>
              <Interrupteur actif={!!c.est_associe} desactive={moi || enCours === c.id} onClick={() => basculer(c)}
                libelle={`${nom} associé`} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
