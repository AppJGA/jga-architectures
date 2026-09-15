// ─── Menu radial d'une barre de planning ──────────────────────────────────────
//
// Repris du composant Claude Design « Editeur Gantt - menu radial » (variante B),
// commun aux plannings chantier (tâches) et étude (phases). Toucher une barre
// ouvre une couronne d'actions autour d'elle, pensée pour le doigt : de grandes
// cibles plutôt que les micro-boutons qui n'apparaissaient qu'au survol, et
// qu'une tablette ne peut donc pas atteindre.
//
// Tout est positionné dans le repère du corps de la timeline (celui des lignes
// et des flèches) : `left`/`width` de la barre, `haut` de sa ligne.

// Icônes de la maquette, reprises telles quelles (tracés 24×24)
const ICONES = {
  params: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  move: <path d="m5 9-3 3 3 3M19 9l3 3-3 3M2 12h20" />,
  resize: <><path d="M4 5v14M20 9l3 3-3 3" /><path d="M4 12h19" /></>,
  dep: <><path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></>,
  dup: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  del: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
}

function Icone({ nom, taille = 20, couleur = '#1F1B17', epaisseur = 1.6 }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} fill="none"
      stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" aria-hidden="true">
      {ICONES[nom]}
    </svg>
  )
}

// Pétales dans l'ordre des aiguilles d'une montre, depuis midi. Le décalage est
// celui du centre du pétale par rapport au centre de la couronne.
const PETALES = [
  { action: 'params', libelle: 'Réglages', dx: 0, dy: -90 },
  { action: 'move', libelle: 'Déplacer', dx: 78, dy: -46 },
  { action: 'resize', libelle: 'Allonger', dx: 78, dy: 46 },
  { action: 'dep', libelle: 'Lier', dx: 0, dy: 90 },
  { action: 'dup', libelle: 'Dupliquer', dx: -78, dy: 46 },
  { action: 'del', libelle: 'Supprimer', dx: -78, dy: -46, danger: true },
]
const PETALE = 64
const DISQUE = 68

/**
 * Voile, barre mise en avant et couronne d'actions.
 *
 * @param barre { left, width, haut, hauteurLigne, barPad, fond, fragments? }
 *              `fond` : valeurs CSS de remplissage de la barre ; `fragments` :
 *              [{ left, width }] quand des fermetures coupent la barre
 * @param objet 'tâche' | 'phase', pour les libellés d'accessibilité
 */
