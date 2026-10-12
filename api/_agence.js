// Vérification commune aux fonctions serveur : session Supabase valide, puis
// `est_agence()` demandé avec le propre jeton de l'appelant (règles de la base).

export async function verifierAgence(url, cle, jeton) {
  if (!jeton) return 401
  const entetes = { apikey: cle, Authorization: `Bearer ${jeton}` }
  const utilisateur = await fetch(`${url}/auth/v1/user`, { headers: entetes })
  if (!utilisateur.ok) return 401
  const agence = await fetch(`${url}/rest/v1/rpc/est_agence`, {
    method: 'POST', headers: { ...entetes, 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!agence.ok || (await agence.json()) !== true) return 403
  return 200
}

export const jetonDe = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
