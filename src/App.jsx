import { AuthProvider } from './core/auth/AuthProvider'
import { AppRouter } from './core/router/AppRouter'

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
