# Carnet d'adresses : plusieurs interlocuteurs par organisation — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** gérer plusieurs personnes par organisation du carnet, choisir la personne par affaire (lots et contacts d'affaire) avec un vrai lien, et montrer dans le carnet où chaque personne et chaque organisation interviennent.

**Architecture :** migration 072 (type d'organisation, lien `affaire_interlocuteurs.interlocuteur_id`, reprise des contacts existants) ; logique pure dans `src/shared/carnet/` (usages, types, clé de comparaison) ; écrans : contacts d'affaire (lien gardé), lots (menu de la personne), carnet (personnes, usages, filtre par type).

**Tech Stack :** React 19, Supabase (PostgREST, Postgres 17), tests `node --test`.

**Spec :** `docs/superpowers/specs/2026-10-13-carnet-interlocuteurs-design.md`

## Global Constraints

- Français partout (commentaires, noms métier, commits `feat:` / `fix:` / `test:` / `docs:` terminés par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Styles inline ; le carnet est bleu (`var(--jga-blueprint)`), jamais l'orange par défaut.
- Une fenêtre ne se ferme jamais au clic à côté (✕, Annuler, Échap ou l'action seulement) ; une fenêtre `fixed` ouverte sous une carte animée passe par `createPortal`.
- `InterlocuteursEditeur` vit dans un `<form>` : aucun `<form>` dedans, tout bouton en `type="button"`.
- Supabase ne lève pas d'exception : lire `{ error }`. Un refus RLS sur update/delete ne rend pas d'erreur : compter les lignes quand c'est décisif.
- Migration passée à la main : le code tolère l'absence de `entreprises.type` et `affaire_interlocuteurs.interlocuteur_id` (écriture retentée sans la colonne, filtre par type masqué).
- Affichage d'un numéro de lot par `numeroLot` (`src/shared/lots/numeroLot.js`), jamais `lot.numero`.
- Dépôt public : aucun nom réel dans le code ni les tests.
- `npm test` et `npm run build` passent avant chaque commit ; `npx eslint src api` reste à 72 problèmes.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/072_carnet_interlocuteurs.sql` (créé) | type, lien, contrainte, reprise |
| `src/shared/carnet/categoriesContact.js` (créé) | `CATEGORIE_META` (déplacé du crochet, pur) |
| `src/shared/carnet/carnetLiensLogique.js` (créé) | types, clé de comparaison, usages, suppression possible |
| `src/shared/hooks/useAffaireInterlocuteurs.js` (modifié) | réexporte `CATEGORIE_META` ; écriture retentée sans `interlocuteur_id` |
| `src/modules/chantier/comptes-rendus/rechercheCarnetLogique.js`, `carnet.js`, `InterlocuteursModal.jsx` (modifiés) | lien gardé |
| `src/shared/hooks/useLotsEntreprises.js`, `src/modules/chantier/lots-entreprises/index.jsx` (modifiés) | menu de la personne d'un lot |
| `src/pages/CarnetAdressesPage.jsx` (modifié), `src/pages/carnet/PersonnesOrganisation.jsx` (créé) | personnes, usages, type |
| `tests/carnet-liens.test.js` (créé), `tests/recherche-carnet.test.js` (modifié) | tests |
| `CLAUDE.md` | documentation |

---

### Task 1 : migration 072

**Files :** Create `supabase/migrations/072_carnet_interlocuteurs.sql`

**Interfaces :** Produces `entreprises.type` (`entreprise` | `bet` | `moa` | `autre`), `affaire_interlocuteurs.interlocuteur_id`, fonction SQL `carnet_cle(text)`.

- [ ] **Step 1 : écrire la migration**

```sql
-- Migration 072 : carnet d'adresses, plusieurs interlocuteurs par organisation
--
-- Conception : docs/superpowers/specs/2026-10-13-carnet-interlocuteurs-design.md.
-- Une organisation du carnet a un type (entreprise, bureau d'études, maître
-- d'ouvrage, autre) et un contact d'affaire est relié à sa personne du carnet
-- (`interlocuteur_id`) en plus de sa copie, qui reste l'historique imprimé
-- dans les comptes rendus. Les contacts déjà saisis sont reliés quand le
-- prénom, le nom et l'organisation retrouvent une seule personne.
--
-- Rejouable. La clé de comparaison `carnet_cle` est recopiée en JS
-- (`cleComparaison`, src/shared/carnet/carnetLiensLogique.js) : modifier les
-- deux ensemble.

alter table entreprises add column if not exists type text not null default 'autre';
alter table entreprises drop constraint if exists entreprises_type_check;
alter table entreprises add constraint entreprises_type_check check (type in ('entreprise', 'bet', 'moa', 'autre'));

alter table affaire_interlocuteurs add column if not exists interlocuteur_id uuid references interlocuteurs(id) on delete set null;
create index if not exists affaire_interlocuteurs_interlocuteur on affaire_interlocuteurs (interlocuteur_id);
create index if not exists affaire_interlocuteurs_entreprise on affaire_interlocuteurs (entreprise_id);

-- Supprimer une organisation emporte ses personnes (cascade) : un lot qui en
-- désignait une perd seulement son représentant
alter table lot_entreprises drop constraint if exists lot_entreprises_interlocuteur_id_fkey;
alter table lot_entreprises add constraint lot_entreprises_interlocuteur_id_fkey
  foreign key (interlocuteur_id) references interlocuteurs(id) on delete set null;

-- Sans majuscules, accents ni ponctuation ; pas d'extension unaccent supposée
create or replace function carnet_cle(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿŒœÆæ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyyOoAa')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Reprise : une personne nommée, retrouvée seule dans l'organisation copiée
-- (ou, sans organisation, dans la fiche à son nom)
with candidats as (
  select ai.id as contact_id, i.id as personne_id, i.entreprise_id,
         count(*) over (partition by ai.id) as n
  from affaire_interlocuteurs ai
  join entreprises e
    on carnet_cle(e.raison_sociale) = carnet_cle(coalesce(nullif(btrim(ai.organisation), ''), concat_ws(' ', ai.prenom, ai.nom)))
  join interlocuteurs i
    on i.entreprise_id = e.id and carnet_cle(concat_ws(' ', i.prenom, i.nom)) = carnet_cle(concat_ws(' ', ai.prenom, ai.nom))
  where ai.interlocuteur_id is null and carnet_cle(concat_ws(' ', ai.prenom, ai.nom)) <> ''
)
update affaire_interlocuteurs ai
set interlocuteur_id = c.personne_id, entreprise_id = c.entreprise_id
from candidats c
where c.contact_id = ai.id and c.n = 1;

-- Une organisation seule (sans personne retrouvée) : relier la fiche
with candidats as (
  select ai.id as contact_id, e.id as entreprise_id, count(*) over (partition by ai.id) as n
  from affaire_interlocuteurs ai
  join entreprises e on carnet_cle(e.raison_sociale) = carnet_cle(ai.organisation)
  where ai.entreprise_id is null and carnet_cle(ai.organisation) <> ''
)
update affaire_interlocuteurs ai set entreprise_id = c.entreprise_id
from candidats c where c.contact_id = ai.id and c.n = 1;

-- Type déduit, une fois : attributaire d'un lot, puis BET, puis MOA. Une
-- fiche déjà typée n'est pas touchée.
update entreprises e set type = 'entreprise'
where e.type = 'autre' and exists (select 1 from lot_entreprises le where le.entreprise_id = e.id);
update entreprises e set type = 'bet'
where e.type = 'autre' and exists (select 1 from affaire_interlocuteurs ai where ai.entreprise_id = e.id and ai.categorie = 'be');
update entreprises e set type = 'moa'
where e.type = 'autre' and exists (select 1 from affaire_interlocuteurs ai where ai.entreprise_id = e.id and ai.categorie = 'moa');

notify pgrst, 'reload schema';
```

- [ ] **Step 2 : relire** — rejouable, noms de contraintes existants (`lot_entreprises_interlocuteur_id_fkey` est le nom par défaut de Postgres pour la 005 : le vérifier en lisant `supabase/migrations/005_lots_entreprises.sql`, aucune contrainte nommée explicitement), aucune donnée réelle.

- [ ] **Step 3 : commit** `feat: migration 072 — type d'organisation et lien des contacts d'affaire au carnet`

---

### Task 2 : logique pure du carnet

**Files :** Create `src/shared/carnet/categoriesContact.js`, `src/shared/carnet/carnetLiensLogique.js`, `tests/carnet-liens.test.js` ; Modify `src/shared/hooks/useAffaireInterlocuteurs.js` (le `CATEGORIE_META` y est remplacé par `export { CATEGORIE_META } from '../carnet/categoriesContact'`, sans changer les importeurs).

**Interfaces :** Produces
- `CATEGORIE_META` (même objet qu'aujourd'hui) ;
- `TYPES_ORGANISATION = [{ code, libelle, pluriel }]` (`entreprise` Entreprise/Entreprises, `bet` Bureau d'études/Bureaux d'études, `moa` Maître d'ouvrage/Maîtres d'ouvrage, `autre` Autre/Autres), `libelleType(code)` ;
- `cleComparaison(texte)` (copie de `carnet_cle`) ;
- `usagesDePersonne(personneId, { lots, contacts })` et `usagesDOrganisation(entreprise, { lots, contacts })` → `[{ cle, affaire: { id, code_affaire, nom }, role }]` triés par code d'affaire puis rôle, sans doublon de `cle` ;
- `affairesDesUsages(usages)` → affaires uniques ;
- `personneSupprimable(personneId, donnees)` → booléen.

Formes d'entrée : `lots = [{ id, entreprise_id, interlocuteur_id, lot: { numero, numero_affiche, nom }, affaire }]`, `contacts = [{ id, entreprise_id, interlocuteur_id, categorie, categorie_label, affaire }]`, `entreprise = { id, interlocuteurs: [{ id }] }`.

- [ ] **Step 1 : tests** (`tests/carnet-liens.test.js`)

```js
// Carnet d'adresses : où une personne et une organisation interviennent,
// type d'organisation, clé de comparaison. Données inventées.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  TYPES_ORGANISATION, libelleType, cleComparaison, usagesDePersonne, usagesDOrganisation,
  affairesDesUsages, personneSupprimable,
} from '../src/shared/carnet/carnetLiensLogique.js'

const A1 = { id: 'a1', code_affaire: '2699-ABC', nom: 'Logements' }
const A2 = { id: 'a2', code_affaire: '2698-XYZ', nom: 'École' }
const lots = [
  { id: 'le1', entreprise_id: 'e1', interlocuteur_id: 'p1', lot: { numero: 2, numero_affiche: '02', nom: 'Gros œuvre' }, affaire: A1 },
  { id: 'le2', entreprise_id: 'e1', interlocuteur_id: 'p2', lot: { numero: 3, numero_affiche: null, nom: 'Charpente' }, affaire: A2 },
  { id: 'le3', entreprise_id: 'e1', interlocuteur_id: null, lot: { numero: 4, numero_affiche: null, nom: 'Couverture' }, affaire: A2 },
]
const contacts = [
  { id: 'c1', entreprise_id: 'e1', interlocuteur_id: 'p1', categorie: 'be', categorie_label: null, affaire: A2 },
  { id: 'c2', entreprise_id: null, interlocuteur_id: 'p2', categorie: 'autre', categorie_label: 'Géomètre', affaire: A1 },
  { id: 'c3', entreprise_id: 'e9', interlocuteur_id: null, categorie: 'moa', categorie_label: null, affaire: A1 },
]

test('types d’organisation', () => {
  assert.deepEqual(TYPES_ORGANISATION.map((t) => t.code), ['entreprise', 'bet', 'moa', 'autre'])
  assert.equal(libelleType('bet'), 'Bureau d’études')
  assert.equal(libelleType('inconnu'), 'Autre')
})

test('clé de comparaison : comme carnet_cle en SQL', () => {
  assert.equal(cleComparaison('  Éts  DUPONT-Frères '), 'ets dupont freres')
  assert.equal(cleComparaison('Œuvre & Cie'), 'ouvre cie')
  assert.equal(cleComparaison(null), '')
})

test('usages d’une personne : représentant de lot et contact d’affaire', () => {
  assert.deepEqual(usagesDePersonne('p1', { lots, contacts }).map((u) => [u.affaire.code_affaire, u.role]), [
    ['2698-XYZ', "Bureau d'études"],  // libellé de CATEGORIE_META, apostrophe droite
    ['2699-ABC', 'représentant lot 02 Gros œuvre'],
  ])
  assert.deepEqual(usagesDePersonne('p2', { lots, contacts }).map((u) => u.role), ['représentant lot 03 Charpente', 'Géomètre'])
  assert.deepEqual(usagesDePersonne('p3', { lots, contacts }), [])
})

test('usages d’une organisation : ses lots, ses contacts, ceux de ses personnes', () => {
  const e1 = { id: 'e1', interlocuteurs: [{ id: 'p1' }, { id: 'p2' }] }
  const usages = usagesDOrganisation(e1, { lots, contacts })
  assert.deepEqual(usages.map((u) => [u.affaire.code_affaire, u.role]), [
    ['2698-XYZ', "Bureau d'études"],
    ['2698-XYZ', 'lot 03 Charpente'],
    ['2698-XYZ', 'lot 04 Couverture'],
    ['2699-ABC', 'Géomètre'],
    ['2699-ABC', 'lot 02 Gros œuvre'],
  ])
  assert.deepEqual(affairesDesUsages(usages).map((a) => a.code_affaire), ['2698-XYZ', '2699-ABC'])
})

test('une personne utilisée ne se supprime pas', () => {
  assert.equal(personneSupprimable('p1', { lots, contacts }), false)
  assert.equal(personneSupprimable('p3', { lots, contacts }), true)
})
```

- [ ] **Step 2 : voir échouer** — `node --import ./tests/resolve-src.mjs --test tests/carnet-liens.test.js`.

- [ ] **Step 3 : `src/shared/carnet/categoriesContact.js`** — y déplacer `CATEGORIE_META` tel quel depuis `useAffaireInterlocuteurs.js` (avec un commentaire d'une ligne : pur, partagé avec le carnet) ; dans le crochet, `export { CATEGORIE_META } from '../carnet/categoriesContact'` et, s'il s'en sert lui-même, un `import`.

- [ ] **Step 4 : `src/shared/carnet/carnetLiensLogique.js`**

```js
// ─── Carnet d'adresses : où une personne et une organisation interviennent ───
//
// Conception : docs/superpowers/specs/2026-10-13-carnet-interlocuteurs-design.md.
// Une personne du carnet sert dans une affaire comme représentant d'un lot
// (`lot_entreprises.interlocuteur_id`) ou comme contact de l'affaire
// (`affaire_interlocuteurs.interlocuteur_id`, migration 072). Une organisation
// y sert par ses lots, par ses contacts reliés à elle, et par ceux de ses
// personnes. Pur (tests/carnet-liens.test.js).

import { CATEGORIE_META } from './categoriesContact.js'
import { numeroLot } from '../lots/numeroLot.js'

export const TYPES_ORGANISATION = [
  { code: 'entreprise', libelle: 'Entreprise', pluriel: 'Entreprises' },
  { code: 'bet', libelle: 'Bureau d’études', pluriel: 'Bureaux d’études' },
  { code: 'moa', libelle: 'Maître d’ouvrage', pluriel: 'Maîtres d’ouvrage' },
  { code: 'autre', libelle: 'Autre', pluriel: 'Autres' },
]

export const libelleType = (code) => (TYPES_ORGANISATION.find((t) => t.code === code) ?? TYPES_ORGANISATION[3]).libelle

// Copie de `carnet_cle` (migration 072) : modifier les deux ensemble
const DE = 'ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿŒœÆæ'
const VERS = 'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyyOoAa'
export function cleComparaison(texte) {
  const traduit = [...String(texte ?? '')].map((c) => { const i = DE.indexOf(c); return i >= 0 ? VERS[i] : c }).join('')
  return traduit.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const libelleLot = (lot) => [`lot ${numeroLot(lot, { minimum: 2 })}`, lot?.nom].filter(Boolean).join(' ')
const libelleContact = (c) => (c.categorie === 'autre' && c.categorie_label) || CATEGORIE_META[c.categorie]?.label || 'Contact'

function trier(usages) {
  const vus = new Set()
  return usages
    .filter((u) => u.affaire && !vus.has(u.cle) && vus.add(u.cle))
    .sort((a, b) => (a.affaire.code_affaire ?? '').localeCompare(b.affaire.code_affaire ?? '') || a.role.localeCompare(b.role, 'fr'))
}

export function usagesDePersonne(personneId, { lots = [], contacts = [] } = {}) {
  return trier([
    ...lots.filter((l) => l.interlocuteur_id === personneId)
      .map((l) => ({ cle: `lot:${l.id}`, affaire: l.affaire, role: `représentant ${libelleLot(l.lot)}` })),
    ...contacts.filter((c) => c.interlocuteur_id === personneId)
      .map((c) => ({ cle: `contact:${c.id}`, affaire: c.affaire, role: libelleContact(c) })),
  ])
}

export function usagesDOrganisation(entreprise, { lots = [], contacts = [] } = {}) {
  const personnes = new Set((entreprise?.interlocuteurs ?? []).map((p) => p.id))
  return trier([
    ...lots.filter((l) => l.entreprise_id === entreprise?.id)
      .map((l) => ({ cle: `lot:${l.id}`, affaire: l.affaire, role: libelleLot(l.lot) })),
    ...contacts.filter((c) => c.entreprise_id === entreprise?.id || (c.interlocuteur_id && personnes.has(c.interlocuteur_id)))
      .map((c) => ({ cle: `contact:${c.id}`, affaire: c.affaire, role: libelleContact(c) })),
  ])
}

export function affairesDesUsages(usages) {
  const vues = new Map()
  for (const u of usages ?? []) if (!vues.has(u.affaire.id)) vues.set(u.affaire.id, u.affaire)
  return [...vues.values()]
}

export const personneSupprimable = (personneId, donnees) => usagesDePersonne(personneId, donnees).length === 0
```

Vérifier la signature réelle de `numeroLot` dans `src/shared/lots/numeroLot.js` et l'adapter (le test attend « 02 » pour `numero_affiche: '02'` et « 03 » pour `numero: 3` sans texte saisi). Le test « Œuvre & Cie » : `Œ` → `O`, donc « ouvre cie » (comme `translate` en SQL).

- [ ] **Step 5 : vert** — test ciblé, puis `npm test`, `npx eslint src api` (72).

- [ ] **Step 6 : commit** `feat: carnet — logique des usages d'une personne et d'une organisation, types d'organisation`

---

### Task 3 : contacts de l'affaire reliés au carnet

**Files :** Modify `src/modules/chantier/comptes-rendus/rechercheCarnetLogique.js`, `carnet.js`, `InterlocuteursModal.jsx`, `src/shared/hooks/useAffaireInterlocuteurs.js`, `tests/recherche-carnet.test.js`.

**Interfaces :** Consumes Task 1 (colonne `interlocuteur_id`), `entreprise_id` (déjà présent). Produces : une option « personne » de `optionsCarnet` porte dans `champs` `interlocuteur_id: i.id, entreprise_id: e.id` ; une option « organisation » `entreprise_id: e.id, interlocuteur_id: null` ; `verserAuCarnet(form)` rend aussi `{ entrepriseId, interlocuteurId }` (créés ou retrouvés).

- [ ] **Step 1 : tests** — dans `tests/recherche-carnet.test.js`, adapter les attentes de `champs` (ajout des deux identifiants) et ajouter :

```js
test('choisir dans le carnet garde le lien vers la fiche et la personne', () => {
  const opts = optionsCarnet([{ id: 'e1', raison_sociale: 'Exemple BET', interlocuteurs: [{ id: 'p1', prenom: 'Alix', nom: 'Durand' }] }])
  const personne = opts.find((o) => o.type === 'personne')
  const fiche = opts.find((o) => o.type === 'organisation')
  assert.deepEqual([personne.champs.interlocuteur_id, personne.champs.entreprise_id], ['p1', 'e1'])
  const apres = remplirDepuis(fiche, { prenom: 'X', interlocuteur_id: 'p9', entreprise_id: 'e9' })
  assert.deepEqual([apres.interlocuteur_id, apres.entreprise_id, apres.prenom], [null, 'e1', 'X'])
})
```

- [ ] **Step 2 : voir échouer, puis implémenter** dans `optionsCarnet`.

- [ ] **Step 3 : `carnet.js`** — `verserAuCarnet` garde l'id de la personne retrouvée (`dejaLa` devient la personne trouvée) ou créée (`insert(...).select('id').single()`), et rend `{ ficheCreee, personneCreee, entrepriseId: entreprise.id, interlocuteurId }` (`interlocuteurId` nul sans personne).

- [ ] **Step 4 : `InterlocuteursModal.jsx` (`InterloForm`)** :
  - après `verserAuCarnet` réussi, enregistrer avec `{ ...form, entreprise_id: r.entrepriseId, interlocuteur_id: r.interlocuteurId }` (l'état `form` ne suffit pas : `setForm` ne s'applique qu'au rendu suivant — calculer le payload puis l'envoyer) ; `enregistrer` reçoit donc un formulaire en paramètre (par défaut `form`) ;
  - un contact retrouvé par valeurs (`liaison`) et non relié (`!form.interlocuteur_id`) est relié à l'enregistrement : `entreprise_id: liaison.entreprise.id`, `interlocuteur_id: liaison.personne?.id ?? null` ;
  - rien d'autre ne change (écarts, cases, textes).

- [ ] **Step 5 : `useAffaireInterlocuteurs.js`** — `addInterlocuteur` / `updateInterlocuteur` : si l'écriture échoue parce que la colonne `interlocuteur_id` manque (`error.code` `PGRST204` ou `42703` et message contenant `interlocuteur_id`), la retenter sans ce champ (même schéma que `colonneAbsente` de `src/gestion/gestionDonnees.js`).

- [ ] **Step 6 : vérifier** — `npm test`, `npm run build`, eslint (72). Relire que `InterlocuteursEditeur` n'a ni `<form>` ni bouton sans `type="button"` ajouté.

- [ ] **Step 7 : commit** `feat: contacts d'affaire — le choix dans le carnet garde le lien vers la personne`

---

### Task 4 : lots — choisir la personne de l'entreprise

**Files :** Modify `src/shared/hooks/useLotsEntreprises.js` (`useEntreprises` lit `select('*, interlocuteurs(id, prenom, nom, fonction, est_principal)')`), `src/modules/chantier/lots-entreprises/index.jsx`.

**Interfaces :** `EntrepriseAssignModal` reçoit les entreprises avec leurs `interlocuteurs` ; `onSave` reçoit `interlocuteur_id` choisi.

- [ ] **Step 1 : `EntrepriseAssignModal`**
  - état `interlocuteurId` initialisé à `lot.interlocuteur_id ?? null` ; **remis à null quand l'entreprise choisie change** (aujourd'hui l'ancien représentant suit une autre entreprise) ;
  - sous l'entreprise choisie (onglet « existante »), un `<select>` « Interlocuteur » : « — Aucun — », les personnes de cette entreprise (prénom nom · fonction ; la principale en tête), et « Nouvelle personne… » ;
  - « Nouvelle personne… » : à l'enregistrement de la fenêtre, après `onSave`, ouvrir `InterlocuteurFormModal` en création pour ce lot (le flux existant `handleInterlocuteurSave` crée la personne et l'attribue) — passer par un rappel `onNouvellePersonne` fourni par la page ;
  - onglet « nouvelle entreprise » : pas de menu (aucune personne encore) ;
  - `onSave({ …, interlocuteur_id: interlocuteurId })`.
- [ ] **Step 2 : page** — câbler `onNouvellePersonne` (ouvre `InterlocuteurFormModal` en création sur le lot fraîchement attribué, après `refetch`).
- [ ] **Step 3 : vérifier** — build, tests, eslint ; relire : le menu respecte la hauteur des champs tactiles (`minHeight` cohérent avec les autres champs de la fenêtre).
- [ ] **Step 4 : commit** `feat: lots — choisir l'interlocuteur parmi les personnes de l'entreprise`

---

### Task 5 : le carnet d'adresses

**Files :** Modify `src/pages/CarnetAdressesPage.jsx` ; Create `src/pages/carnet/PersonnesOrganisation.jsx`.

**Interfaces :** Consumes Task 2 (`TYPES_ORGANISATION`, `libelleType`, `usagesDePersonne`, `usagesDOrganisation`, `affairesDesUsages`, `personneSupprimable`).

- [ ] **Step 1 : lectures**
  - entreprises : `select('*, interlocuteurs(*), lot_entreprises(id, entreprise_id, interlocuteur_id, lots(id, numero, numero_affiche, nom, affaires(id, nom, code_affaire, phase)))')` ;
  - contacts d'affaire reliés : `affaire_interlocuteurs` `select('id, entreprise_id, interlocuteur_id, categorie, categorie_label, affaires(id, nom, code_affaire)')` filtré `or('interlocuteur_id.not.is.null,entreprise_id.not.is.null')` ; si la colonne manque (`42703` / `PGRST204` / message `interlocuteur_id`), relire sans elle (`entreprise_id` seul) ;
  - aplatir en `lots` et `contacts` à la forme de la Task 2 (`affaire` = l'objet `affaires`, `lot` = l'objet `lots`).
- [ ] **Step 2 : type** — filtre « Toutes / Entreprises / Bureaux d'études / Maîtres d'ouvrage / Autres » à côté des filtres existants, masqué si aucune fiche n'a de `type` (migration absente) ; type affiché sur la carte et la ligne ; choix du type dans `EntrepriseEditModal` (envoyé seulement si la colonne existe : retenter sans `type` sur `42703` / `PGRST204`).
- [ ] **Step 3 : affaires de l'organisation** — remplacer `getUniqueAffaires` par `affairesDesUsages(usagesDOrganisation(e, { lots, contacts }))` (carte : badges + « +N », ligne : compteur) ; au survol d'un badge, le rôle.
- [ ] **Step 4 : `PersonnesOrganisation.jsx`** — ouverte depuis la carte ou la ligne (bouton « Personnes (N) ») : fenêtre en `createPortal`, fermée par ✕, Annuler, Échap seulement ; pour chaque personne : nom, fonction, téléphone, e-mail, « principal », et dessous ses usages (`usagesDePersonne`, « 2699-ABC · représentant lot 02 Gros œuvre », lien `/affaires/:id`) ; « + Ajouter une personne » ; crayon (formulaire prénom, nom, fonction, téléphone, e-mail, principal) ; corbeille : si `personneSupprimable` est faux, la fenêtre de confirmation liste les affaires et n'offre pas la suppression ; sinon suppression (compter la ligne supprimée). « Principal » : une seule par organisation (décocher les autres à l'enregistrement).
- [ ] **Step 5 : suppression d'une organisation** — inchangée (ses personnes partent avec elle, ses attributions de lots sont retirées comme aujourd'hui), mais la confirmation liste ses affaires (`affairesDesUsages`) et dit : « Les lots concernés n'auront plus d'entreprise attribuée ; les contacts d'affaire gardent leurs coordonnées. »
- [ ] **Step 6 : vérifier** — build, tests, eslint (72). Le carnet reste bleu (`var(--jga-blueprint)`).
- [ ] **Step 7 : commit** `feat: carnet — personnes de chaque organisation, leurs affaires, type d'organisation`

---

### Task 6 : documentation

- [ ] `CLAUDE.md` : nombre de tests, « 72 fichiers » de migrations, et dans « Contacts de l'affaire » : lien `interlocuteur_id` (copie = historique, carnet ≠ affaires), type d'organisation, usages calculés par `carnetLiensLogique.js`, `carnet_cle` / `cleComparaison` à modifier ensemble, menu de la personne d'un lot (remise à zéro au changement d'entreprise), personne utilisée non supprimable.
- [ ] Commit `docs: CLAUDE.md — carnet, plusieurs interlocuteurs par organisation`.
