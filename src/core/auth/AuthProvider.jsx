import { createContext, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'

export const AuthContext = createContext(null)

// Type de compte (migration 050) : « agence » ouvre toute l'application,
// « extérieur » n'en voit que les comptes rendus des affaires où il est invité.
// La base tranche de toute façon ; ici, il s'agit seulement de ne pas montrer
// des portes qui se refermeraient.
//
// Le dernier type connu est gardé sur l'appareil : sans réseau (visite de
// chantier), l'écran ne se réduit pas faute d'avoir pu lire le profil.
const CLE_TYPE = 'jga.type_compte'

function typeGarde(userId) {
  try {
    const garde = JSON.parse(localStorage.getItem(CLE_TYPE) ?? 'null')
    return garde?.id === userId ? garde.type : null
  } catch { return null }
}

function garderType(userId, type) {
  try { localStorage.setItem(CLE_TYPE, JSON.stringify({ id: userId, type })) } catch { /* navigation privée */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profilCharge, setProfilCharge] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    let abandon = false
    supabase.from('profiles').select('id, prenom, nom, email, type_compte').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (abandon) return
        // Colonne absente (migration 050 pas encore passée) : tout le monde est
        // de l'agence, comme avant.
        const type = error || !data ? (typeGarde(user.id) ?? 'agence') : (data.type_compte ?? 'agence')
        garderType(user.id, type)
        setProfilCharge({ ...(data ?? { id: user.id }), type_compte: type })
      })
    return () => { abandon = true }
  }, [user])

  // Le profil chargé ne vaut que pour l'utilisateur courant : à la
  // déconnexion, il est simplement ignoré.
  const profil = profilCharge?.id === user?.id ? profilCharge : null
  const estAgence = !user || (profil ? profil.type_compte === 'agence' : (typeGarde(user.id) ?? 'agence') === 'agence')

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, loading, profil, estAgence, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
