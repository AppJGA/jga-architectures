import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, AlertTriangle, CheckCircle2, Download, CloudUpload, RefreshCw } from 'lucide-react'
import { IconeTablette } from '../../../shared/icones/IconesAffaire'
import { useComptesRendus } from '../../../shared/hooks/useComptesRendus'
import { actionVisite, cheminVisite, estTactile } from './accesVisite'
import { useEnLigne } from '../../../core/layout/enLigne'
import { useFileGlobale } from './horsLigne/useFileGlobale'
import { etatPreparation } from './horsLigne/preparationLogique'
import { lirePreparation, preparerChantier } from './horsLigne/preparation'

// ─── Accès direct à la visite, depuis la page de l'affaire ───────────────────
//
// Sur le chantier, écrire une remarque ne doit pas demander de traverser la
// liste des visites puis l'accueil du compte rendu. Ce bandeau ouvre la visite
// en cours — ou crée celle du jour — d'un seul geste.

export function BandeauVisite({ affaireId, lectureSeule = false }) {
  const naviguer = useNavigate()
  const { comptesRendus, loading, createCR } = useComptesRendus(affaireId)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  const enLigne = useEnLigne()
  const { lignes } = useFileGlobale()
  const [preparation, setPreparation] = useState(() => lirePreparation(affaireId))
  const [avancement, setAvancement] = useState(null) // { index, total, libelle }

  if (loading) return null
  const choix = actionVisite(comptesRendus)
  const ouvrable = choix.action === 'reprendre' || !lectureSeule

  const aller = async () => {
    if (enCours) return
    setErreur(null)
    if (choix.cr) {
      naviguer(cheminVisite(affaireId, choix.cr.id, { tactile: estTactile() }))
      return
    }
    setEnCours(true)
    try {
      const cr = await createCR()
      naviguer(cheminVisite(affaireId, cr.id, { tactile: estTactile() }))
    } catch (err) {
      console.error(err)
      setErreur(err?.message ?? 'La visite n’a pas pu être créée.')
    } finally {
      setEnCours(false)
    }
  }

  // La visite à emporter : celle en cours, sinon la dernière
  const crAPreparer = choix.cr ?? comptesRendus[0] ?? null
  const preparer = async () => {
    if (avancement || !enLigne) return
    setErreur(null)
    try {
      setPreparation(await preparerChantier({ affaireId, cr: crAPreparer, surEtape: setAvancement }))
    } catch (err) {
      setErreur(err?.message ?? 'La préparation n’a pas abouti.')
    }
    setAvancement(null)
  }
  const etat = etatPreparation(preparation)
  const enAttente = lignes.filter((l) => l.affaireId === affaireId && (l.enAttente > 0 || l.echecs > 0))

  return (
    <div className="jga-entree-carte" style={{
      background: 'white',
      border: '0.5px solid rgba(0,0,0,0.08)',
      borderTop: '3px solid var(--affaire-accent, #E8602C)',
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#C9C4C0' }}>
          Visite de chantier
        </p>
        <p style={{ fontFamily: "'Archivo', sans-serif", fontSize: 17, fontWeight: 500, color: '#1F1B17', marginTop: 4 }}>
          {choix.libelle}
        </p>
        <p style={{ fontSize: 12, color: '#9C9591', marginTop: 2 }}>
          {choix.precision}
          {choix.cr?.pointsEnCours > 0 && ` · ${choix.cr.pointsEnCours} point${choix.cr.pointsEnCours > 1 ? 's' : ''} en cours`}
        </p>
        {erreur && (
          <p role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#B8412C', marginTop: 6 }}>
            <AlertTriangle size={13} /> {erreur}
          </p>
        )}
      </div>

      {ouvrable && (
        <button
          type="button" onClick={aller} disabled={enCours}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            minHeight: 52, padding: '0 24px', flexShrink: 0,
            border: 'none', borderRadius: 3,
            background: 'var(--affaire-accent, #E8602C)', color: 'white',
            fontSize: 15, fontWeight: 600, cursor: enCours ? 'default' : 'pointer',
            boxShadow: '0 10px 24px -12px var(--affaire-accent-ombre, rgba(232,96,44,0.9))',
            opacity: enCours ? 0.7 : 1,
          }}
        >
          <IconeTablette size={22} />
          {enCours ? 'Création…' : (choix.action === 'reprendre' ? 'Reprendre' : 'Démarrer')}
        </button>
      )}

      <button
        type="button"
        onClick={() => naviguer(`/affaires/${affaireId}/comptes-rendus`)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: '#5E5854',
        }}
      >
        Toutes les visites <ChevronRight size={13} />
      </button>

      {/* Sans réseau sur le chantier : ce qui est gardé, ce qui attend l'envoi */}
      <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
        {enAttente.map((l) => (
          <p key={l.crId} role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 12, color: l.echecs > 0 ? '#B8412C' : '#1B3A5C' }}>
            <CloudUpload size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              {l.echecs > 0
                ? `Visite n°${String(l.numero ?? '?').padStart(2, '0')} : ${l.echecs} modification${l.echecs > 1 ? 's' : ''} refusée${l.echecs > 1 ? 's' : ''} par la base — à revoir dans la visite.`
                : `Visite n°${String(l.numero ?? '?').padStart(2, '0')} : ${l.enAttente} modification${l.enAttente > 1 ? 's' : ''} pas encore envoyée${l.enAttente > 1 ? 's' : ''}${enLigne ? ' — envoi en cours.' : l.enAttente > 1 ? ' — elles partiront au retour du réseau.' : ' — elle partira au retour du réseau.'}`}
            </span>
            {l.echecs > 0 && (
              <button type="button" onClick={() => naviguer(cheminVisite(affaireId, l.crId, { tactile: estTactile() }))}
                style={{ flexShrink: 0, minHeight: 32, padding: '0 10px', border: '0.5px solid currentColor', borderRadius: 3, background: 'white', color: 'inherit', fontSize: 12, cursor: 'pointer' }}>
                Ouvrir
              </button>
            )}
          </p>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', minWidth: 0, fontSize: 12, color: { pret: '#2A8A4E', ancien: '#C2410C', incomplet: '#C2410C' }[etat.etat] ?? '#9C9591' }}>
            {etat.etat === 'pret' ? <CheckCircle2 size={15} style={{ flexShrink: 0 }} /> : <Download size={15} style={{ flexShrink: 0 }} />}
            <span>
              {avancement
                ? `Préparation : ${avancement.libelle} (${Math.min(avancement.index + 1, avancement.total)}/${avancement.total})…`
                : etat.libelle}
              {!avancement && etat.etat === 'jamais' && (
                <span style={{ display: 'block', color: '#9C9591' }}>Garde sur cet appareil tout ce qu’il faut pour travailler sans réseau.</span>
              )}
            </span>
          </span>
          {enLigne ? (
            <button type="button" onClick={preparer} disabled={!!avancement}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, minHeight: 40, padding: '0 14px',
                border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 3, background: 'white', color: '#1F1B17',
                fontSize: 13, fontWeight: 500, cursor: avancement ? 'default' : 'pointer', opacity: avancement ? 0.6 : 1,
              }}>
              {etat.etat === 'jamais' ? <Download size={15} /> : <RefreshCw size={15} />}
              {avancement ? 'Préparation…' : etat.etat === 'jamais' ? 'Préparer pour le chantier' : 'Mettre à jour'}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: '#9C9591' }}>Préparation possible avec du réseau</span>
          )}
        </div>
        {avancement && (
          <div aria-hidden style={{ height: 4, background: '#F0EBE3', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((avancement.index / avancement.total) * 100)}%`, height: '100%', background: 'var(--affaire-accent, #E8602C)', transition: 'width 0.3s' }} />
          </div>
        )}
      </div>
    </div>
  )
}
