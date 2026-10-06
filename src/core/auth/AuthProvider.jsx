import { createContext, useEffect, useState } from 'react'
import { supabase, viderMemoireDonnees } from '../supabase/client'
import { utilisateurDeSessionGardee, echecDeReseau } from './sessionHorsLigne'

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
    let abandon = false
    // Sans réseau, une session expirée n'est pas rendue : on garde alors
    // l'utilisateur rangé sur l'appareil (voir sessionHorsLigne.js)
    const utilisateurGarde = () => {
      try { return utilisateurDeSessionGardee(localStorage.getItem(supabase.auth.storageKey)) } catch { return null }
    }
    const appliquer = ({ data, error }) => {
      if (abandon) return
      const session = data?.session
      if (session?.user) setUser(session.user)
      else if (echecDeReseau(error, navigator.onLine)) setUser(utilisateurGarde())
      else setUser(null)
      setLoading(false)
    }
    const relire = () => supabase.auth.getSession().then(appliquer, (error) => appliquer({ data: null, error }))
    relire()
    // Le renouvellement d'un jeton expiré peut chercher le réseau 30 s : sans
    // réseau, ou s'il tarde, l'utilisateur gardé ouvre l'app tout de suite
    const ouvrirSansAttendre = () => {
      if (abandon) return
      const garde = utilisateurGarde()
      if (!garde) return
      setUser((actuel) => actuel ?? garde)
      setLoading(false)
    }
    if (navigator.onLine === false) ouvrirSansAttendre()
    const minuterie = setTimeout(ouvrirSansAttendre, 2500)

    // Seule une vraie déconnexion efface l'utilisateur : la première
    // annonce, sans session faute de réseau, est laissée à `relire`
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUser(null)
      else if (session?.user) setUser(session.user)
    })
    // Le réseau revient : le jeton se renouvelle
    window.addEventListener('online', relire)

    return () => {
      abandon = true
      clearTimeout(minuterie)
      subscription.unsubscribe()
      window.removeEventListener('online', relire)
    }
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

  // Les données gardées pour le hors-ligne appartiennent à ce compte
  const signOut = async () => {
    const resultat = await supabase.auth.signOut()
    // Sans réseau, la déconnexion n'a pas lieu : rien n'est effacé
    if (!resultat?.error) await viderMemoireDonnees()
    return resultat
  }

  return (
    <AuthContext.Provider value={{ user, loading, profil, estAgence, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
