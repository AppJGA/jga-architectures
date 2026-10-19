import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, Trash2, FileText, BookOpen, Table2 } from 'lucide-react'
import { LogoClaude } from '../../../shared/icones/LogoClaude'
import { useLotsEntreprises } from '../../../shared/hooks/useLotsEntreprises'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { ModaleConfirmation } from '../../../shared/components/ModaleConfirmation'
import { listerPieces, supprimerPiece } from './piecesDonnees'
import { piecesParLot } from './dpgfLogique'
import { RecherchePieces } from './RecherchePieces'
import { ImportPieces } from './ImportPieces'
import { DossierClaude } from './DossierClaude'
import { LecturePiece } from './LecturePiece'

// ─── Pièces écrites (CCTP et DPGF) ───────────────────────────────────────────
//
// Les CCTP de l'affaire, découpés en articles, et les DPGF (lignes, unités,
// quantités), cherchables (conceptions : docs/superpowers/specs/
// 2026-10-06-pieces-ecrites-design.md, 2026-10-19-dpgf-design.md). Une tuile
// par lot, avec ses boutons « CCTP » et « DPGF » qui ouvrent la lecture.
// L'import propose le lot de chaque pièce dans « Entreprises & Lots ». En
// lecture seule, on cherche et on lit, mais on n'importe ni ne supprime.

const boutonPiece = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px',
  border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white',
  color: '#1F1B17', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}

