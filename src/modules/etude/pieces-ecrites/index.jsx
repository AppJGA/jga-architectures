import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, Trash2, FileText, BookOpen } from 'lucide-react'
import { LogoClaude } from '../../../shared/icones/LogoClaude'
import { useLotsEntreprises } from '../../../shared/hooks/useLotsEntreprises'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'
import { listerPieces, supprimerPiece } from './piecesDonnees'
import { RecherchePieces } from './RecherchePieces'
import { ImportPieces } from './ImportPieces'
import { DossierClaude } from './DossierClaude'
import { LecteurCctp } from './LecteurCctp'

// ─── Pièces écrites (CCTP) ───────────────────────────────────────────────────
//
// Les CCTP de l'affaire, découpés en articles et cherchables (conception :
// docs/superpowers/specs/2026-10-06-pieces-ecrites-design.md). L'import
// propose le lot de chaque CCTP dans « Entreprises & Lots ». Toucher un CCTP
// le fait lire d'un bout à l'autre. En lecture seule, on cherche et on lit,
// mais on n'importe ni ne supprime.

export default function PiecesEcritesModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const { lots, refetch: rechargerLots } = useLotsEntreprises(affaireId)
  const [donnees, setDonnees] = useState(null) // { disponible, pieces, articles }
  const [erreur, setErreur] = useState(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [aSupprimer, setASupprimer] = useState(null)
  const { affaire } = useAffaire(affaireId)
  const [dossierOuvert, setDossierOuvert] = useState(false)
  const [enLecture, setEnLecture] = useState(null)

  const charger = useCallback(() => {
    listerPieces(affaireId)
      .then((d) => { setDonnees(d); setErreur(null) })
      .catch((err) => setErreur(err?.message ?? String(err)))
  }, [affaireId])
  useEffect(() => { charger() }, [charger])

  const pieces = donnees?.pieces ?? []
  const articles = donnees?.articles ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      {donnees && !donnees.disponible && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '10px 14px' }}>
          La migration 061 (pièces écrites) n’est pas encore passée dans Supabase : le module sera utilisable une fois qu’elle le sera.
        </p>
      )}
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C' }}>Lecture impossible : {erreur}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ flex: 1, margin: 0, fontSize: 12, color: '#9C9591' }}>
          {donnees === null ? 'Chargement…' : `${pieces.length} CCTP · ${articles.length} articles`}
        </p>
        {pieces.length > 0 && (
          <button type="button" onClick={() => setDossierOuvert(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#1F1B17', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <LogoClaude size={16} /> Préparer le dossier d’analyse de conformité par l’IA
          </button>
        )}
        {!lectureSeule && donnees?.disponible && (
          <button type="button" onClick={() => setImportOuvert(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: 'none', borderRadius: 3, background: '#E8602C', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Upload size={15} /> Importer des CCTP
          </button>
        )}
      </div>

      {pieces.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {pieces.map((p) => (
            <li key={p.id} style={{ display: 'flex', alignItems: 'center', background: 'white', border: '0.5px solid rgba(0,0,0,0.08)' }}>
              <button type="button" onClick={() => setEnLecture(p)} title="Lire ce CCTP"
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '10px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}>
                <FileText size={18} color="#9C9591" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titre}</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: '#9C9591' }}>
                    {p.nb_articles} articles · {p.nb_pages} p.{p.indice ? ` · indice ${p.indice}` : ''} · importé le {new Date(p.importe_le).toLocaleDateString('fr-FR')}
                  </span>
                </span>
                <BookOpen size={15} color="var(--affaire-accent, #E8602C)" style={{ flexShrink: 0 }} aria-hidden />
              </button>
              {!lectureSeule && (
                <button type="button" onClick={() => setASupprimer(p)} aria-label={`Supprimer ${p.titre}`} title="Supprimer ce CCTP"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8412C', padding: '4px 12px 4px 4px', minHeight: 44 }}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {donnees?.disponible && pieces.length === 0 && (
        <div style={{ background: 'white', border: '0.5px dashed rgba(0,0,0,0.15)', padding: '28px 20px', textAlign: 'center', fontSize: 13, color: '#5E5854' }}>
          Aucun CCTP pour cette affaire. {lectureSeule ? '' : 'Importez les PDF des bureaux d’études : ils seront découpés en articles, cherchables ici et en visite de chantier.'}
        </div>
      )}

      {articles.length > 0 && <RecherchePieces pieces={pieces} articles={articles} />}

      {importOuvert && (
        <ImportPieces
          affaireId={affaireId}
          lots={lots}
          pieces={pieces}
          onTermine={() => { charger(); rechargerLots() }}
          onFermer={() => { setImportOuvert(false); charger() }}
        />
      )}

      {enLecture && (
        <LecteurCctp piece={enLecture} articles={articles} onFermer={() => setEnLecture(null)} />
      )}

      {dossierOuvert && (
        <DossierClaude affaire={affaire} pieces={pieces} articles={articles} lots={lots} onFermer={() => setDossierOuvert(false)} />
      )}

      {aSupprimer && (
        <ModaleConfirmation
          danger
          titre={`Supprimer « ${aSupprimer.titre} » ?`}
          texte="Le CCTP et ses articles sont retirés de l’application (le lot, lui, reste dans « Entreprises & Lots »). Vous pourrez le réimporter."
          libelle="Supprimer"
          onConfirmer={async () => {
            try { await supprimerPiece(aSupprimer.id); setASupprimer(null); charger() } catch (err) { setErreur(err?.message ?? String(err)); setASupprimer(null) }
          }}
          onAnnuler={() => setASupprimer(null)}
        />
      )}
    </div>
  )
}
