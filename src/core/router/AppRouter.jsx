import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { LoginPage } from '../auth/LoginPage'
import { AppShell } from '../layout/AppShell'
import { DashboardPage } from '../../dashboard/DashboardPage'
import { AffairePage } from '../../affaire/AffairePage'
import { ToolsPage } from '../../tools/ToolsPage'
import { tools } from '../../tools/manifest'

const Heures = lazy(() => import('../../tools/heures'))
const HomePage = lazy(() => import('../../pages/HomePage'))

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

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? children : <Navigate to="/login" replace />
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

          <Route path="heures" element={<Wrap><Heures /></Wrap>} />

          {/* Tools */}
          <Route path="tools" element={<ToolsPage />} />
          {tools.map(tool => (
            <Route
              key={tool.id}
              path={`tools/${tool.path}`}
              element={<Wrap><tool.component /></Wrap>}
            />
          ))}

          <Route path="settings" element={<PlaceholderSettings />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