export function MenuRadial({ barre, numero, duree, objet = 'tâche', onAction, onFermer }) {
  const centreX = barre.left + barre.width / 2
  const centreY = barre.haut + barre.hauteurLigne / 2
  const morceaux = barre.fragments ?? [{ left: barre.left, width: barre.width }]

  return (
    <>
      {/* Clic et non pointerdown : fermer au pointerdown laissait le clic
          suivant tomber sur l'élément découvert (un segment ouvrait sa modale). */}
      <div
        onClick={(e) => { e.stopPropagation(); onFermer() }}
        style={{ position: 'absolute', inset: 0, zIndex: 44 }}
      />
      {/* Le voile visible est l'ombre d'un point posé sous la barre : une ombre
          ne compte pas dans le débordement défilable, alors qu'un calque plus
          haut que les lignes ajouterait une barre de défilement fantôme. Le
          calque ci-dessus, lui, ne sert qu'à capter le clic de fermeture. */}
      <div className="jga-voile" style={{
        position: 'absolute', zIndex: 44, pointerEvents: 'none',
        left: centreX, top: centreY, width: 0, height: 0,
        boxShadow: '0 0 0 200vmax rgba(31,27,23,0.32)',
      }} />
      {morceaux.map((m, i) => (
        <div key={i} className="jga-voile" style={{
          position: 'absolute', zIndex: 45, pointerEvents: 'none',
          left: m.left, width: m.width,
          top: barre.haut + barre.barPad, height: barre.hauteurLigne - barre.barPad * 2,
          ...barre.fond, border: '2px solid #E8602C',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)', boxSizing: 'border-box',
        }} />
      ))}

      <div
        role="menu"
        aria-label={`Actions sur la ${objet} ${numero}`}
        style={{ position: 'absolute', left: centreX, top: centreY, width: 0, height: 0, zIndex: 60 }}
      >
        <div className="jga-disque" style={{
          position: 'absolute', left: -DISQUE / 2, top: -DISQUE / 2, width: DISQUE, height: DISQUE,
          borderRadius: '50%', background: '#1F1B17', color: '#FFFFFF',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{numero}</span>
          <span style={{ fontSize: 8, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.65)' }}>{duree}</span>
        </div>

        {PETALES.map((p, i) => (
          <button
            key={p.action}
            type="button"
            role="menuitem"
            className="jga-petale"
            onClick={(e) => { e.stopPropagation(); onAction(p.action) }}
            style={{
              '--dx': `${p.dx}px`, '--dy': `${p.dy}px`,
              animationDelay: `${0.02 + i * 0.04}s`,
              position: 'absolute', left: p.dx - PETALE / 2, top: p.dy - PETALE / 2,
              width: PETALE, height: PETALE, padding: 0, border: 'none', borderRadius: '50%',
              background: '#FFFFFF', boxShadow: '0 4px 16px rgba(0,0,0,0.22)', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              touchAction: 'manipulation',
            }}
          >
            <Icone nom={p.action} couleur={p.danger ? '#B8412C' : '#1F1B17'} />
            <span style={{ fontSize: 9, fontWeight: 600, color: p.danger ? '#B8412C' : '#1F1B17' }}>{p.libelle}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * Mode Déplacer ou Allonger : anneau autour de la barre, grandes poignées
 * tactiles et pastille d'état avec le bouton « Terminé ».
 *
 * @param mode 'move' | 'resize'
 * @param ecart texte de l'écart du geste en cours (« +3 j »)
 */
export function EditionBarre({ barre, mode, ecart, objet = 'tâche', onPoigneeDown, onTerminer }) {
  const poignee = {
    position: 'absolute', top: barre.haut + barre.hauteurLigne / 2 - 22, height: 44,
    background: '#FFFFFF', border: '2px solid #E8602C', borderRadius: 4, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 42, boxShadow: '0 2px 8px rgba(0,0,0,0.18)', touchAction: 'none', cursor: 'grab',
  }
  // Pastille au-dessus de la barre, ou dessous si la ligne est trop haute pour
  // la loger sous l'en-tête collant
  const pastilleHaut = barre.haut - 58 >= 4 ? barre.haut - 58 : barre.haut + barre.hauteurLigne + 8

  return (
    <>
      <div style={{
        position: 'absolute', left: barre.left - 3, width: barre.width + 6,
        top: barre.haut, height: barre.hauteurLigne, boxSizing: 'border-box',
        border: '2px solid #E8602C', boxShadow: '0 0 0 3px rgba(232,96,44,0.18)',
        pointerEvents: 'none', zIndex: 34,
      }} />

      {mode === 'move' ? (
        <div
          aria-label={`Glisser pour déplacer la ${objet}`}
          onPointerDown={(e) => onPoigneeDown(e, 'move')}
          style={{ ...poignee, left: barre.left + barre.width / 2 - 34, width: 68, gap: 3 }}
        >
          <Icone nom="move" couleur="#E8602C" epaisseur={2} />
        </div>
      ) : (
        <>
          <div
            aria-label="Glisser pour changer le début"
            onPointerDown={(e) => onPoigneeDown(e, 'resize-left')}
            style={{ ...poignee, left: barre.left - 22, width: 44, cursor: 'ew-resize' }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#E8602C" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M8 5v14M4 9l-3 3 3 3M1 12h12" />
            </svg>
          </div>
          <div
            aria-label="Glisser pour changer la fin"
            onPointerDown={(e) => onPoigneeDown(e, 'resize-right')}
            style={{ ...poignee, left: barre.left + barre.width - 22, width: 44, cursor: 'ew-resize' }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#E8602C" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M16 5v14M20 9l3 3-3 3M11 12h12" />
            </svg>
          </div>
        </>
      )}

      <div style={{
        position: 'absolute', zIndex: 70,
        left: Math.max(4, barre.left + barre.width / 2 - 130), top: pastilleHaut,
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#1F1B17', color: '#FFFFFF', padding: '6px 6px 6px 14px', borderRadius: 6,
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)', whiteSpace: 'nowrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{mode === 'resize' ? 'Allonger' : 'Déplacer'}</span>
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#F8B89A' }}>{ecart}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTerminer() }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: '#E8602C', color: '#FFFFFF', border: 'none', cursor: 'pointer',
            padding: '0 16px', minHeight: 44, borderRadius: 4, fontSize: 12, fontWeight: 500,
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="m5 13 4 4L19 7" />
          </svg>
          Terminé
        </button>
      </div>
    </>
  )
}

// Bandeau du mode Lier : la barre touchée ensuite devient la suivante
export function BandeauLien({ objet = 'tâche', onAnnuler }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
      background: '#E8602C', color: '#FFFFFF', fontSize: 12, fontWeight: 700,
      padding: '6px 6px 6px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF' }} />
      Sélectionnez la {objet} qui doit suivre
      <button
        type="button"
        onClick={onAnnuler}
        style={{
          marginLeft: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.6)', background: 'transparent', color: '#FFFFFF',
          padding: '0 14px', minHeight: 44, borderRadius: 3, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}
      >
        Annuler
      </button>
    </div>
  )
}
