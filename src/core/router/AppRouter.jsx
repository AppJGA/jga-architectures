import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { LoginPage } from '../auth/LoginPage'
import { AppShell } from '../layout/AppShell'
import { DashboardPage } from '../../dashboard/DashboardPage'
import { AffairePage } from '../../affaire/AffairePage'
import { ToolsPage } from '../../tools/ToolsPage'
import { tools } from '../../tools/manifest'

const Heures = lazy(() => import('../../tools/heures'))
const HomePage = lazy(() => import('../../pages/HomePage'))
const CarnetAdresses = lazy(() => import('../../pages/CarnetAdressesPage'))
const GestionAgence = lazy(() => import('../../gestion/GestionPage'))

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--jga-orange-light)', borderTopColor: 'var(--jga-orange)' }}
      />
    </div>
  )
}

function Wrap({ children }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>
}

// L'adresse demandée suit jusqu'à la connexion : un lien partagé (une
// to-do list, une tâche) y mène une fois connecté, pas à l'accueil
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  return user ? children : <Navigate to="/login" replace state={{ depuis: location.pathname + location.search }} />
}

// Écrans réservés à l'agence. La base refuse déjà leurs données à un compte
// extérieur ; cette barrière évite de lui montrer un écran vide.
function AgenceSeule({ children }) {
  const { estAgence } = useAuth()
  return estAgence ? children : <Navigate to="/dashboard" replace />
}

// Gestion d'agence : associés et administrateur (migrations 067, 068). Tant
// que le profil n'est pas lu, on attend plutôt que de renvoyer à l'accueil.
function AssocieSeul({ children }) {
  const { accesGestion } = useAuth()
  if (accesGestion === null) return <Spinner />
  return accesGestion ? children : <Navigate to="/home" replace />
}

function PlaceholderSettings() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2" style={{ color: 'var(--jga-beige)' }}>
      <p className="text-base font-medium text-gray-700">Paramètres</p>
      <p className="text-sm">Bientôt disponible</p>
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Prévisualisation d'écran, hors authentification et hors AppShell —
            uniquement pour regarder un rendu en développement.

            `import.meta.env.DEV` est une constante remplacée à la compilation :
            en production l'expression devient `false && …` et la route disparaît
            du bundle. Le montage est volontairement nu (ni Topbar ni Sidebar) :
            AppShell afficherait la barre latérale sur ce chemin, ce que la page
            d'accueil n'a jamais. */}
        {import.meta.env.DEV && (
          <Route path="/_preview/home" element={<Wrap><HomePage /></Wrap>} />
        )}

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<Wrap><HomePage /></Wrap>} />
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Affaire page — vue d'ensemble ou module */}
          <Route path="affaires/:affaireId" element={<AffairePage />} />
          <Route path="affaires/:affaireId/:moduleId" element={<AffairePage />} />

          <Route path="carnet-adresses" element={<AgenceSeule><Wrap><CarnetAdresses /></Wrap></AgenceSeule>} />
          <Route path="gestion-agence" element={<AssocieSeul><Wrap><GestionAgence /></Wrap></AssocieSeul>} />
          <Route path="gestion-agence/:outil" element={<AssocieSeul><Wrap><GestionAgence /></Wrap></AssocieSeul>} />
          <Route path="heures" element={<AgenceSeule><Wrap><Heures /></Wrap></AgenceSeule>} />

          {/* Tools */}
          <Route path="tools" element={<AgenceSeule><ToolsPage /></AgenceSeule>} />
          {tools.map(tool => (
            <Route
              key={tool.id}
              path={`tools/${tool.path}`}
              element={<AgenceSeule><Wrap><tool.component /></Wrap></AgenceSeule>}
            />
          ))}

          <Route path="settings" element={<PlaceholderSettings />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
