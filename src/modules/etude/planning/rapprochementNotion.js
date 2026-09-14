// Rapprochement des phases Notion avec celles enregistrées en base.
//
// Chaque phase ne peut être rapprochée qu'une fois : une phase Notion associée
// à deux phases en base pousserait ses dates sur les deux, et une phase en base
// réclamée par deux phases Notion en masquerait une à l'écran.

function echapperRegex(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Le code doit apparaître comme un mot entier : « PRO » ne doit pas désigner
// « Programmation », ni « ESQ » « Esquisse ».
function contientCode(nom, code) {
  if (!nom || !code) return false
  const motif = new RegExp(`(^|[^\\p{L}\\p{N}])${echapperRegex(code)}($|[^\\p{L}\\p{N}])`, 'iu')
  return motif.test(nom)
}

/**
 * @returns {{ correspondances: Map, nonRapprochees: Array }}
 *   `correspondances` : id de la phase en base → id de la page Notion ;
 *   `nonRapprochees` : phases Notion sans équivalent, à afficher en plus.
 */
export function rapprocherPhasesNotion(phasesBase, phasesNotion) {
  const base = (phasesBase ?? []).filter((p) => p?.id != null)
  const notion = phasesNotion ?? []
  const prises = new Set()       // ids en base déjà rapprochés
  const associees = new Map()    // index Notion → phase en base

  // 1. Code de phase, en mot entier, seulement s'il ne désigne qu'une phase
  notion.forEach((np, i) => {
    if (!np._codePhase) return
    const candidates = base.filter((p) => !prises.has(p.id) && contientCode(p.nom, np._codePhase))
    if (candidates.length !== 1) return
    prises.add(candidates[0].id)
    associees.set(i, candidates[0])
  })

  // 2. Ordre, parmi ce qui reste, et seulement s'il est sans ambiguïté des
  //    deux côtés : l'ordre est réaffecté à chaque réorganisation et se
  //    retrouve souvent en double.
  notion.forEach((np, i) => {
    if (associees.has(i) || np.ordre == null) return
    const candidates = base.filter((p) => !prises.has(p.id) && p.ordre === np.ordre)
    const rivales = notion.filter((autre, j) => j !== i && !associees.has(j) && autre.ordre === np.ordre)
    if (candidates.length !== 1 || rivales.length > 0) return
    prises.add(candidates[0].id)
    associees.set(i, candidates[0])
  })

  const correspondances = new Map()
  associees.forEach((p, i) => {
    if (notion[i].notion_id) correspondances.set(p.id, notion[i].notion_id)
  })
  const nonRapprochees = notion.filter((_, i) => !associees.has(i))
  return { correspondances, nonRapprochees }
}
