// ─── Recadrage « caméra » d'une timeline ──────────────────────────────────────
//
// Le menu radial est centré sur la barre touchée : on amène d'abord la barre au
// milieu du volet défilant, sinon les pétales sortiraient de la zone visible.
// Tween maison plutôt que scrollTo({ behavior: 'smooth' }) : un saut sec fait
// perdre le fil du planning, et le défilement doux natif ne se laisse pas
// interrompre par le recadrage suivant.

/**
 * @param voletRef { current } — élément défilant de la timeline
 * @param selecteur sélecteur CSS de la barre à centrer
 * @param camera   { current } — animation en cours, annulée si on recadre à nouveau
 */
export function recadrerSurBarre(voletRef, selecteur, camera) {
  const volet = voletRef?.current
  const barre = document.querySelector(selecteur)
  if (!volet || !barre) return
  const rb = barre.getBoundingClientRect()
  const rv = volet.getBoundingClientRect()
  const cibleX = Math.max(0, Math.min(volet.scrollWidth - volet.clientWidth,
    volet.scrollLeft + rb.left - rv.left + rb.width / 2 - volet.clientWidth / 2))
  const cibleY = Math.max(0, Math.min(volet.scrollHeight - volet.clientHeight,
    volet.scrollTop + rb.top - rv.top + rb.height / 2 - volet.clientHeight / 2))

  if (camera.current) cancelAnimationFrame(camera.current)
  const x0 = volet.scrollLeft
  const y0 = volet.scrollTop
  const ex = cibleX - x0
  const ey = cibleY - y0
  if (Math.abs(ex) < 1 && Math.abs(ey) < 1) return

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    volet.scrollLeft = cibleX
    volet.scrollTop = cibleY
    return
  }

  const duree = Math.min(620, Math.max(280, Math.max(Math.abs(ex), Math.abs(ey)) * 0.95))
  const t0 = performance.now()
  const avance = (t) => {
    const p = Math.min(1, (t - t0) / duree)
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    volet.scrollLeft = x0 + ex * e
    volet.scrollTop = y0 + ey * e
    camera.current = p < 1 ? requestAnimationFrame(avance) : null
  }
  camera.current = requestAnimationFrame(avance)
}
