// ─── Un interlocuteur d'affaire versé au carnet d'adresses ───────────────────
//
// Le carnet range des fiches (table `entreprises`, raison sociale obligatoire)
// et, sous chacune, des personnes (table `interlocuteurs`). Un interlocuteur
// d'affaire, lui, porte tout à plat : personne, organisation, coordonnées.
// Ce qui se décide sans base vit ici (tests/carnet.test.js).

const propre = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
const cle = (t) => propre(t).toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * La fiche du carnet et la personne à y rattacher.
 * - Avec une organisation : la fiche porte son nom et son adresse, la
 *   personne ses téléphone et e-mail.
 * - Sans organisation (un particulier, un maire nommé seul) : la fiche porte
 *   le nom de la personne et toutes ses coordonnées, sans contact à part.
 * @returns { entreprise, interlocuteur | null } ou null s'il n'y a rien à verser
 */
export function ficheCarnet(form = {}) {
  const organisation = propre(form.organisation)
  const prenom = propre(form.prenom)
  const nom = propre(form.nom)
  const personne = [prenom, nom].filter(Boolean).join(' ')
  const raison = organisation || personne
  if (!raison) return null
  const telephone = propre(form.telephone) || null
  const email = propre(form.email) || null
  const adresse = propre(form.adresse) || null
  if (!organisation) {
    return { entreprise: { raison_sociale: raison, adresse, telephone, email }, interlocuteur: null }
  }
  return {
    entreprise: { raison_sociale: organisation, adresse, ...(personne ? {} : { telephone, email }) },
    interlocuteur: personne ? { prenom: prenom || null, nom: nom || null, fonction: propre(form.fonction) || null, telephone, email } : null,
  }
}

/** La même fiche est-elle déjà au carnet ? Sans tenir compte des majuscules ni des accents. */
export function memeNom(a, b) {
  return !!cle(a) && cle(a) === cle(b)
}

// ─── Interlocuteur d'affaire déjà au carnet : le retrouver, comparer ─────────

const nomPersonne = (p) => [p?.prenom, p?.nom].map(propre).filter(Boolean).join(' ')

/**
 * La fiche du carnet (et la personne) qui correspond à un interlocuteur
 * d'affaire, d'après ses valeurs : l'organisation par son nom — ou, sans
 * organisation, la fiche à son nom —, puis la personne dans cette fiche.
 * @param entreprises fiches du carnet avec leurs `interlocuteurs`
 * @returns { entreprise, personne | null } ou null
 */
export function correspondanceCarnet(form = {}, entreprises = []) {
  const personne = nomPersonne(form)
  const organisation = propre(form.organisation)
  const nomFiche = organisation || personne
  if (!nomFiche) return null
  const entreprise = entreprises.find((e) => memeNom(e.raison_sociale, nomFiche))
  if (!entreprise) return null
  const trouvee = organisation && personne
    ? (entreprise.interlocuteurs ?? []).find((p) => memeNom(nomPersonne(p), personne)) ?? null
    : null
  return { entreprise, personne: trouvee }
}

const LIBELLES = {
  raison_sociale: 'Organisation', adresse: 'Adresse', prenom: 'Prénom', nom: 'Nom',
  fonction: 'Fonction', telephone: 'Téléphone', email: 'E-mail',
}

/** L'adresse du carnet telle qu'elle remplit le formulaire (rue, code postal ville). */
export function adresseCarnet(e) {
  const lieu = [e?.code_postal, e?.ville].map(propre).filter(Boolean).join(' ')
  return [propre(e?.adresse), lieu].filter(Boolean).join(', ')
}

/**
 * Ce qui, dans le formulaire, diffère du carnet. Un téléphone ou un e-mail
 * vide chez la personne est celui de son organisation (comme au remplissage) :
 * il ne compte comme écart que s'il change vraiment.
 * @returns [{ cible: 'entreprise' | 'personne', id, champ, libelle, avant, apres, valeur }]
 */
export function ecartsCarnet(liaison, form = {}) {
  if (!liaison?.entreprise) return []
  const { entreprise: e, personne: p } = liaison
  const ecarts = []
  const ajouter = (cible, id, champ, avant, apres, valeur = apres) => {
    if (propre(apres) && cle(avant) !== cle(apres)) ecarts.push({ cible, id, champ, libelle: LIBELLES[champ], avant: propre(avant), apres: propre(apres), valeur })
  }

  const organisation = propre(form.organisation)
  if (organisation && !memeNom(organisation, e.raison_sociale)) ajouter('entreprise', e.id, 'raison_sociale', e.raison_sociale, organisation)

  // Adresse : le carnet la range en rue / code postal / ville ; si le lieu
  // n'a pas changé, seule la rue est réécrite
  const adresse = propre(form.adresse)
  const lieu = [e.code_postal, e.ville].map(propre).filter(Boolean).join(' ')
  const rue = lieu && adresse.endsWith(`, ${lieu}`) ? adresse.slice(0, -(lieu.length + 2)) : adresse
  ajouter('entreprise', e.id, 'adresse', adresseCarnet(e), adresse, rue)

  if (p) {
    ajouter('personne', p.id, 'prenom', p.prenom, form.prenom)
    ajouter('personne', p.id, 'nom', p.nom, form.nom)
    ajouter('personne', p.id, 'fonction', p.fonction, form.fonction)
    ajouter('personne', p.id, 'telephone', p.telephone || e.telephone, form.telephone)
    ajouter('personne', p.id, 'email', p.email || e.email, form.email)
  } else if (!organisation || !nomPersonne(form)) {
    // Fiche sans personne à part : ses coordonnées sont celles de la fiche
    ajouter('entreprise', e.id, 'telephone', e.telephone, form.telephone)
    ajouter('entreprise', e.id, 'email', e.email, form.email)
  }
  return ecarts
}

/** Les mises à jour du carnet, une par fiche et une par personne. */
export function ecrituresCarnet(ecarts = []) {
  const parCible = new Map()
  for (const x of ecarts) {
    const k = `${x.cible}:${x.id}`
    if (!parCible.has(k)) parCible.set(k, { table: x.cible === 'entreprise' ? 'entreprises' : 'interlocuteurs', id: x.id, champs: {} })
    parCible.get(k).champs[x.champ] = x.valeur
  }
  return [...parCible.values()]
}
