import { useMemo, useState } from 'react'
import { BookOpen, Table2 } from 'lucide-react'
import { lienCctpDpgf, piecesParLot } from './dpgfLogique'
import { LecteurCctp } from './LecteurCctp'
import { LecteurDpgf } from './LecteurDpgf'

// ─── Lire une pièce écrite, et passer du CCTP au DPGF du même lot ────────────
//
// Commun au module (tuiles, recherche) et au mode Visite. Le lien entre
// articles du CCTP et lignes du DPGF se calcule ici, une fois.
// `depart` : { type: 'cctp' | 'dpgf', pieceId, cibleId } — la pièce ouverte
// et le bloc (article ou ligne) sur lequel ouvrir.

export function LecturePiece({ pieces = [], articles = [], lignes = [], depart, grand = false, onFermer }) {
  const [vue, setVue] = useState(depart)
  const lien = useMemo(() => lienCctpDpgf(pieces, articles, lignes), [pieces, articles, lignes])
  const piece = pieces.find((p) => p.id === vue.pieceId)
  const tuile = useMemo(() => piecesParLot(pieces).find((t) => t.cctp?.id === vue.pieceId || t.dpgf?.id === vue.pieceId), [pieces, vue.pieceId])
  if (!piece) return null

  const autre = vue.type === 'cctp' ? tuile?.dpgf : tuile?.cctp
  const actions = autre ? (bouton) => (
    <button type="button" onClick={() => setVue({ type: vue.type === 'cctp' ? 'dpgf' : 'cctp', pieceId: autre.id, cibleId: null })}
      title={vue.type === 'cctp' ? 'Ouvrir le DPGF du lot' : 'Ouvrir le CCTP du lot'} style={bouton}>
      {vue.type === 'cctp' ? <Table2 size={17} /> : <BookOpen size={17} />} {vue.type === 'cctp' ? 'DPGF' : 'CCTP'}
    </button>
  ) : null

  // `key` : changer de pièce remet la lecture en haut, ou sur la cible
  return vue.type === 'dpgf' ? (
    <LecteurDpgf key={`d:${piece.id}:${vue.cibleId}`} piece={piece} lignes={lignes} ligneId={vue.cibleId} lien={lien} aCctp={!!tuile?.cctp}
      grand={grand} actions={actions} onFermer={onFermer}
      onLireArticle={tuile?.cctp ? (article) => setVue({ type: 'cctp', pieceId: tuile.cctp.id, cibleId: article.id }) : undefined} />
  ) : (
    <LecteurCctp key={`c:${piece.id}:${vue.cibleId}`} piece={piece} articles={articles} articleId={vue.cibleId}
      lignesParArticle={lien.parArticle} grand={grand} actions={actions} onFermer={onFermer} />
  )
}
