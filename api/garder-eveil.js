/* global process -- fonction serveur Vercel (Node), pas du code navigateur */
// ─── Garder Supabase éveillé ─────────────────────────────────────────────────
//
// L'offre gratuite de Supabase met un projet en pause après 7 jours sans
// requête. Vercel appelle cette adresse une fois par jour (vercel.json,
// « crons ») : une lecture minuscule suffit à compter comme activité.
//
// Clé publique (anon), la même que l'app : sous les règles RLS, la lecture ne
// renvoie rien à un visiteur, mais elle passe bien par la base.

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const cle = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !cle) {
    res.status(500).json({ ok: false, erreur: 'Variables Supabase absentes' })
    return
  }
  try {
    const reponse = await fetch(`${url}/rest/v1/affaires?select=id&limit=1`, {
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    })
    res.status(reponse.ok ? 200 : 502).json({ ok: reponse.ok, statut: reponse.status, le: new Date().toISOString() })
  } catch (e) {
    res.status(502).json({ ok: false, erreur: String(e?.message ?? e) })
  }
}
