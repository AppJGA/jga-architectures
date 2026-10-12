import { useEffect, useRef, useState } from 'react'
import { synchroniser, lireRegistre } from './echeancesNotion'
import { numeroAffaire } from './codesAffaire'

// ─── Échéances Notion dans un planning ──────────────────────────────────────
//
// À l'ouverture, puis 3 s après tout changement des échéances (quel qu'en
// soit le chemin : glissement, fiche, Décaler, ⌘Z — on compare après coup,
// comme le recalage des échéances accrochées), l'affaire est synchronisée
// avec Notion. Une synchronisation qui a changé des échéances de l'app
// demande au planning de les relire (`onChangementsApp`). La signature des
// échéances évite de relancer après cette relecture.
const signature = (jalons) => jalons.map((j) => `${j.id}:${j.date ?? `${j.semaine}/${j.annee}`}:${j.label}`).sort().join('|')

export function useEcheancesNotion({ affaireId, codeAffaire, origine, jalons, pret, onChangementsApp }) {
  const [liens, setLiens] = useState({ lies: new Set(), verrouilles: new Set() })
  const derniere = useRef(null)
  const rappel = useRef(onChangementsApp)
  // Mis à jour hors du rendu : le rappel change d'identité sans relancer la synchronisation
  useEffect(() => { rappel.current = onChangementsApp })
  const numero = numeroAffaire(codeAffaire)

  useEffect(() => {
    if (!pret || !numero) return
    const sig = signature(jalons)
    if (sig === derniere.current) return
    const premiere = derniere.current === null
    const minuteur = setTimeout(async () => {
      derniere.current = sig
      const r = await synchroniser({ affaireId })
      const registre = await lireRegistre({ numero }).catch(() => null)
      if (registre) {
        const miens = registre.filter((l) => l.origine === origine && l.jalon_id != null && l.page_id)
        setLiens({ lies: new Set(miens.map((l) => l.jalon_id)), verrouilles: new Set(miens.filter((l) => l.nb_dates > 1).map((l) => l.jalon_id)) })
      }
      if (r.etat === 'ok' && r.changementsApp > 0) rappel.current?.()
    }, premiere ? 0 : 3000)
    return () => clearTimeout(minuteur)
  }, [affaireId, numero, origine, jalons, pret])

  return liens
}
