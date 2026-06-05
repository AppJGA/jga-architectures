import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

export const DEFAULT_TEMPLATE_SECTIONS = [
  { numero_romain: 'I',   titre: 'MISE AU POINT ADMINISTRATIVE',        ordre: 0, sous_sections: [
    { code: '1-1', titre: 'Réunion de chantier' },
    { code: '1-2', titre: 'Situation de travaux - DGD' },
    { code: '1-3', titre: 'Marché - Ordre de service' },
  ]},
  { numero_romain: 'II',  titre: 'COORDINATION - SANTÉ - SÉCURITÉ',     ordre: 1, sous_sections: [
    { code: '1-1', titre: 'Chantier propre' },
    { code: '1-2', titre: 'SPS' },
  ]},
  { numero_romain: 'III', titre: 'MISE AU POINT TECHNIQUE - INTERVENTION', ordre: 2, sous_sections: [
    { code: '1-1', titre: 'Installation de chantier' },
    { code: '1-2', titre: 'Planning' },
  ]},
  { numero_romain: 'IV',  titre: 'RESPECT',                              ordre: 3, sous_sections: [] },
  { numero_romain: 'V',   titre: 'PLANS - DOCUMENTS - RÉSERVATIONS',     ordre: 4, sous_sections: [
    { code: '1-1', titre: 'Fiches techniques et nuanciers' },
    { code: '1-2', titre: 'Plans EXE' },
  ]},
  { numero_romain: 'VI',  titre: 'ÉQUIPE MOE ET MOA',                    ordre: 5, sous_sections: [] },
  { numero_romain: 'VII', titre: 'ENTREPRISES',                          ordre: 6, sous_sections: [] },
]

export function useCrTemplate(affaireId) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!affaireId) return
    setLoading(true)
    const { data } = await supabase
      .from('cr_sections_template')
      .select('*')
      .eq('affaire_id', affaireId)
      .order('ordre')
    setTemplates(data ?? [])
    setLoading(false)
  }, [affaireId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const initDefaults = useCallback(async () => {
    const rows = DEFAULT_TEMPLATE_SECTIONS.map(s => ({
      affaire_id: affaireId,
      numero_romain: s.numero_romain,
      titre: s.titre,
      ordre: s.ordre,
      sous_sections: s.sous_sections,
    }))
    const { error } = await supabase.from('cr_sections_template').insert(rows)
    if (error) throw error
    await fetchAll()
  }, [affaireId, fetchAll])

  const updateTemplate = useCallback(async (id, payload) => {
    const { error } = await supabase.from('cr_sections_template').update(payload).eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const deleteTemplate = useCallback(async (id) => {
    const { error } = await supabase.from('cr_sections_template').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }, [fetchAll])

  const reorderTemplate = useCallback(async (id, dir) => {
    const sorted = [...templates].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(t => t.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    await Promise.all([
      supabase.from('cr_sections_template').update({ ordre: sorted[swapIdx].ordre }).eq('id', sorted[idx].id),
      supabase.from('cr_sections_template').update({ ordre: sorted[idx].ordre }).eq('id', sorted[swapIdx].id),
    ])
    await fetchAll()
  }, [templates, fetchAll])

  // Apply template to a CR
  const applyTemplate = useCallback(async (crId, lots = [], interlocuteurs = []) => {
    const source = templates.length > 0 ? templates : DEFAULT_TEMPLATE_SECTIONS

    const { data: existingSections } = await supabase
      .from('cr_sections')
      .select('numero_romain')
      .eq('cr_id', crId)
    const existingRomans = new Set((existingSections ?? []).map(s => s.numero_romain))

    for (const tmpl of source) {
      if (existingRomans.has(tmpl.numero_romain)) continue

      // Build sous-sections list
      let sousSections = tmpl.sous_sections ?? []

      // Auto-generate sous-sections for VI (interlocuteurs) and VII (lots)
      if (tmpl.numero_romain === 'VI' && interlocuteurs.length > 0) {
        const cats = [...new Set(interlocuteurs.map(i => i.categorie))]
        sousSections = cats.map((cat, idx) => {
          const meta = interlocuteurs.find(i => i.categorie === cat)
          return { code: String(idx + 1), titre: meta?.categorie_label || cat.toUpperCase() }
        })
      }
      if (tmpl.numero_romain === 'VII' && lots.length > 0) {
        sousSections = lots.map((l, idx) => ({
          code: String(idx + 1),
          titre: `Lot ${l.numero ? l.numero + ' — ' : ''}${l.nom}`,
        }))
      }

      const { data: newSection } = await supabase
        .from('cr_sections')
        .insert({ cr_id: crId, numero_romain: tmpl.numero_romain, titre: tmpl.titre, ordre: tmpl.ordre })
        .select().single()

      if (newSection && sousSections.length > 0) {
        await supabase.from('cr_sous_sections').insert(
          sousSections.map((ss, ssIdx) => ({
            cr_id: crId, section_id: newSection.id,
            code: ss.code || String(ssIdx + 1), titre: ss.titre, ordre: ssIdx,
          }))
        )
      }
    }
  }, [templates])

  const addTemplate = useCallback(async (payload) => {
    const maxOrdre = templates.reduce((m, t) => Math.max(m, t.ordre), -1)
    const { error } = await supabase.from('cr_sections_template').insert({
      affaire_id: affaireId, ...payload, ordre: maxOrdre + 1,
    })
    if (error) throw error
    await fetchAll()
  }, [affaireId, templates, fetchAll])

  return {
    templates, loading,
    initDefaults, addTemplate, updateTemplate, deleteTemplate, reorderTemplate,
    applyTemplate, refetch: fetchAll,
  }
}
