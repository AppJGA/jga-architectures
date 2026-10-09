import { useContext } from 'react'
import { useLocation } from 'react-router-dom'
import { RetourPage } from '../../shared/components/RetourPage'
import { IconeAccueil, IconePortail, IconeBoiteOutils, IconeGestionAgence, IconeTableauDeBord, IconeVisitesChantier, IconeOpr } from '../../shared/icones/IconesAffaire'
import { retourParDefaut } from './retourLogique'
import { RetourContexte } from './retourContexte'

const ICONES_RETOUR = {
  accueil: IconeAccueil, portail: IconePortail, outils: IconeBoiteOutils, gestion: IconeGestionAgence,
  tableau: IconeTableauDeBord, visites: IconeVisitesChantier, opr: IconeOpr,
}

/** Le retour vers la page qui menait ici : imposé par la page, sinon d'après l'adresse. */
function useRetourAffiche() {
  const location = useLocation()
  const { retour: impose } = useContext(RetourContexte)
  const parDefaut = retourParDefaut(location.pathname, location.search)
  return impose ?? (parDefaut && { ...parDefaut, Icone: ICONES_RETOUR[parDefaut.icone] })
}

/** Flèche, icône et nom de la page précédente — dans le bandeau ou la barre de l'affaire. */
export function RetourCourant({ style }) {
  const retour = useRetourAffiche()
  if (!retour) return null
  return <RetourPage libelle={retour.libelle} Icone={retour.Icone} vers={retour.vers} onClick={retour.onClick} style={style} />
}
