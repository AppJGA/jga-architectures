import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../core/supabase/client'

// Le modèle vit à part : la logique des généralités le lit sans React ni base
export { DEFAULT_TEMPLATE_SECTIONS } from './modeleSections'
import { DEFAULT_TEMPLATE_SECTIONS } from './modeleSections'

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

    const { data: existingSections, error: errLecture } = await supabase
      .from('cr_sections')
      .select('numero_romain')
      .eq('cr_id', crId)
    if (errLecture) throw errLecture
    const existingRomans = new Set((existingSections ?? []).map(s => s.numero_romain))

    for (const tmpl of source) {
      if (existingRomans.has(tmpl.numero_romain)) continue
      // VI et VII sont les parties des remarques, créées d'office et typées
      // (migration 054) : leurs remarques se rangent par destinataire, sans
      // sous-section à tenir à la main.
      if (tmpl.numero_romain === 'VI' || tmpl.numero_romain === 'VII') continue

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

      const { data: newSection, error: errSection } = await supabase
        .from('cr_sections')
        .insert({ cr_id: crId, numero_romain: tmpl.numero_romain, titre: tmpl.titre, ordre: tmpl.ordre })
        .select().single()
      if (errSection) throw errSection

      if (newSection && sousSections.length > 0) {
        const { error: errSous } = await supabase.from('cr_sous_sections').insert(
          sousSections.map((ss, ssIdx) => ({
            cr_id: crId, section_id: newSection.id,
            code: ss.code || String(ssIdx + 1), titre: ss.titre, ordre: ssIdx,
          }))
        )
        if (errSous) throw errSous
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
