import { useState, useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { RetourContexte } from './retourContexte'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  const location = useLocation()
  // Retour du bandeau imposé par la page affichée (sinon : d'après l'adresse)
  const [retour, definir] = useState(null)
  const contexteRetour = useMemo(() => ({ retour, definir }), [retour])
  const showSidebar =
    !location.pathname.startsWith('/dashboard') &&
    !location.pathname.startsWith('/affaires/') &&
    !location.pathname.startsWith('/home') &&
    !location.pathname.startsWith('/carnet-adresses') &&
    // La boîte à outils tient sur une page : la barre latérale y égarait plus
    // qu'elle n'aidait (à reprendre quand les outils seront nombreux)
    !location.pathname.startsWith('/tools')

  return (
    // Installée sur l'écran d'accueil de l'iPad, l'app s'affiche sous la barre
    // d'état (heure, batterie : réglage « black-translucent » de index.html).
    // La marge `safe-area-inset-top` redescend le logo et le compte sous elle ;
    // la bande reste sombre pour que l'heure, écrite en blanc, se lise. Sur
    // ordinateur et dans Safari, cette marge vaut zéro.
    <RetourContexte.Provider value={contexteRetour}>
    <div
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: '#1F1B17', paddingTop: 'env(safe-area-inset-top)' }}
    >
      {showSidebar && <Sidebar />}
      <div className="flex flex-col flex-1 min-w-0" style={{ backgroundColor: 'var(--jga-beige-light)' }}>
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </RetourContexte.Provider>
  )
}
