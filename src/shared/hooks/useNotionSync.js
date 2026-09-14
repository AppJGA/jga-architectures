import { useState, useMemo, useCallback } from 'react'
import { useNotionGantt } from './useNotionGantt'
import { getISOWeek, getWeekStart, weeksBetween, parseDateLocale } from '../../modules/etude/planning/types'

// Notion échange des dates 'YYYY-MM-DD' sans heure. `toISOString()` convertit
// en UTC : le minuit local d'un lundi devient le dimanche en France. Formatage
// et relecture se font donc tous deux en heure locale.
function formaterDateLocale(date) {
  const mois = String(date.getMonth() + 1).padStart(2, '0')
  const jour = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mois}-${jour}`
}

// ── codePhase → type_tache interne ────────────────────────────────────────────
const CODE_TO_TYPE = {
  ESQ: 'etude', AVP: 'etude', PRO: 'etude', DCE: 'etude', ACT: 'etude',
  VISA: 'chantier', DET: 'chantier', OPR: 'chantier', AOR: 'chantier',
  DIAG: 'administratif',
}

// ── Notion → GanttEtude ───────────────────────────────────────────────────────
export function notionPhaseToEtude(np) {
  let semaine_debut = 1
  let annee_debut   = new Date().getFullYear()
  let duree_semaines = 1

  const dateDebut = parseDateLocale(np.dateDebut)
  const dateFin = parseDateLocale(np.dateFinPrevue)

  if (dateDebut) {
    const iso = getISOWeek(dateDebut)
    semaine_debut = iso.semaine
    annee_debut   = iso.annee
  }

  if (dateDebut && dateFin) {
    const d = getISOWeek(dateDebut)
    const f = getISOWeek(dateFin)
    duree_semaines = Math.max(1, weeksBetween(d.semaine, d.annee, f.semaine, f.annee))
  }

  return {
    // Identifiants — notion_id stocké en mémoire uniquement
    notion_id:      np.id,
    _codePhase:     np.codePhase,   // préservé pour le matching Supabase↔Notion
    // Champs internes GanttEtude
    nom:            np.nom ?? '',
    type_tache:     CODE_TO_TYPE[np.codePhase] ?? 'etude',
    importance:     'moe',
    semaine_debut,
    annee_debut,
    duree_semaines,
    duree_arch:     null,
    duree_bet:      null,
    duree_econ:     null,
    depends_on:     null,
    lag_semaines:   0,
    ordre:          np.ordre ?? 0,
    avancement:     Math.round((np.avancement ?? 0) * 100),
  }
}

// ── GanttEtude → Notion ───────────────────────────────────────────────────────
export function etudePhaseToNotion(phase) {
  const debutDate = getWeekStart(phase.semaine_debut, phase.annee_debut)
  const debutISO  = formaterDateLocale(debutDate)

  const finDate = new Date(debutDate)
  finDate.setDate(finDate.getDate() + (phase.duree_semaines ?? 1) * 7)
  const finISO = formaterDateLocale(finDate)

  return {
    dateDebut:      debutISO,
    dateFinPrevue:  finISO,
    avancement:     (phase.avancement ?? 0) / 100,
  }
}

// ── Hook d'orchestration ───────────────────────────────────────────────────────
export function useNotionSync(affaireId) {
  const storageKey = `notion_sync_${affaireId}`

  const [notionEnabled, setNotionEnabled] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true' } catch { return false }
  })

  const serverUrl = import.meta.env.VITE_GANTT_SERVER ?? 'http://localhost:3001'

  // useNotionGantt se connecte uniquement si enabled=true
  const notion = useNotionGantt({ affaireId, serverUrl, enabled: notionEnabled })

  const toggleNotion = useCallback(() => {
    setNotionEnabled(prev => {
      const next = !prev
      try { localStorage.setItem(storageKey, String(next)) } catch {}
      return next
    })
  }, [storageKey])

  // Phases Notion converties au format interne (avec notion_id + _codePhase)
  const notionPhases = useMemo(() => {
    if (!notionEnabled || notion.phases.length === 0) return []
    return notion.phases.map(notionPhaseToEtude)
  }, [notionEnabled, notion.phases])

  // Pousse une mise à jour vers Notion — silent si serveur inaccessible
  const pushToNotion = useCallback(async (notionId, phase) => {
    if (!notionEnabled || !notionId) return
    try {
      await notion.updatePhase(notionId, etudePhaseToNotion(phase))
    } catch {
      // Notion est opt-in : ne jamais bloquer l'app
    }
  }, [notionEnabled, notion.updatePhase])

  return {
    notionEnabled,
    toggleNotion,
    notionConnected: notionEnabled ? notion.connected : false,
    notionPhases,
    pushToNotion,
    pullFromNotion: notion.reload,
    lastUpdateAt:   notion.lastUpdateAt,
  }
}
