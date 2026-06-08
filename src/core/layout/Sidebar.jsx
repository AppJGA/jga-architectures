import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Building2, Calendar, BarChart2, CheckSquare, Clock,
  Wrench, Settings,
} from 'lucide-react'

const mainNav = [
  { icon: Building2, path: '/dashboard', label: 'Tableau de bord' },
  { icon: Calendar, path: '/planning', label: 'Planning' },
  { icon: BarChart2, path: '/financier', label: 'Suivi financier' },
  { icon: CheckSquare, path: '/todo', label: 'To-do list' },
  { icon: Clock, path: '/heures', label: 'Heures' },
]

function NavIcon({ icon: Icon, path, label, isTools }) {
  const location = useLocation()
  const [hovered, setHovered] = useState(false)

  const active = isTools
    ? location.pathname.startsWith('/tools')
    : location.pathname.startsWith(path)

  let bg, iconColor, border
  if (active && isTools) {
    bg = 'var(--jga-orange-light)'
    iconColor = 'var(--jga-orange)'
    border = '1.5px solid var(--jga-orange)'
  } else if (active) {
    bg = 'var(--jga-orange)'
    iconColor = 'white'
    border = '1.5px solid transparent'
  } else if (hovered) {
    bg = 'var(--jga-orange-light)'
    iconColor = 'var(--jga-orange)'
    border = '1.5px solid transparent'
  } else {
    bg = 'transparent'
    iconColor = 'var(--jga-beige)'
    border = '1.5px solid transparent'
  }

  return (
    <NavLink
      to={path}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 2,
        backgroundColor: bg,
        border,
        transition: 'background-color 0.15s, border-color 0.15s',
        textDecoration: 'none',
      }}
    >
      <Icon size={18} strokeWidth={1.8} style={{ color: iconColor }} />
    </NavLink>
  )
}

function Separator() {
  return (
    <div
      style={{
        width: 24,
        height: 0,
        borderTop: '0.5px solid rgba(0,0,0,0.1)',
        margin: '4px 0',
      }}
    />
  )
}

export function Sidebar() {
  return (
    <aside
      style={{
        width: 48,
        minWidth: 48,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 0',
        gap: 2,
        borderRight: '0.5px solid rgba(0,0,0,0.1)',
        backgroundColor: 'white',
      }}
    >
      {mainNav.map(item => (
        <NavIcon key={item.path} {...item} />
      ))}

      <Separator />

      <NavIcon icon={Wrench} path="/tools" label="Boîte à outils" isTools />

      <div style={{ flex: 1 }} />

      <Separator />

      <NavIcon icon={Settings} path="/settings" label="Paramètres" />
    </aside>
  )
}