function LignePiece({ piece, type, lectureSeule, onLire, onSupprimer }) {
  const detail = type === 'dpgf'
    ? `${piece.nb_articles} ligne${piece.nb_articles > 1 ? 's' : ''}`
    : `${piece.nb_articles} article${piece.nb_articles > 1 ? 's' : ''}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={onLire} title={`Lire ${type === 'dpgf' ? 'le DPGF' : 'le CCTP'}`} style={boutonPiece}>
        {type === 'dpgf' ? <Table2 size={14} color="var(--affaire-accent, #E8602C)" /> : <BookOpen size={14} color="var(--affaire-accent, #E8602C)" />}
        {type.toUpperCase()}
      </button>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#9C9591', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {detail}{piece.nb_pages ? ` · ${piece.nb_pages} p.` : ''}{piece.indice ? ` · ind. ${piece.indice}` : ''} · importé le {new Date(piece.importe_le).toLocaleDateString('fr-FR')}
      </span>
      {!lectureSeule && (
        <button type="button" onClick={onSupprimer} aria-label={`Supprimer le ${type.toUpperCase()} ${piece.titre}`} title={`Supprimer ce ${type.toUpperCase()}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8412C', padding: '4px 6px', minHeight: 36 }}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

export default function PiecesEcritesModule({ lectureSeule = false }) {
  const { affaireId } = useParams()
  const { lots, refetch: rechargerLots } = useLotsEntreprises(affaireId)
  const [donnees, setDonnees] = useState(null) // { disponible, dpgfDisponible, pieces, articles, lignes }
  const [erreur, setErreur] = useState(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [aSupprimer, setASupprimer] = useState(null)
  const { affaire } = useAffaire(affaireId)
  const [dossierOuvert, setDossierOuvert] = useState(false)
  const [enLecture, setEnLecture] = useState(null) // { type, pieceId, cibleId }

  const charger = useCallback(() => {
    listerPieces(affaireId)
      .then((d) => { setDonnees(d); setErreur(null) })
      .catch((err) => setErreur(err?.message ?? String(err)))
  }, [affaireId])
  useEffect(() => { charger() }, [charger])

  const pieces = useMemo(() => donnees?.pieces ?? [], [donnees])
  const articles = donnees?.articles ?? []
  const lignes = donnees?.lignes ?? []
  const tuiles = useMemo(() => piecesParLot(pieces), [pieces])
  // Le dossier pour Claude ne porte que sur les CCTP
  const cctps = useMemo(() => pieces.filter((p) => (p.type ?? 'cctp') === 'cctp'), [pieces])
  const nbDpgf = pieces.length - cctps.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      {donnees && !donnees.disponible && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '10px 14px' }}>
          La migration 061 (pièces écrites) n’est pas encore passée dans Supabase : le module sera utilisable une fois qu’elle le sera.
        </p>
      )}
      {donnees?.disponible && !donnees.dpgfDisponible && !lectureSeule && (
        <p role="status" style={{ margin: 0, fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '8px 14px' }}>
          Les DPGF demandent la migration 073, pas encore passée dans Supabase : en attendant, seuls les CCTP s’importent.
        </p>
      )}
      {erreur && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C' }}>Lecture impossible : {erreur}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ flex: 1, margin: 0, fontSize: 12, color: '#9C9591' }}>
          {donnees === null ? 'Chargement…' : `${cctps.length} CCTP · ${articles.length} articles${nbDpgf ? ` · ${nbDpgf} DPGF · ${lignes.length} lignes` : ''}`}
        </p>
        {cctps.length > 0 && (
          <button type="button" onClick={() => setDossierOuvert(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 3, background: 'white', color: '#1F1B17', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <LogoClaude size={16} /> Préparer le dossier d’analyse de conformité par l’IA
          </button>
        )}
        {!lectureSeule && donnees?.disponible && (
          <button type="button" onClick={() => setImportOuvert(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 16px', border: 'none', borderRadius: 3, background: 'var(--affaire-accent, #E8602C)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Upload size={15} /> Importer des CCTP et DPGF
          </button>
        )}
      </div>

      {tuiles.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
          {tuiles.map((t) => (
            <li key={t.cle} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: '10px 12px' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13, fontWeight: 600, color: '#1F1B17', minWidth: 0 }}>
                <FileText size={16} color="#9C9591" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titre}</span>
              </p>
              {['cctp', 'dpgf'].map((type) => t[type] && (
                <LignePiece key={type} piece={t[type]} type={type} lectureSeule={lectureSeule}
                  onLire={() => setEnLecture({ type, pieceId: t[type].id, cibleId: null })}
                  onSupprimer={() => setASupprimer(t[type])} />
              ))}
            </li>
          ))}
        </ul>
      )}

      {donnees?.disponible && pieces.length === 0 && (
        <div style={{ background: 'white', border: '0.5px dashed rgba(0,0,0,0.15)', padding: '28px 20px', textAlign: 'center', fontSize: 13, color: '#5E5854' }}>
          Aucune pièce écrite pour cette affaire. {lectureSeule ? '' : 'Importez les CCTP et DPGF des bureaux d’études, en PDF ou en Excel : ils seront cherchables ici et en visite de chantier.'}
        </div>
      )}

      {(articles.length > 0 || lignes.length > 0) && <RecherchePieces pieces={pieces} articles={articles} lignes={lignes} />}

      {enLecture && (
        <LecturePiece pieces={pieces} articles={articles} lignes={lignes} depart={enLecture} onFermer={() => setEnLecture(null)} />
      )}

      {importOuvert && (
        <ImportPieces
          affaireId={affaireId}
          lots={lots}
          pieces={pieces}
          dpgfDisponible={donnees?.dpgfDisponible ?? false}
          onTermine={() => { charger(); rechargerLots() }}
          onFermer={() => { setImportOuvert(false); charger() }}
        />
      )}

      {dossierOuvert && (
        <DossierClaude affaire={affaire} pieces={cctps} articles={articles} lots={lots} onFermer={() => setDossierOuvert(false)} />
      )}

      {aSupprimer && (
        <ModaleConfirmation
          danger
          titre={`Supprimer le ${(aSupprimer.type ?? 'cctp').toUpperCase()} « ${aSupprimer.titre} » ?`}
          texte={`${aSupprimer.type === 'dpgf' ? 'Le DPGF et ses lignes sont retirés' : 'Le CCTP et ses articles sont retirés'} de l’application (le lot, lui, reste dans « Entreprises & Lots »). Vous pourrez le réimporter.`}
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
