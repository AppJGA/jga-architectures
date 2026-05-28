import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  const location = useLocation()
  const showSidebar =
    !location.pathname.startsWith('/dashboard') &&
    !location.pathname.startsWith('/affaires/') &&
    !location.pathname.startsWith('/home')

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--jga-beige-light)' }}>
      {showSidebar && <Sidebar />}
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
