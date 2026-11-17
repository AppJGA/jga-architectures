# État des lieux — Lot 2 « Visiter » — plan de travail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mener sur la tablette la visite d'un état des lieux : enregistrement continu (pause, voile gris dès que rien n'est enregistré), étages et pièces agrandies au toucher, points numérotés posés sur le plan avec type facultatif (barre d'icônes des calques) et photos, journal horodaté de chaque geste, le tout sans réseau grâce à une file d'opérations envoyée par le moteur de synchro de l'app.

**Architecture:** tout ce qui se décide sans navigateur vit dans des fichiers purs testés (`calquesEdl.js`, `visite/visiteLogique.js`, `visite/fileEdlLogique.js`, ajouts à `enregistrementLogique.js` et `plansLogique.js`). Le moteur audio des comptes rendus est rendu générique : `enregistreur.js` gagne `couper()`, `audioLocal.js` range les morceaux par « visite » (`crId` ou `edlVisiteId`), et un hook commun `useEnregistreur` porte démarrage, pause, reprise, coupure et états ; le robot des CR s'appuie dessus sans changer d'interface. La visite écrit toujours par une file (base IndexedDB à part `jga-edl`, identifiants décidés sur l'appareil, ordre de création = ordre d'envoi, doublon `23505` = succès) ; l'écran affiche l'instantané emporté plus la file. Migration 079 : `edl_visites`, `edl_points`, `edl_evenements`, `edl_photos`.

**Tech Stack:** React 19, Vite, Supabase (Postgres, stockage privé `edl`), IndexedDB, MediaRecorder / Web Audio, lucide-react, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` (§ 2, 3, 5, 8, 9, 10). Plan du lot 1 : `docs/superpowers/plans/2026-11-17-etat-des-lieux-lot1-preparer.md`.

**Hors de ce lot (décision du 2026-11-17, reportée dans la spec en Task 13) :** rendre `transcription.js` indépendant du CR, faire envoyer les morceaux audio en attente par `useMoteurSynchro`, et vérifier les horodatages par segment de Mistral passent au lot 3 ; au lot 2, l'audio de l'état des lieux attend sur l'appareil.

## Global Constraints

- Français partout : commentaires, noms métier, textes d'écran, messages de commit (`feat:` / `fix:` / `test:` / `chore:` / `docs:`), commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Réponses à l'utilisateur en français.
- Styles inline, couleurs par variables CSS ; dans une affaire l'accent est `var(--affaire-accent)` (orange à l'étude), jamais `--jga-orange`.
- Charte du module : angles presque droits (2–3 px), bordures 0,5 px, alertes rouge `#B8412C`, ambre `#FFFBEB` / `#92400E`, onglets soulignés des étages ; **pas de `flex-wrap` autour du plan**.
- Une fenêtre ne se ferme jamais au clic à côté (✕, Annuler, Échap seulement ; aucun `onClick` sur le fond).
- iPad : boutons de 44 px au moins ; écran plein avec bande sombre `env(safe-area-inset-top)` ; panneaux ancrés en haut (le clavier couvre le bas) ; gestes par événements pointeur, **`pointercancel` = annulation, rien d'enregistré** ; un champ dans une ligne pose `minHeight: 0`.
- Animations : `@keyframes` dans `src/index.css` seulement (réutiliser la classe `jga-enregistre`), jamais inline.
- **Aucun plan réel dans le dépôt** (public) : tests sur pièces et plans inventés.
- Toute table créée : `grant select, insert, update, delete on public.<table> to authenticated;` et `… to service_role;`, règle « Agence » (`est_agence()`), trois règles restrictives `peut_modifier_affaire(affaire_id)` (modèle : migration 077).
- Un chemin de stockage commence toujours par `<affaire_id>/` ; photos de l'état des lieux dans le bucket privé `edl` : `<affaire_id>/edl/photos/…`.
- Supabase ne lève pas d'exception : tester `{ error }` ; un refus RLS sur `update` / `delete` ne rend pas d'erreur → compter les lignes (`.select('id')`).
- Rien de ce qui est enregistré ne se calcule dans un `setState(prev => …)`.
- Hors ligne (spec § 5) : identifiants décidés sur l'appareil, ordre de création = ordre d'envoi, doublon `23505` = succès, base IndexedDB à part `jga-edl`, envoi aussi par `useMoteurSynchro`.
- Le code tolère l'absence de la migration 079 (message « La visite demande la migration 079 dans Supabase. »).
- Lot 2 : **aucune IA, aucune transcription** — les morceaux audio de l'état des lieux restent sur l'appareil (base `jga-audio`) jusqu'au lot 3.
- Le module Comptes rendus continue de marcher sans changement visible ; ses tests passent.
- `npm test` et `npm run build` passent avant chaque commit ; `npx eslint src` : ne pas ajouter de problème (≈ 71 préexistants, comparer avant / après).
- En fin de lot : commit **et** push sur `main` (le site est déployé depuis `main`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/079_edl_visite.sql` | tables `edl_visites`, `edl_points`, `edl_evenements`, `edl_photos`, droits, garde « pas de remplacement après une visite », `fichiers_orphelins()` étendue |
| `src/modules/etude/etat-des-lieux/calquesEdl.js` | calques `EDL-…` et types d'éléments (pur) |
| `src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js` | + visite d'un morceau (`cleVisite`, `deLaVisite`, `champsVisite`), états du moteur (`etatApresEvenement`, `enregistrementActif`, `etatPourLeCr`), `messageDemarrage` |
| `…/enregistrement/audioLocal.js` | morceaux et tranches retrouvés par visite (CR ou état des lieux) |
| `…/enregistrement/enregistreur.js` | + `couper()` |
| `…/enregistrement/useEnregistreur.js` | hook commun : démarrer, pause, reprendre, arrêter, couper, état, niveau, durée |
| `…/enregistrement/useEnregistrementVisite.js` | robot des CR, réécrit sur `useEnregistreur` (même interface) |
| `src/modules/etude/etat-des-lieux/visite/useEnregistrementEdl.js` | enregistrement de la visite d'état des lieux |
| `…/visite/visiteLogique.js` | pièce sous un point, cadre d'une pièce, numéros, pièces visitées, pense-bête, événements du moteur, messages (pur) |
| `…/visite/fileEdlLogique.js` | opérations, application à l'instantané, inverse d'un geste, journal (pur) |
| `src/modules/chantier/comptes-rendus/plansLogique.js` | + `vueSurCadre` |
| `src/modules/chantier/comptes-rendus/VisionneusePlan.jsx` | + props `cadre`, `zoomMax` |
| `…/visite/baseEdl.js` | IndexedDB `jga-edl` (instantanés, opérations, fichiers) |
| `…/visite/envoiEdl.js` | envoi d'une opération à Supabase |
| `…/visite/synchroEdl.js` | verrou, envoi de la file, report dans l'instantané, envoi de toutes les affaires |
| `…/visite/visiteDonnees.js` | lecture fraîche de tout l'état des lieux, instantané gardé |
| `…/visite/photosEdl.js` | photo compressée rangée sur l'appareil, miniature locale |
| `src/modules/chantier/comptes-rendus/horsLigne/useFileGlobale.js` | le moteur de synchro envoie aussi la file de l'état des lieux |
| `…/visite/useVisiteEdl.js` | état affiché (instantané + file) et actions de la visite |
| `…/visite/BandeauEnregistrement.jsx` | bandeau rouge « Enregistrement · 12:34 » + jauge, ou bandeau d'arrêt |
| `…/visite/BarreCalques.jsx` | barre d'icônes des calques, types en puces |
| `…/visite/PanneauPoint.jsx` | point choisi : type, photo, suppression, miniatures |
| `…/visite/PlanVisite.jsx` | plan de l'étage ou pièce agrandie, pièces colorées, points (toucher, glisser) |
| `…/visite/VisiteEdl.jsx` | écran plein de la visite |
| `src/modules/etude/etat-des-lieux/index.jsx` | « Démarrer la visite » (`?visite=1`), « Remplacer les plans » retiré après une visite |
| `tests/etat-des-lieux-visite.test.js` | calques, logique de visite, file |
| `tests/enregistrement.test.js`, `tests/plans.test.js` | ajouts |
| `CLAUDE.md` | documentation du lot 2 |

---

### Task 1 : Migration 079

**Files:**
- Create: `supabase/migrations/079_edl_visite.sql`

**Interfaces:**
- Consumes : tables `edl_etats`, `edl_niveaux`, `edl_pieces` (077) ; fonctions `est_agence()`, `peut_modifier_affaire(uuid)`.
- Produces :
  - `edl_visites(id uuid pk sans défaut, etat_id, affaire_id, debut timestamptz, fin timestamptz null, created_by, created_at)`
  - `edl_points(id uuid pk sans défaut, visite_id, affaire_id, niveau_id, piece_id null (set null), numero int, x numeric, y numeric (mètres, repère du plan), calque text null, type text null, pose_le timestamptz, created_by, created_at, updated_at)`
  - `edl_evenements(id uuid pk sans défaut, visite_id, affaire_id, type text (liste fermée), niveau_id null, piece_id null, point_id uuid null sans clé étrangère, le timestamptz, detail jsonb, created_at)`
  - `edl_photos(id uuid pk sans défaut, point_id (cascade), visite_id, affaire_id, chemin, chemin_miniature, largeur, hauteur, poids_octets, prise_le, created_by, created_at)`
  - Types d'événement : `debut`, `fin`, `entree`, `sortie`, `point`, `point-modifie`, `point-supprime`, `photo`, `pause`, `reprise`, `coupure`.
  - Déclencheur `edl_etats_garde_visites` : refuse la suppression directe d'un état des lieux qui a une visite (code `P0001`, message « Une visite a déjà eu lieu : les plans de cet état des lieux ne se remplacent plus. »).

Décision : une table `edl_visites` est ajoutée — le journal, les points et les photos d'une séance s'y rattachent, une visite non terminée se reprend, et « Remplacer les plans » se refuse dès qu'il en existe une. `edl_enregistrements` et `edl_elements` restent au lot 3.

- [ ] **Step 1 : écrire la migration**

```sql
-- Migration 079 : état des lieux — lot 2 (visiter)
--
-- Conception : docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md, § 5.
-- Une visite (séance sur place, reprise possible tant qu'elle n'est pas
-- terminée), ses points posés sur le plan (en mètres, repère du plan
-- d'origine, comme les contours des pièces), son journal horodaté et les
-- photos des points (stockage privé `edl`, `<affaire>/edl/photos/…`).
--
-- Tout s'écrit depuis la tablette, souvent sans réseau : les identifiants
-- sont décidés sur l'appareil (aucun défaut), un envoi rejoué écrit la même
-- ligne. Agence seule ; écriture réservée aux collaborateurs (règle 060).
-- Rejouable.

create table if not exists edl_visites (
  id          uuid primary key,
  etat_id     uuid not null references edl_etats(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  debut       timestamptz not null,
  fin         timestamptz,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists edl_points (
  id          uuid primary key,
  visite_id   uuid not null references edl_visites(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  niveau_id   uuid not null references edl_niveaux(id) on delete cascade,
  -- Pièce corrigée ou supprimée au bureau : le point reste, rattaché à l'étage
  piece_id    uuid references edl_pieces(id) on delete set null,
  numero      integer not null,
  x           numeric not null,
  y           numeric not null,
  calque      text,
  type        text,
  -- heure de l'appareil : le lot 3 la rapproche de la parole
  pose_le     timestamptz not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists edl_evenements (
  id          uuid primary key,
  visite_id   uuid not null references edl_visites(id) on delete cascade,
  affaire_id  uuid not null references affaires(id) on delete cascade,
  type        text not null check (type in (
    'debut', 'fin', 'entree', 'sortie', 'point', 'point-modifie', 'point-supprime',
    'photo', 'pause', 'reprise', 'coupure')),
  niveau_id   uuid references edl_niveaux(id) on delete set null,
  piece_id    uuid references edl_pieces(id) on delete set null,
  -- Sans clé étrangère : le journal garde la trace d'un point supprimé
  point_id    uuid,
  le          timestamptz not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists edl_photos (
  id                uuid primary key,
  point_id          uuid not null references edl_points(id) on delete cascade,
  visite_id         uuid not null references edl_visites(id) on delete cascade,
  affaire_id        uuid not null references affaires(id) on delete cascade,
  chemin            text not null,
  chemin_miniature  text not null,
  largeur           integer,
  hauteur           integer,
  poids_octets      bigint,
  prise_le          timestamptz not null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

-- Depuis le 30 octobre 2026, Supabase n'ouvre plus d'office une nouvelle
-- table à l'API : sans ces droits, « permission denied ». Pas d'anon.
grant select, insert, update, delete on public.edl_visites    to authenticated;
grant select, insert, update, delete on public.edl_visites    to service_role;
grant select, insert, update, delete on public.edl_points     to authenticated;
grant select, insert, update, delete on public.edl_points     to service_role;
grant select, insert, update, delete on public.edl_evenements to authenticated;
grant select, insert, update, delete on public.edl_evenements to service_role;
grant select, insert, update, delete on public.edl_photos     to authenticated;
grant select, insert, update, delete on public.edl_photos     to service_role;

create index if not exists edl_visites_etat on edl_visites(etat_id, debut);
create index if not exists edl_points_affaire on edl_points(affaire_id, numero);
create index if not exists edl_points_niveau on edl_points(niveau_id);
create index if not exists edl_evenements_visite on edl_evenements(visite_id, le);
create index if not exists edl_evenements_affaire_type on edl_evenements(affaire_id, type);
create index if not exists edl_photos_point on edl_photos(point_id);
create index if not exists edl_photos_affaire on edl_photos(affaire_id);

create or replace function edl_points_touche() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists edl_points_touche on edl_points;
create trigger edl_points_touche before update on edl_points
  for each row execute function edl_points_touche();

do $$
declare t text;
begin
  foreach t in array array['edl_visites', 'edl_points', 'edl_evenements', 'edl_photos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Agence" on %I', t);
    execute format('create policy "Agence" on %I for all to authenticated using (public.est_agence()) with check (public.est_agence())', t);
    execute format('drop policy if exists "Collaborateurs : ajout" on %I', t);
    execute format('drop policy if exists "Collaborateurs : modification" on %I', t);
    execute format('drop policy if exists "Collaborateurs : suppression" on %I', t);
    execute format('create policy "Collaborateurs : ajout" on %I as restrictive for insert to authenticated with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
    execute format('create policy "Collaborateurs : modification" on %I as restrictive for update to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id)) with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
    execute format('create policy "Collaborateurs : suppression" on %I as restrictive for delete to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id))', t);
  end loop;
end $$;

-- ─── Plus de « Remplacer les plans » après une visite ────────────────────────
-- Les points sont posés sur les étages et les pièces : les remplacer les
-- effacerait. La suppression de l'affaire (cascade, profondeur > 1) passe.
create or replace function edl_etats_garde_visites() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.edl_visites v where v.etat_id = old.id) then
    raise exception 'Une visite a déjà eu lieu : les plans de cet état des lieux ne se remplacent plus.'
      using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists edl_etats_garde_visites on edl_etats;
create trigger edl_etats_garde_visites before delete on edl_etats
  for each row execute function edl_etats_garde_visites();

-- ─── Fichiers inutilisés : fonction de la 077 + les photos des points ────────
-- Un point supprimé emporte ses lignes de photos (cascade) mais pas ses
-- fichiers, pour qu'« Annuler » le rende intact : ils sont rattrapés ici.
create or replace function fichiers_orphelins()
returns table (bucket text, chemin text, taille bigint)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.created_at < now() - interval '1 hour'
    and (
      (o.bucket_id = 'cr-photos'
        and not exists (select 1 from public.cr_photos p where p.chemin = o.name or p.chemin_miniature = o.name)
        and not exists (select 1 from public.opr_photos p where p.chemin = o.name or p.chemin_miniature = o.name))
      or
      (o.bucket_id = 'cr-plans' and not exists (
        select 1 from public.affaire_plan_versions v where v.chemin = o.name or v.chemin_apercu = o.name))
      or
      (o.bucket_id = 'cr-archives'
        and not exists (select 1 from public.cr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_archives a where a.chemin = o.name)
        and not exists (select 1 from public.opr_pv v where v.chemin = o.name))
      or
      (o.bucket_id = 'affaires-photos' and not exists (
        select 1 from public.affaires a
        where split_part(split_part(a.photo_url, '/affaires-photos/', 2), '?', 1) = o.name))
      or
      (o.bucket_id = 'edl'
        and not exists (
          select 1 from public.edl_niveaux n
          where n.chemin = o.name or n.chemin_apercu = o.name or n.chemin_source = o.name)
        and not exists (
          select 1 from public.edl_photos p
          where p.chemin = o.name or p.chemin_miniature = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2 : vérifier la syntaxe**

Run: `grep -c "create table if not exists" supabase/migrations/079_edl_visite.sql`
Expected: `4`. Relire que la liste du `foreach` contient bien les quatre tables et que le bloc `fichiers_orphelins()` reprend mot pour mot celui de la 077 avec la seule branche `edl_photos` en plus. (La règle restrictive de stockage n'est pas rejouée : aucun bucket nouveau.)

- [ ] **Step 3 : commit**

```bash
git add supabase/migrations/079_edl_visite.sql
git commit -m "feat: état des lieux — migration 079 (visites, points, journal, photos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

La migration se passe à la main dans le SQL Editor de Supabase (à rappeler à l'utilisateur en fin de lot).

---

### Task 2 : Calques et types d'éléments

**Files:**
- Create: `src/modules/etude/etat-des-lieux/calquesEdl.js`
- Create: `tests/etat-des-lieux-visite.test.js`

**Interfaces:**
- Produces :
  - `CALQUES: Array<{ code, nom: 'EDL-…', libelle, types: Array<{ code, libelle }> }>` (ordre de la spec § 3)
  - `CALQUES_DE_POINT` : les calques qui ont des types (barre d'icônes)
  - `calqueEdl(code) → calque | null`
  - `typeEdl(code) → { code, libelle, calque } | null`
  - `libellePoint({ numero, type }) → 'P7 · WC' | 'P8'`

- [ ] **Step 1 : écrire le test qui échoue**

Create `tests/etat-des-lieux-visite.test.js` :

```js
// État des lieux, lot 2 (visite) : calques, logique de la visite, file
// d'attente. Plans et pièces inventés : aucun plan réel dans le dépôt (public).

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { CALQUES, CALQUES_DE_POINT, calqueEdl, typeEdl, libellePoint } from '../src/modules/etude/etat-des-lieux/calquesEdl.js'

describe('calques de l’état des lieux', () => {
  test('tous préfixés EDL-, codes uniques', () => {
    assert.ok(CALQUES.every((c) => c.nom.startsWith('EDL-')))
    assert.equal(new Set(CALQUES.map((c) => c.code)).size, CALQUES.length)
  })
  test('un code de type ne désigne qu’un seul type, tous calques confondus', () => {
    const codes = CALQUES.flatMap((c) => c.types.map((t) => t.code))
    assert.equal(new Set(codes).size, codes.length)
  })
  test('la barre d’icônes ne propose que les calques qui ont des types', () => {
    assert.deepEqual(CALQUES_DE_POINT.map((c) => c.code), [
      'plomberie', 'electricite', 'chauffage', 'ventilation', 'menuiseries', 'occultations', 'compteurs', 'securite', 'desordres',
    ])
  })
  test('un type retrouve son calque', () => {
    assert.deepEqual(typeEdl('radiateur'), { code: 'radiateur', libelle: 'Radiateur', calque: 'chauffage' })
    assert.equal(typeEdl('inconnu'), null)
    assert.equal(typeEdl(null), null)
    assert.equal(calqueEdl('chauffage').nom, 'EDL-Chauffage')
    assert.equal(calqueEdl('rien'), null)
  })
  test('libellé d’un point : numéro et type, sinon le numéro seul', () => {
    assert.equal(libellePoint({ numero: 7, type: 'wc' }), 'P7 · WC')
    assert.equal(libellePoint({ numero: 8, type: null }), 'P8')
  })
})
```

- [ ] **Step 2 : lancer le test, il échoue**

Run: `node --import ./tests/resolve-src.mjs --test tests/etat-des-lieux-visite.test.js`
Expected: FAIL — `Cannot find module …/calquesEdl.js`.

- [ ] **Step 3 : écrire `calquesEdl.js`**

```js
// ─── Calques de l'état des lieux ─────────────────────────────────────────────
//
// Seule liste des calques et des types d'éléments (conception § 3) : la barre
// d'icônes de la visite, les consignes de Claude (lot 3), l'export DXF et le
// rapport (lot 4) la lisent. Un type de plus = une ligne. Les codes de type
// sont uniques tous calques confondus : un point garde son type seul, le
// calque s'en déduit. Pur, testé (tests/etat-des-lieux-visite.test.js).

const t = (code, libelle) => ({ code, libelle })

export const CALQUES = [
  { code: 'pieces', nom: 'EDL-Pièces', libelle: 'Pièces', types: [] },
  { code: 'finitions', nom: 'EDL-Finitions', libelle: 'Finitions', types: [] },
  {
    code: 'plomberie', nom: 'EDL-Plomberie', libelle: 'Plomberie',
    types: [t('lavabo', 'Lavabo'), t('evier', 'Évier'), t('baignoire', 'Baignoire'), t('douche', 'Douche'), t('wc', 'WC'), t('ballon-eau-chaude', 'Ballon d’eau chaude')],
  },
  {
    code: 'electricite', nom: 'EDL-Électricité', libelle: 'Électricité',
    types: [t('interrupteur', 'Interrupteur'), t('prise', 'Prise de courant'), t('luminaire', 'Luminaire'), t('tableau-electrique', 'Tableau électrique')],
  },
  { code: 'chauffage', nom: 'EDL-Chauffage', libelle: 'Chauffage', types: [t('radiateur', 'Radiateur'), t('chaudiere', 'Chaudière'), t('thermostat', 'Thermostat')] },
  { code: 'ventilation', nom: 'EDL-Ventilation', libelle: 'Ventilation', types: [t('bouche-vmc', 'Bouche de VMC'), t('grille', 'Grille'), t('conduit', 'Conduit')] },
  { code: 'menuiseries', nom: 'EDL-Menuiseries', libelle: 'Menuiseries', types: [t('fenetre', 'Fenêtre'), t('porte', 'Porte'), t('placard', 'Placard')] },
  { code: 'occultations', nom: 'EDL-Occultations', libelle: 'Occultations', types: [t('volet', 'Volet'), t('store', 'Store')] },
  // Les cotes dictées accompagnent un élément : pas de point à elles
  { code: 'cotes', nom: 'EDL-Cotes', libelle: 'Cotes', types: [] },
  {
    code: 'compteurs', nom: 'EDL-Compteurs', libelle: 'Compteurs',
    types: [t('compteur-eau', 'Compteur d’eau'), t('compteur-gaz', 'Compteur de gaz'), t('compteur-electricite', 'Compteur d’électricité')],
  },
  {
    code: 'securite', nom: 'EDL-Sécurité', libelle: 'Sécurité',
    types: [t('detecteur-fumee', 'Détecteur de fumée'), t('eclairage-secours', 'Éclairage de secours'), t('extincteur', 'Extincteur')],
  },
  {
    code: 'desordres', nom: 'EDL-Désordres', libelle: 'Désordres',
    types: [t('fissure', 'Fissure'), t('humidite', 'Humidité'), t('degradation', 'Dégradation'), t('materiau-suspect', 'Matériau suspect (amiante, plomb)')],
  },
  { code: 'photos', nom: 'EDL-Photos', libelle: 'Photos', types: [] },
]

export const CALQUES_DE_POINT = CALQUES.filter((c) => c.types.length > 0)

const PAR_TYPE = new Map(CALQUES.flatMap((c) => c.types.map((ty) => [ty.code, { ...ty, calque: c.code }])))

export const calqueEdl = (code) => CALQUES.find((c) => c.code === code) ?? null

export const typeEdl = (code) => (code ? PAR_TYPE.get(code) ?? null : null)

export function libellePoint(point) {
  const type = typeEdl(point?.type)
  return type ? `P${point.numero} · ${type.libelle}` : `P${point?.numero ?? '?'}`
}
```

- [ ] **Step 4 : lancer le test, il passe**

Run: `node --import ./tests/resolve-src.mjs --test tests/etat-des-lieux-visite.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5 : commit**

```bash
git add src/modules/etude/etat-des-lieux/calquesEdl.js tests/etat-des-lieux-visite.test.js
git commit -m "feat: état des lieux — liste des calques EDL- et des types d'éléments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Moteur d'enregistrement — coupure à la demande, audio rangé par visite, états

**Files:**
- Modify: `src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js` (ajouts en fin de fichier)
- Modify: `src/modules/chantier/comptes-rendus/enregistrement/audioLocal.js:10`, `:79-90`, `:113-127`
- Modify: `src/modules/chantier/comptes-rendus/enregistrement/enregistreur.js:162-174`
- Test: `tests/enregistrement.test.js`

**Interfaces:**
- Consumes : `demarrerEnregistreur(...)` rend aujourd'hui `{ arreter, format, verrouEcran }` ; ses signaux `onEvenement({ t, type, detail })` ont les types `demarrage`, `morceau`, `erreur`, `format-de-secours`, `enregistreur-en-echec`, `piste-muette`, `piste-reprise`, `piste-terminee`, `page-masquee`, `page-visible`, `verrou-ecran-perdu`, `arret`, `fin-du-moteur`.
- Produces (enregistrementLogique.js) :
  - `CHAMPS_VISITE = ['crId', 'edlVisiteId', 'affaireId', 'debutEnregistrement']`
  - `cleVisite(visite: string | object) → object` (une chaîne = identifiant de CR, `{ crId }`)
  - `deLaVisite(ligne, visite) → boolean`
  - `champsVisite(tranche) → object` (les seuls `CHAMPS_VISITE` présents)
  - `etatApresEvenement(etat, type) → etat` avec `etat ∈ 'pret' | 'enregistre' | 'muet' | 'coupe' | 'echec' | 'pause'`
  - `enregistrementActif(etat) → boolean` (vrai seulement pour `'enregistre'`)
  - `etatPourLeCr(etat) → 'pret' | 'enregistre' | 'coupe'` (affichage du robot des CR **inchangé** : sourdine et échec de l'encodeur y restent « enregistre », comme avant)
  - `minuterieActive(etat) → boolean` (la durée avance pendant `enregistre` et `muet`, comme avant pour le robot)
  - `enregistrementsARecuperer(interrompus, courant) → string[]` (jamais l'enregistrement en cours)
  - `messageDemarrage(err) → string`
- Produces (audioLocal.js) : `morceauxEnAttente(visite)` et `enregistrementsInterrompus(visite)` acceptent l'identifiant d'un CR (inchangé) **ou** `{ edlVisiteId }`.
- Produces (enregistreur.js) : l'objet rendu gagne `couper(): Promise<boolean>`.

Décision : on ne coupe qu'à l'entrée et à la sortie des pièces, pas à chaque point. La documentation de Mistral annonce des horodatages par segment (`timestamp_granularities=segment`, non compatible avec `language`) ; leur vérification et le repli éventuel (couper à chaque point) passent au lot 3 (spec § 6, mise à jour en Task 13).

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `tests/enregistrement.test.js`, remplacer l'import :

```js
import {
  choisirFormat, extensionDe, dureeLisible, bilanEssai, regrouperTranches, dureeSourdine,
} from '../src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js'
```

par :

```js
import {
  choisirFormat, extensionDe, dureeLisible, bilanEssai, regrouperTranches, dureeSourdine,
  cleVisite, deLaVisite, champsVisite, etatApresEvenement, enregistrementActif, etatPourLeCr, messageDemarrage,
  minuterieActive, enregistrementsARecuperer,
} from '../src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js'
```

et ajouter en fin de fichier :

```js
describe('visite d’un morceau (compte rendu ou état des lieux)', () => {
  test('une chaîne est l’identifiant d’un compte rendu', () => {
    assert.deepEqual(cleVisite('cr-1'), { crId: 'cr-1' })
    assert.deepEqual(cleVisite({ edlVisiteId: 'v-1' }), { edlVisiteId: 'v-1' })
  })
  test('un morceau appartient à sa visite seulement', () => {
    const duCr = { crId: 'cr-1', affaireId: 'a' }
    const deLEdl = { edlVisiteId: 'v-1', affaireId: 'a' }
    assert.equal(deLaVisite(duCr, 'cr-1'), true)
    assert.equal(deLaVisite(duCr, { edlVisiteId: 'v-1' }), false)
    assert.equal(deLaVisite(deLEdl, { edlVisiteId: 'v-1' }), true)
    assert.equal(deLaVisite(deLEdl, 'cr-1'), false)
  })
  test('une visite sans identifiant ne désigne rien', () => {
    assert.equal(deLaVisite({ crId: 'cr-1' }, {}), false)
    assert.equal(deLaVisite({ crId: 'cr-1' }, { crId: null }), false)
  })
  test('un morceau recollé reprend les champs de visite de sa première tranche', () => {
    assert.deepEqual(
      champsVisite({ rang: 2, index: 0, blob: 'x', edlVisiteId: 'v-1', affaireId: 'a', debutEnregistrement: '2026-11-17T09:00:00.000Z' }),
      { edlVisiteId: 'v-1', affaireId: 'a', debutEnregistrement: '2026-11-17T09:00:00.000Z' },
    )
    assert.deepEqual(champsVisite({ rang: 1, index: 0 }), {})
  })
})

describe('état du moteur d’après ses signaux', () => {
  test('sourdine puis retour du micro', () => {
    assert.equal(etatApresEvenement('enregistre', 'piste-muette'), 'muet')
    assert.equal(etatApresEvenement('muet', 'piste-reprise'), 'enregistre')
  })
  test('micro coupé par le système, encodeur en échec', () => {
    assert.equal(etatApresEvenement('enregistre', 'piste-terminee'), 'coupe')
    assert.equal(etatApresEvenement('muet', 'piste-terminee'), 'coupe')
    assert.equal(etatApresEvenement('enregistre', 'enregistreur-en-echec'), 'echec')
  })
  test('un moteur arrêté volontairement (pause, fin) ne change plus rien', () => {
    assert.equal(etatApresEvenement('pause', 'piste-terminee'), 'pause')
    assert.equal(etatApresEvenement('pret', 'enregistreur-en-echec'), 'pret')
  })
  test('les autres signaux laissent l’état tel quel', () => {
    assert.equal(etatApresEvenement('enregistre', 'morceau'), 'enregistre')
    assert.equal(etatApresEvenement('coupe', 'arret'), 'coupe')
  })
  test('seul « enregistre » compte comme actif', () => {
    assert.equal(enregistrementActif('enregistre'), true)
    for (const e of ['pret', 'muet', 'coupe', 'echec', 'pause']) assert.equal(enregistrementActif(e), false)
  })
  test('le robot des CR garde son affichage d’avant', () => {
    // Avant le moteur commun, sourdine et échec de l'encodeur laissaient le
    // robot sur « enregistre » : rien ne doit changer à l'écran des CR
    assert.equal(etatPourLeCr('muet'), 'enregistre')
    assert.equal(etatPourLeCr('echec'), 'enregistre')
    assert.equal(etatPourLeCr('pause'), 'pret')
    assert.equal(etatPourLeCr('coupe'), 'coupe')
    assert.equal(etatPourLeCr('pret'), 'pret')
    assert.equal(etatPourLeCr('enregistre'), 'enregistre')
  })
  test('la durée avance pendant l’enregistrement et la sourdine, pas à l’arrêt', () => {
    assert.equal(minuterieActive('enregistre'), true)
    assert.equal(minuterieActive('muet'), true)
    for (const e of ['pret', 'pause', 'coupe', 'echec']) assert.equal(minuterieActive(e), false)
  })
  test('la récupération des tranches orphelines ne touche jamais l’enregistrement en cours', () => {
    assert.deepEqual(enregistrementsARecuperer(['e1', 'e2', 'e3'], 'e2'), ['e1', 'e3'])
    assert.deepEqual(enregistrementsARecuperer(['e1'], null), ['e1'])
    assert.deepEqual(enregistrementsARecuperer(undefined, 'e1'), [])
  })
  test('micro refusé : ce qu’il faut faire', () => {
    assert.match(messageDemarrage({ name: 'NotAllowedError' }), /Micro refusé/)
    assert.match(messageDemarrage(new Error('occupé')), /n’a pas pu démarrer : occupé/)
  })
})
```

- [ ] **Step 2 : lancer les tests, ils échouent**

Run: `node --import ./tests/resolve-src.mjs --test tests/enregistrement.test.js`
Expected: FAIL — `cleVisite` (et les autres) « does not provide an export ».

- [ ] **Step 3 : ajouter les fonctions à `enregistrementLogique.js`** (en fin de fichier)

```js
// ─── Une visite enregistrée : compte rendu ou état des lieux ─────────────────
//
// Chaque tranche et chaque morceau rangés sur l'appareil portent les champs
// de leur visite : `crId` (compte rendu) ou `edlVisiteId` (état des lieux),
// l'affaire et le début de l'enregistrement. C'est ce qui permet de recoller
// et d'envoyer l'audio de la bonne visite.
export const CHAMPS_VISITE = ['crId', 'edlVisiteId', 'affaireId', 'debutEnregistrement']

/** Une chaîne désigne un compte rendu (appels d'avant l'état des lieux). */
export function cleVisite(visite) {
  return typeof visite === 'string' ? { crId: visite } : { ...(visite ?? {}) }
}

export function deLaVisite(ligne, visite) {
  const champs = Object.entries(cleVisite(visite))
  return champs.length > 0 && champs.every(([cle, valeur]) => valeur != null && ligne?.[cle] === valeur)
}

export function champsVisite(tranche) {
  return Object.fromEntries(CHAMPS_VISITE.filter((cle) => tranche?.[cle] != null).map((cle) => [cle, tranche[cle]]))
}

// ─── État du moteur ──────────────────────────────────────────────────────────
//
// pret (rien), enregistre, muet (le système a mis le micro en sourdine :
// silence enregistré), coupe (micro rendu par le système : écran verrouillé,
// autre app), echec (l'encodeur n'y arrive plus), pause (voulue). Seuls les
// signaux du moteur font passer de enregistre à muet / coupe / echec : l'écran
// ne devine rien. Une pause ou un arrêt voulus ignorent les derniers signaux
// du moteur qu'ils viennent de fermer.
const ARRETS_VOULUS = new Set(['pret', 'pause'])

export function etatApresEvenement(etat, type) {
  if (ARRETS_VOULUS.has(etat)) return etat
  switch (type) {
    case 'piste-muette': return etat === 'enregistre' ? 'muet' : etat
    case 'piste-reprise': return etat === 'muet' ? 'enregistre' : etat
    case 'piste-terminee': return 'coupe'
    case 'enregistreur-en-echec': return 'echec'
    default: return etat
  }
}

export const enregistrementActif = (etat) => etat === 'enregistre'

// Le robot des CR ne connaît que trois états et garde son affichage d'avant
// le moteur commun : sourdine et échec de l'encodeur n'y changeaient rien
const POUR_LE_CR = { muet: 'enregistre', echec: 'enregistre', pause: 'pret' }
export const etatPourLeCr = (etat) => POUR_LE_CR[etat] ?? etat

// La durée affichée avance tant que le moteur tourne, sourdine comprise
// (comme le robot des CR l'a toujours fait)
export const minuterieActive = (etat) => etat === 'enregistre' || etat === 'muet'

/**
 * Enregistrements à recoller : jamais celui en cours — ses tranches sont
 * encore en train d'arriver, les recoller les effacerait.
 */
export function enregistrementsARecuperer(interrompus, courant) {
  return (interrompus ?? []).filter((id) => id !== courant)
}

export function messageDemarrage(err) {
  return err?.name === 'NotAllowedError'
    ? 'Micro refusé : autorisez-le pour ce site dans les réglages de l’iPad ou du navigateur.'
    : `L’enregistrement n’a pas pu démarrer : ${err?.message ?? err}`
}
```

- [ ] **Step 4 : lancer les tests, ils passent**

Run: `node --import ./tests/resolve-src.mjs --test tests/enregistrement.test.js`
Expected: PASS.

- [ ] **Step 5 : ranger l'audio par visite dans `audioLocal.js`**

Remplacer l'import (ligne 10) :

```js
import { regrouperTranches } from './enregistrementLogique'
```

par :

```js
import { regrouperTranches, deLaVisite, champsVisite } from './enregistrementLogique'
```

Dans `recupererMorceaux`, remplacer :

```js
    // Une visite range aussi le CR, l'affaire et le début de l'enregistrement
    // sur chaque tranche : le morceau recollé doit partir à la transcription
    const { crId, affaireId, debutEnregistrement } = g.tranches[0]
    const morceau = {
      id: crypto.randomUUID(), enregistrementId, rang: g.rang, debut: g.debut,
      duree_s: g.duree_s, type: g.type, taille: blob.size, blob, recupere: true,
      ...(crId ? { crId, affaireId, debutEnregistrement } : {}),
    }
```

par :

```js
    // Une visite (CR ou état des lieux) range aussi son identifiant, l'affaire
    // et le début de l'enregistrement sur chaque tranche : le morceau recollé
    // doit retrouver sa visite
    const morceau = {
      id: crypto.randomUUID(), enregistrementId, rang: g.rang, debut: g.debut,
      duree_s: g.duree_s, type: g.type, taille: blob.size, blob, recupere: true,
      ...champsVisite(g.tranches[0]),
    }
```

Remplacer toute la section :

```js
// ─── Visite : morceaux d'un compte rendu ─────────────────────────────────────

/** Morceaux de ce CR encore à transcrire, dans l'ordre d'enregistrement. */
export async function morceauxEnAttente(crId) {
  const tous = await transaction(MORCEAUX, 'readonly', (m) => m.getAll())
  return (tous ?? [])
    .filter((x) => x.crId === crId)
    .sort((a, b) => (a.debutEnregistrement ?? '').localeCompare(b.debutEnregistrement ?? '') || a.rang - b.rang)
}

/** Enregistrements de ce CR qui ont des tranches orphelines (page fermée en plein enregistrement). */
export async function enregistrementsInterrompus(crId) {
  const tranches = await transaction(TRANCHES, 'readonly', (m) => m.getAll())
  return [...new Set((tranches ?? []).filter((t) => t.crId === crId).map((t) => t.enregistrementId))]
}
```

par :

```js
// ─── Visite : morceaux d'un compte rendu ou d'un état des lieux ──────────────
//
// `visite` : l'identifiant d'un CR (comme avant), ou { edlVisiteId }.

/** Morceaux de cette visite encore à transcrire, dans l'ordre d'enregistrement. */
export async function morceauxEnAttente(visite) {
  const tous = await transaction(MORCEAUX, 'readonly', (m) => m.getAll())
  return (tous ?? [])
    .filter((x) => deLaVisite(x, visite))
    .sort((a, b) => (a.debutEnregistrement ?? '').localeCompare(b.debutEnregistrement ?? '') || a.rang - b.rang)
}

/** Enregistrements de cette visite qui ont des tranches orphelines (page fermée en plein enregistrement). */
export async function enregistrementsInterrompus(visite) {
  const tranches = await transaction(TRANCHES, 'readonly', (m) => m.getAll())
  return [...new Set((tranches ?? []).filter((t) => deLaVisite(t, visite)).map((t) => t.enregistrementId))]
}
```

`transcription.js` appelle toujours `morceauxEnAttente(crId)` avec une chaîne : rien à changer.

- [ ] **Step 6 : ajouter `couper()` à `enregistreur.js`**

Remplacer :

```js
  const arreter = () => fermer('arret')
```

par :

```js
  const arreter = () => fermer('arret')

  // Clôt le morceau en cours et en ouvre aussitôt un autre (entrée et sortie
  // d'une pièce de l'état des lieux) : un morceau ne parle plus que d'un lieu.
  // Rend false s'il n'y avait rien à couper (moteur fermé, arrêt en cours).
  const couper = () => new Promise((resoudre) => {
    if (!actif || finMorceau || enregistreur?.state !== 'recording') { resoudre(false); return }
    finMorceau = () => { relancer(); resoudre(true) }
    enregistreur.stop()
  })
```

et remplacer la dernière ligne de la fonction :

```js
  return { arreter, get format() { return format.type }, get verrouEcran() { return verrouEcran } }
```

par :

```js
  return { arreter, couper, get format() { return format.type }, get verrouEcran() { return verrouEcran } }
```

(Un morceau coupé vide — coupure dans la première seconde — n'est simplement pas rendu : `onstop` exécute la suite de `couper` sans compter d'échec.)

- [ ] **Step 7 : vérifier**

Run: `npm test && npm run build`
Expected: tous les tests passent (dont `transcription.test.js`, `enregistrement.test.js`), build réussi.

- [ ] **Step 8 : commit**

```bash
git add src/modules/chantier/comptes-rendus/enregistrement/enregistrementLogique.js src/modules/chantier/comptes-rendus/enregistrement/audioLocal.js src/modules/chantier/comptes-rendus/enregistrement/enregistreur.js tests/enregistrement.test.js
git commit -m "feat: enregistrement — coupure à la demande, audio rangé par visite, états du moteur

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Hook commun `useEnregistreur`, robot des CR adapté, enregistrement de l'état des lieux

**Files:**
- Create: `src/modules/chantier/comptes-rendus/enregistrement/useEnregistreur.js`
- Modify (réécriture complète) : `src/modules/chantier/comptes-rendus/enregistrement/useEnregistrementVisite.js`
- Create: `src/modules/etude/etat-des-lieux/visite/useEnregistrementEdl.js`

**Interfaces:**
- Consumes : `demarrerEnregistreur`, `enregistrementPossible` (enregistreur.js) ; `rangerTranche`, `rangerMorceau`, `recupererMorceaux`, `morceauxEnAttente`, `enregistrementsInterrompus` (audioLocal.js) ; `DUREE_MORCEAU_MS` (transcriptionLogique.js) ; `etatApresEvenement`, `etatPourLeCr`, `messageDemarrage`, `minuterieActive`, `enregistrementsARecuperer` (Task 3) ; `transcrireEnAttente`, `enregistrementsDisponibles`, `messageTranscription`, `ECHECS_MAX` (transcription.js).
- Produces :
  - `useEnregistreur({ champs, surMorceau(morceau), surEtat(nouveau, ancien) }) → { possible, etat, niveau, erreur, duree_s, demarrer(champsEnPlus?) → Promise<boolean>, pause(), reprendre() → Promise<boolean> (sans effet à l'état 'pret'), arreter(), couper() → Promise<boolean>, enregistrementCourant() → string | null }`
  - `useEnregistrementVisite` : **même interface qu'avant** — `{ disponible, etat: 'pret'|'enregistre'|'coupe', niveau, attente, erreur, version, duree_s, demarrer, arreter, reprendre, transcrire }` ; `useEnregistrementsDisponibles` inchangé.
  - `useEnregistrementEdl({ visiteId, affaireId, surEtat }) → { ...useEnregistreur, demarrer(visiteId) → Promise<boolean>, enAttente: number }`

- [ ] **Step 1 : écrire `useEnregistreur.js`**

```js
// ─── Moteur d'enregistrement d'une visite, côté écran ────────────────────────
//
// Commun au robot des comptes rendus et à la visite de l'état des lieux : un
// enregistrement (identifiant, début) fait de morceaux rangés sur l'appareil
// seconde par seconde, avec pause, reprise et coupure à la demande. Ce qui
// arrive au micro (sourdine, coupure, échec) décide seul de l'état
// (`etatApresEvenement`, testé) : l'écran ne devine rien.
//
// `champs` est recopié sur chaque tranche et chaque morceau : c'est ce qui
// relie l'audio à sa visite ({ crId, affaireId } ou { edlVisiteId, affaireId }).

import { useState, useEffect, useRef, useCallback } from 'react'
import { enregistrementPossible, demarrerEnregistreur } from './enregistreur'
import { rangerMorceau, rangerTranche } from './audioLocal'
import { DUREE_MORCEAU_MS } from './transcriptionLogique'
import { etatApresEvenement, messageDemarrage, minuterieActive } from './enregistrementLogique'

export function useEnregistreur({ champs = {}, surMorceau, surEtat } = {}) {
  const [etat, setEtat] = useState('pret') // pret | enregistre | muet | coupe | echec | pause
  const [debut, setDebut] = useState(null)
  const [maintenant, setMaintenant] = useState(0)
  const [niveau, setNiveau] = useState(0)
  const [erreur, setErreur] = useState(null)
  const etatCourant = useRef('pret')
  const moteur = useRef(null)
  // Le moteur dont les signaux comptent encore : ceux d'un moteur fermé par
  // une pause ou une reprise ne doivent plus changer l'état
  const jeton = useRef(null)
  const enregistrement = useRef(null) // { id, debutIso, dernierRang, champs }
  const rappels = useRef({ champs, surMorceau, surEtat })
  useEffect(() => { rappels.current = { champs, surMorceau, surEtat } })

  const changerEtat = useCallback((nouveau) => {
    const ancien = etatCourant.current
    if (nouveau === ancien) return
    etatCourant.current = nouveau
    setEtat(nouveau)
    rappels.current.surEtat?.(nouveau, ancien)
  }, [])

  useEffect(() => {
    if (!minuterieActive(etat)) return undefined
    const minuterie = setInterval(() => setMaintenant(Date.now()), 500)
    return () => clearInterval(minuterie)
  }, [etat])

  // Fermer l'écran arrête l'enregistrement : le dernier morceau est gardé, et
  // un moteur encore en train de s'ouvrir se referme aussitôt (jeton nul)
  useEffect(() => () => {
    jeton.current = null
    etatCourant.current = 'pret'
    moteur.current?.arreter()
  }, [])

  const lancer = useCallback(async (reprise, enPlus = {}) => {
    // Une reprise sans enregistrement (arrêté entre-temps) ne doit pas en
    // ouvrir un nouveau, privé des champs de sa visite
    if (reprise && !enregistrement.current) return
    if (!reprise) {
      enregistrement.current = {
        id: crypto.randomUUID(), debutIso: new Date().toISOString(), dernierRang: 0,
        champs: { ...rappels.current.champs, ...enPlus },
      }
      setDebut(Date.now())
    }
    const enr = enregistrement.current
    const commun = { ...enr.champs, enregistrementId: enr.id, debutEnregistrement: enr.debutIso }
    const ceMoteur = {}
    jeton.current = ceMoteur
    setMaintenant(Date.now())
    const m = await demarrerEnregistreur({
      dureeMorceauMs: DUREE_MORCEAU_MS,
      rangDepart: enr.dernierRang + 1,
      onNiveau: setNiveau,
      onEvenement: (e) => {
        if (jeton.current !== ceMoteur) return
        changerEtat(etatApresEvenement(etatCourant.current, e.type))
      },
      onTranche: (t) => {
        rangerTranche({ ...t, ...commun, id: `${enr.id}:${t.rang}:${t.index}` }).catch(() => {})
      },
      onMorceau: async (brut) => {
        enr.dernierRang = Math.max(enr.dernierRang, brut.rang)
        const morceau = { ...brut, ...commun, id: crypto.randomUUID() }
        await rangerMorceau(morceau).catch(() => {})
        rappels.current.surMorceau?.(morceau)
      },
    })
    // Arrêté pendant que le micro s'ouvrait : rien ne doit tourner derrière
    if (jeton.current !== ceMoteur) { m.arreter(); return }
    moteur.current = m
    changerEtat('enregistre')
  }, [changerEtat])

  const demarrer = useCallback(async (enPlus) => {
    setErreur(null)
    try {
      await lancer(false, enPlus)
      return true
    } catch (err) {
      setErreur(messageDemarrage(err))
      return false
    }
  }, [lancer])

  // Pause voulue : le micro est rendu ; la reprise ouvre un nouveau moteur
  // dans le même enregistrement (les rangs continuent)
  const pause = useCallback(async () => {
    if (!['enregistre', 'muet'].includes(etatCourant.current)) return
    const m = moteur.current
    moteur.current = null
    jeton.current = null
    changerEtat('pause')
    setNiveau(0)
    await m?.arreter()
  }, [changerEtat])

  const reprendre = useCallback(async () => {
    // Arrêté (« Terminer », écran fermé) : plus rien à reprendre
    if (etatCourant.current === 'pret') return false
    setErreur(null)
    const ancien = moteur.current
    moteur.current = null
    jeton.current = null
    await ancien?.arreter()
    if (etatCourant.current === 'pret') return false
    try {
      await lancer(true)
      return true
    } catch (err) {
      setErreur(messageDemarrage(err))
      return false
    }
  }, [lancer])

  const arreter = useCallback(async () => {
    const m = moteur.current
    moteur.current = null
    jeton.current = null
    changerEtat('pret')
    await m?.arreter()
    enregistrement.current = null
    setNiveau(0)
    setDebut(null)
  }, [changerEtat])

  const couper = useCallback(() => moteur.current?.couper() ?? Promise.resolve(false), [])

  // Lu au moment de recoller des tranches orphelines : jamais celles-ci
  const enregistrementCourant = useCallback(() => enregistrement.current?.id ?? null, [])

  // Après une coupure (écran verrouillé, autre app), repartir seul dès que la
  // page revient : iOS l'accepte sans appui (essai du lot 0). Sinon, bouton.
  // Annulé si l'état change ou si l'écran se ferme pendant l'attente : sinon
  // « Terminer » dans ces 400 ms rouvrait un micro après la fin de la visite.
  useEffect(() => {
    if (etat !== 'coupe') return undefined
    let tente = false
    let annule = false
    const essayer = async () => {
      if (annule || tente || document.visibilityState !== 'visible') return
      tente = true
      await new Promise((r) => setTimeout(r, 400))
      if (annule) return
      await reprendre()
    }
    essayer()
    document.addEventListener('visibilitychange', essayer)
    return () => {
      annule = true
      document.removeEventListener('visibilitychange', essayer)
    }
  }, [etat, reprendre])

  return {
    possible: enregistrementPossible(), etat, niveau, erreur,
    duree_s: debut ? Math.max(0, (maintenant - debut) / 1000) : 0,
    demarrer, pause, reprendre, arreter, couper, enregistrementCourant,
  }
}
```

- [ ] **Step 2 : réécrire `useEnregistrementVisite.js` sur le hook commun**

Contenu complet du fichier :

```js
// ─── Robot de la visite : enregistrer et transcrire ──────────────────────────
//
// Réunit les briques éprouvées à l'essai (lot 0) : moteur par morceaux,
// tranches gardées sur l'appareil, reprise automatique après un écran
// verrouillé ou un changement d'app (désormais dans `useEnregistreur`, commun
// à l'état des lieux). Chaque morceau terminé part à la transcription dès
// qu'il y a du réseau ; sinon il attend, et la file repart au retour du
// réseau ou à la prochaine ouverture du CR.
//
// Les remarques saisies à la main ne passent pas par ici : le robot ne
// bloque rien pendant qu'il enregistre.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { enregistrementPossible } from './enregistreur'
import { recupererMorceaux, morceauxEnAttente, enregistrementsInterrompus } from './audioLocal'
import { transcrireEnAttente, enregistrementsDisponibles, messageTranscription, ECHECS_MAX } from './transcription'
import { useEnregistreur } from './useEnregistreur'
import { etatPourLeCr, enregistrementsARecuperer } from './enregistrementLogique'

export function useEnregistrementVisite({ crId, affaireId, vocabulaire = [], actif = true }) {
  const [disponible, setDisponible] = useState(false)
  const [attente, setAttente] = useState({ enAttente: 0, refuses: 0 })
  const [erreur, setErreur] = useState(null)
  const [version, setVersion] = useState(0)
  // Lu au moment d'envoyer, pas à l'affichage
  const vocabulaireCourant = useRef(vocabulaire)
  useEffect(() => { vocabulaireCourant.current = vocabulaire }, [vocabulaire])

  const recompter = useCallback(async () => {
    const liste = await morceauxEnAttente(crId).catch(() => [])
    setAttente({
      enAttente: liste.filter((m) => (m.echecs ?? 0) < ECHECS_MAX).length,
      refuses: liste.filter((m) => (m.echecs ?? 0) >= ECHECS_MAX).length,
    })
  }, [crId])

  const transcrire = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { await recompter(); return }
    const { transcrits, erreur: err } = await transcrireEnAttente(crId, {
      vocabulaire: vocabulaireCourant.current,
      surProgres: () => { recompter(); setVersion((v) => v + 1) },
    })
    setErreur(err ? messageTranscription(err) : null)
    if (transcrits > 0) setVersion((v) => v + 1)
    await recompter()
  }, [crId, recompter])

  const champs = useMemo(() => ({ crId, affaireId }), [crId, affaireId])
  const moteur = useEnregistreur({ champs, surMorceau: () => { transcrire() } })
  const { demarrer: demarrerMoteur, enregistrementCourant } = moteur
  // Appelé tel quel par un onClick : l'événement ne doit jamais partir comme
  // champs de visite sur les morceaux
  const demarrer = useCallback(() => demarrerMoteur(), [demarrerMoteur])

  // Ouverture : la table existe-t-elle ? Un enregistrement interrompu par
  // une fermeture de la page se recolle, puis la file repart.
  useEffect(() => {
    if (!actif || !crId) return undefined
    let annule = false
    ;(async () => {
      const ok = await enregistrementsDisponibles().catch(() => false)
      if (annule) return
      setDisponible(ok && enregistrementPossible())
      if (!ok) return
      const interrompus = await enregistrementsInterrompus(crId).catch(() => [])
      for (const id of enregistrementsARecuperer(interrompus, enregistrementCourant())) {
        await recupererMorceaux(id).catch(() => {})
      }
      if (!annule) await transcrire()
    })()
    const auRetourDuReseau = () => transcrire()
    window.addEventListener('online', auRetourDuReseau)
    return () => { annule = true; window.removeEventListener('online', auRetourDuReseau) }
  }, [actif, crId, transcrire, enregistrementCourant])

  return {
    disponible, etat: etatPourLeCr(moteur.etat), niveau: moteur.niveau, attente,
    erreur: moteur.erreur ?? erreur, version, duree_s: moteur.duree_s,
    demarrer, arreter: moteur.arreter, reprendre: moteur.reprendre, transcrire,
  }
}

/** La vue « Enregistrements » du bureau : agence seule, migration 057 passée. */
export function useEnregistrementsDisponibles(actif) {
  const [disponible, setDisponible] = useState(false)
  useEffect(() => {
    if (!actif) return undefined
    let annule = false
    enregistrementsDisponibles().then((ok) => { if (!annule) setDisponible(ok) }).catch(() => {})
    return () => { annule = true }
  }, [actif])
  return actif && disponible
}
```

- [ ] **Step 3 : écrire `useEnregistrementEdl.js`**

```js
// ─── Enregistrement de la visite d'un état des lieux ─────────────────────────
//
// Le moteur commun des visites (`useEnregistreur`), ses morceaux marqués
// `edlVisiteId`. Lot 2 : rien n'est transcrit, les morceaux attendent sur
// l'appareil (base `jga-audio`) l'analyse du lot 3 ; on les compte. Une page
// fermée en plein enregistrement : les tranches restées seules se recollent
// à la réouverture de la visite.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEnregistreur } from '../../../chantier/comptes-rendus/enregistrement/useEnregistreur'
import { morceauxEnAttente, enregistrementsInterrompus, recupererMorceaux } from '../../../chantier/comptes-rendus/enregistrement/audioLocal'
import { enregistrementsARecuperer } from '../../../chantier/comptes-rendus/enregistrement/enregistrementLogique'

export function useEnregistrementEdl({ visiteId, affaireId, surEtat }) {
  const [enAttente, setEnAttente] = useState(0)

  const recompter = useCallback(async () => {
    if (!visiteId) return
    const liste = await morceauxEnAttente({ edlVisiteId: visiteId }).catch(() => [])
    setEnAttente(liste.length)
  }, [visiteId])

  const champs = useMemo(() => ({ affaireId }), [affaireId])
  const moteur = useEnregistreur({ champs, surEtat, surMorceau: () => { recompter() } })
  const { enregistrementCourant } = moteur

  // `visiteId` n'est connu qu'une fois l'enregistrement démarré : celui en
  // cours a déjà des tranches sans morceau, il est laissé de côté
  useEffect(() => {
    if (!visiteId) return undefined
    let annule = false
    ;(async () => {
      const interrompus = await enregistrementsInterrompus({ edlVisiteId: visiteId }).catch(() => [])
      for (const id of enregistrementsARecuperer(interrompus, enregistrementCourant())) {
        if (annule) return
        await recupererMorceaux(id).catch(() => {})
      }
      if (!annule) await recompter()
    })()
    return () => { annule = true }
  }, [visiteId, recompter, enregistrementCourant])

  // L'identifiant de la visite est connu au moment du geste « Démarrer » :
  // il part avec le premier morceau, avant même le rendu suivant
  const { demarrer: demarrerMoteur } = moteur
  const demarrer = useCallback((id) => demarrerMoteur({ edlVisiteId: id }), [demarrerMoteur])

  return { ...moteur, demarrer, enAttente }
}
```

- [ ] **Step 4 : vérifier**

Run: `npm test && npm run build && npx eslint src 2>&1 | tail -3`
Expected: tests verts, build réussi, nombre de problèmes ESLint inchangé par rapport à `main` avant la tâche.

Vérification manuelle (Chrome, ordinateur avec micro) : `npm run dev`, ouvrir une affaire → Visites de chantier → un CR brouillon en mode Visite (`?visite=1`), « Enregistrer » → panneau → « Commencer » : point rouge, durée qui avance, jauge qui bouge ; carré → arrêt ; le panneau montre le morceau en attente (ou transcrit si la clé est configurée). Aucun changement visible par rapport à avant.

- [ ] **Step 5 : commit**

```bash
git add src/modules/chantier/comptes-rendus/enregistrement/useEnregistreur.js src/modules/chantier/comptes-rendus/enregistrement/useEnregistrementVisite.js src/modules/etude/etat-des-lieux/visite/useEnregistrementEdl.js
git commit -m "feat: moteur d'enregistrement commun aux CR et à l'état des lieux

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Logique de la visite

**Files:**
- Create: `src/modules/etude/etat-des-lieux/visite/visiteLogique.js`
- Test: `tests/etat-des-lieux-visite.test.js`

**Interfaces:**
- Consumes : `aire`, `pointDansPolygone`, `boite`, `versPixels` (`geometrieEdl.js`) ; `cadrage([x0,y0,x1,y1], { marge, pxMax })` pour les tests.
- Produces :
  - `ZOOM_MAX_VISITE = 60`
  - `PENSE_BETE: Array<{ cle: 'sol'|'murs'|'plafond'|'plinthes'|'hsp', libelle }>`, `penseBete(fiche) → Array<{ cle, libelle, fait }>`
  - `pieceSous(pieces, [x, y]) → piece | null` (la plus petite qui contient le point)
  - `pointProche(points, [x, y], toleranceM) → point | null` (le plus proche dans la tolérance : toucher un point non choisi le choisit sans le capturer, le plan reste défilable)
  - `cadrePiece(piece, niveau) → { x0, y0, x1, y1 }` (fractions 0–1 de l'image)
  - `numeroSuivant(points) → number`, `numeroPourRestauration(point, points) → number`
  - `piecesVisitees(entrees) → Set<pieceId>`, `etatPiece(piece, visitees) → 'visitee'|'non-visitee'`, `COULEURS_PIECE`
  - `visiteEnCours(visites) → visite | null` (la plus récente sans `fin`)
  - `evenementPourEtat(ancien, nouveau) → 'pause'|'reprise'|'coupure'|null`
  - `messageArret(etat) → string`
  - `cheminsPhotoEdl(affaireId, id, extension) → { chemin, chemin_miniature }`
  - `arrondirMetre(v) → number` (millimètre)
  - `designationPiece(piece) → string`

Décision : sur le plan de l'étage, toucher une pièce y entre ; toucher hors de toute pièce pose un point rattaché à l'étage seul (façade, extérieur) — « Annuler » le retire en cas d'erreur.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter en tête de `tests/etat-des-lieux-visite.test.js`, après les imports existants :

```js
import { cadrage } from '../src/modules/etude/etat-des-lieux/geometrieEdl.js'
import {
  ZOOM_MAX_VISITE, penseBete, pieceSous, pointProche, cadrePiece, numeroSuivant, numeroPourRestauration,
  piecesVisitees, etatPiece, visiteEnCours, evenementPourEtat, messageArret, cheminsPhotoEdl,
  arrondirMetre, designationPiece,
} from '../src/modules/etude/etat-des-lieux/visite/visiteLogique.js'

const proche = (a, b, ecart = 1e-9) => assert.ok(Math.abs(a - b) < ecart, `${a} ≠ ${b}`)
```

et en fin de fichier :

```js
describe('visite : pièces et cadrage', () => {
  // Étage inventé de 10 m × 5 m : séjour, placard, cuisine en L
  const c = cadrage([0, 0, 10, 5], { marge: 0, pxMax: 1000 })
  const niveau = { id: 'n1', cadrage: c, largeur: c.largeur, hauteur: c.hauteur }
  const sejour = { id: 'p1', nom: 'Séjour', numero: '01', contour: [[0, 0], [6, 0], [6, 5], [0, 5]] }
  const placard = { id: 'p2', nom: 'Placard', numero: '02', contour: [[6, 0], [7, 0], [7, 1], [6, 1]] }
  const cuisine = { id: 'p3', nom: 'Cuisine', contour: [[7, 0], [10, 0], [10, 5], [8, 5], [8, 2], [7, 2]] }
  const pieces = [sejour, placard, cuisine]

  test('le point touché désigne la pièce qui le contient', () => {
    assert.equal(pieceSous(pieces, [3, 2]).id, 'p1')
    assert.equal(pieceSous(pieces, [6.5, 0.5]).id, 'p2')
    assert.equal(pieceSous(pieces, [9, 4]).id, 'p3')
  })
  test('dans l’angle rentrant de la pièce en L : aucune pièce', () => {
    assert.equal(pieceSous(pieces, [7.5, 4]), null)
  })
  test('une pièce agrandie : son cadre en fractions de l’image (y vers le bas)', () => {
    const cadre = cadrePiece(placard, niveau)
    proche(cadre.x0, 0.6)
    proche(cadre.x1, 0.7)
    proche(cadre.y0, 0.8)
    proche(cadre.y1, 1)
  })
  test('le zoom de la visite va jusqu’à 60 (12 pour les plans de chantier)', () => {
    assert.equal(ZOOM_MAX_VISITE, 60)
  })
  test('toucher près d’un point le désigne ; trop loin, rien', () => {
    const points = [{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 1.3, y: 1 }]
    assert.equal(pointProche(points, [1.25, 1], 0.2).id, 'b')
    assert.equal(pointProche(points, [1.05, 1.05], 0.2).id, 'a')
    assert.equal(pointProche(points, [3, 3], 0.2), null)
    assert.equal(pointProche([], [1, 1], 0.2), null)
  })
  test('désignation : numéro et nom, sinon « Pièce sans nom »', () => {
    assert.equal(designationPiece(sejour), '01 · Séjour')
    assert.equal(designationPiece({ nom: '', numero: null }), 'Pièce sans nom')
  })
})

describe('visite : numéros des points', () => {
  test('le suivant après le plus grand, toutes visites confondues', () => {
    assert.equal(numeroSuivant([]), 1)
    assert.equal(numeroSuivant([{ numero: 3 }, { numero: 7 }]), 8)
  })
  test('un point rendu par « Annuler » garde son numéro s’il est libre', () => {
    assert.equal(numeroPourRestauration({ id: 'a', numero: 7 }, [{ id: 'c', numero: 9 }]), 7)
    assert.equal(numeroPourRestauration({ id: 'a', numero: 7 }, [{ id: 'b', numero: 7 }, { id: 'c', numero: 9 }]), 10)
  })
  test('arrondi au millimètre', () => {
    assert.equal(arrondirMetre(1.23456), 1.235)
  })
})

describe('visite : pièces visitées, visite en cours', () => {
  test('une pièce est visitée dès sa première entrée', () => {
    const visitees = piecesVisitees([{ piece_id: 'p1' }, { piece_id: null }, { piece_id: 'p1' }])
    assert.equal(etatPiece({ id: 'p1' }, visitees), 'visitee')
    assert.equal(etatPiece({ id: 'p2' }, visitees), 'non-visitee')
  })
  test('la visite en cours est la plus récente sans fin', () => {
    const visites = [
      { id: 'v1', debut: '2026-11-10T09:00:00.000Z', fin: '2026-11-10T11:00:00.000Z' },
      { id: 'v2', debut: '2026-11-12T09:00:00.000Z', fin: null },
    ]
    assert.equal(visiteEnCours(visites).id, 'v2')
    assert.equal(visiteEnCours([visites[0]]), null)
    assert.equal(visiteEnCours(undefined), null)
  })
})

describe('visite : pense-bête, journal du micro, messages', () => {
  test('pense-bête coché d’après la fiche de la pièce', () => {
    const r = penseBete({ sol: 'Parquet chêne', hsp: 2.5, murs: '  ' })
    assert.deepEqual(r.map((x) => [x.cle, x.fait]), [['sol', true], ['murs', false], ['plafond', false], ['plinthes', false], ['hsp', true]])
    assert.ok(penseBete(null).every((x) => !x.fait))
    assert.deepEqual(penseBete({}).map((x) => x.libelle), ['Sol', 'Murs', 'Plafond', 'Plinthes', 'HSP'])
  })
  test('ce que le journal note quand l’état du micro change', () => {
    assert.equal(evenementPourEtat('enregistre', 'pause'), 'pause')
    assert.equal(evenementPourEtat('enregistre', 'coupe'), 'coupure')
    assert.equal(evenementPourEtat('enregistre', 'muet'), 'coupure')
    assert.equal(evenementPourEtat('enregistre', 'echec'), 'coupure')
    assert.equal(evenementPourEtat('pause', 'enregistre'), 'reprise')
    assert.equal(evenementPourEtat('coupe', 'enregistre'), 'reprise')
    assert.equal(evenementPourEtat('pret', 'enregistre'), null)
    assert.equal(evenementPourEtat('enregistre', 'pret'), null)
  })
  test('un message pour chaque arrêt', () => {
    assert.equal(messageArret('pause'), 'Enregistrement en pause')
    assert.equal(messageArret('muet'), 'Micro en sourdine : une autre application l’utilise peut-être')
    assert.equal(messageArret('coupe'), 'Micro coupé (écran verrouillé ou autre application)')
    assert.equal(messageArret('echec'), 'L’enregistrement a échoué sur cet appareil')
    assert.equal(messageArret('autre'), 'L’enregistrement est arrêté')
  })
  test('photos rangées par affaire dans le stockage de l’état des lieux', () => {
    assert.deepEqual(cheminsPhotoEdl('aff', 'id1', 'webp'), {
      chemin: 'aff/edl/photos/id1.webp', chemin_miniature: 'aff/edl/photos/id1-mini.webp',
    })
  })
})
```

- [ ] **Step 2 : lancer les tests, ils échouent**

Run: `node --import ./tests/resolve-src.mjs --test tests/etat-des-lieux-visite.test.js`
Expected: FAIL — `Cannot find module …/visite/visiteLogique.js`.

- [ ] **Step 3 : écrire `visiteLogique.js`**

```js
// ─── Visite d'un état des lieux : ce qui se calcule sans navigateur ──────────
//
// Pièce sous le doigt, cadre d'une pièce agrandie, numéros des points, pièces
// visitées, pense-bête, ce que le journal note quand le micro change d'état.
// Pur, testé (tests/etat-des-lieux-visite.test.js).

import { aire, pointDansPolygone, boite, versPixels } from '../geometrieEdl'

// Un placard sur un étage de 60 m doit pouvoir remplir l'écran ; le plan
// (image) s'adoucit à ce zoom, les contours et les points restent nets (SVG)
export const ZOOM_MAX_VISITE = 60

export const PENSE_BETE = [
  { cle: 'sol', libelle: 'Sol' },
  { cle: 'murs', libelle: 'Murs' },
  { cle: 'plafond', libelle: 'Plafond' },
  { cle: 'plinthes', libelle: 'Plinthes' },
  { cle: 'hsp', libelle: 'HSP' },
]

const rempli = (v) => v != null && String(v).trim() !== ''

/** Rubriques de la fiche à dire dans la pièce ; cochées quand l'analyse (lot 3) les a remplies. */
export function penseBete(fiche) {
  return PENSE_BETE.map((r) => ({ ...r, fait: rempli(fiche?.[r.cle]) }))
}

/** La plus petite pièce qui contient le point (mètres), ou null. */
export function pieceSous(pieces, point) {
  const sous = (pieces ?? []).filter((p) => p.contour?.length >= 3 && pointDansPolygone(point, p.contour))
  if (!sous.length) return null
  return sous.reduce((a, b) => (aire(b.contour) < aire(a.contour) ? b : a))
}

/**
 * Le point le plus proche de l'endroit touché, s'il est à moins de
 * `toleranceM` mètres (la zone de 44 px au doigt, convertie par l'écran).
 * Seul le point choisi capture le doigt (pour le glisser) ; les autres se
 * choisissent ainsi, et un doigt posé dessus fait toujours défiler le plan.
 */
export function pointProche(points, [x, y], toleranceM) {
  let meilleur = null
  let distance = toleranceM
  for (const p of points ?? []) {
    const d = Math.hypot(Number(p.x) - x, Number(p.y) - y)
    if (d <= distance) { meilleur = p; distance = d }
  }
  return meilleur
}

/** Cadre d'une pièce dans l'image de son étage, en fractions (0 à 1) : la visionneuse l'agrandit à tout l'écran. */
export function cadrePiece(piece, niveau) {
  const [x0, y0, x1, y1] = boite(piece.contour.map((p) => versPixels(niveau.cadrage, p)))
  return { x0: x0 / niveau.largeur, y0: y0 / niveau.hauteur, x1: x1 / niveau.largeur, y1: y1 / niveau.hauteur }
}

export const designationPiece = (p) => [p?.numero, p?.nom].filter(Boolean).join(' · ') || 'Pièce sans nom'

/** Les points sont numérotés dans l'ordre de l'état des lieux, toutes visites confondues. */
export function numeroSuivant(points) {
  return (points ?? []).reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1
}

/** Un point rendu par « Annuler » garde son numéro, sauf si un autre l'a pris entre-temps. */
export function numeroPourRestauration(point, points) {
  const pris = (points ?? []).some((p) => p.id !== point.id && p.numero === point.numero)
  return pris ? numeroSuivant(points) : point.numero
}

export const arrondirMetre = (v) => Math.round(Number(v) * 1000) / 1000

/** Pièces où l'on est entré au moins une fois, toutes visites confondues. */
export function piecesVisitees(entrees) {
  return new Set((entrees ?? []).map((e) => e.piece_id).filter(Boolean))
}

// Lot 2 : visitée ou non. Le lot 3 ajoute l'attente d'analyse, complète, incomplète.
export const etatPiece = (piece, visitees) => (visitees.has(piece.id) ? 'visitee' : 'non-visitee')

export const COULEURS_PIECE = {
  'non-visitee': { fond: 'rgba(156,149,145,0.16)', trait: '#9C9591' },
  visitee: { fond: 'var(--affaire-accent-clair, rgba(232,96,44,0.10))', trait: 'var(--affaire-accent, #E8602C)' },
}

/** La visite qu'on peut reprendre : la plus récente qui n'a pas été terminée. */
export function visiteEnCours(visites) {
  return [...(visites ?? [])]
    .filter((v) => !v.fin)
    .sort((a, b) => String(b.debut).localeCompare(String(a.debut)))[0] ?? null
}

const ARRETS = ['pause', 'muet', 'coupe', 'echec']

/** Ce que le journal note quand l'état du micro change (le début et la fin sont notés à part). */
export function evenementPourEtat(ancien, nouveau) {
  if (nouveau === 'pause') return 'pause'
  if (ancien === 'enregistre' && ARRETS.includes(nouveau)) return 'coupure'
  if (nouveau === 'enregistre' && ARRETS.includes(ancien)) return 'reprise'
  return null
}

const MESSAGES_ARRET = {
  pause: 'Enregistrement en pause',
  muet: 'Micro en sourdine : une autre application l’utilise peut-être',
  coupe: 'Micro coupé (écran verrouillé ou autre application)',
  echec: 'L’enregistrement a échoué sur cet appareil',
}
export const messageArret = (etat) => MESSAGES_ARRET[etat] ?? 'L’enregistrement est arrêté'

export function cheminsPhotoEdl(affaireId, id, extension) {
  return {
    chemin: `${affaireId}/edl/photos/${id}.${extension}`,
    chemin_miniature: `${affaireId}/edl/photos/${id}-mini.${extension}`,
  }
}
```

- [ ] **Step 4 : lancer les tests, ils passent**

Run: `node --import ./tests/resolve-src.mjs --test tests/etat-des-lieux-visite.test.js`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add src/modules/etude/etat-des-lieux/visite/visiteLogique.js tests/etat-des-lieux-visite.test.js
git commit -m "feat: état des lieux — logique de la visite (pièces, numéros, pense-bête, journal du micro)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : File d'attente de la visite (logique pure)

**Files:**
- Create: `src/modules/etude/etat-des-lieux/visite/fileEdlLogique.js`
- Test: `tests/etat-des-lieux-visite.test.js`

**Interfaces:**
- Consumes : `ESSAIS_MAX`, `estEnEchec`, `aEnvoyer` (`src/modules/chantier/comptes-rendus/horsLigne/fileLogique.js`) ; `numeroPourRestauration` (Task 5).
- Produces :
  - `TYPES_EDL = { visiteCreer: 'visite.creer', visiteTerminer: 'visite.terminer', evenement: 'evenement.ajouter', pointPoser: 'point.poser', pointModifier: 'point.modifier', pointSupprimer: 'point.supprimer', photoAjouter: 'photo.ajouter' }`
  - charges : `visite.creer {visite}`, `visite.terminer {id, fin}`, `evenement.ajouter {evenement}`, `point.poser {point, photos}`, `point.modifier {id, champs}`, `point.supprimer {id}`, `photo.ajouter {photo}`
  - `operationEdl(type, charge, { affaireId, id?, creeLe? }) → { id, affaireId, type, charge, creeLe, essais: 0, erreur: null }`
  - `horodatageSuivant(dernier, maintenant) → number` (strictement croissant)
  - `instantane` : `{ etat, niveaux, pieces, visites, points, photos, entrees }`
  - `appliquerOperationEdl(instantane, op) → instantane` (idempotent), `etatAvecFileEdl(instantane, ops) → instantane`
  - `resumeFileEdl(ops) → { total, enAttente, echecs, premierEchec }`
  - `evenementEdl(type, { visiteId, affaireId, niveauId?, pieceId?, pointId?, detail? }, le?) → ligne edl_evenements`
  - `operationInverse(geste, points) → { type, charge, evenement } | null` ; gestes : `{ type: 'pose', point }`, `{ type: 'suppression', point, photos }`, `{ type: 'modification', id, avant }`
  - réexporte `ESSAIS_MAX`, `estEnEchec`, `aEnvoyer`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter aux imports de `tests/etat-des-lieux-visite.test.js` :

```js
import {
  TYPES_EDL, ESSAIS_MAX, operationEdl, horodatageSuivant, appliquerOperationEdl, etatAvecFileEdl,
  resumeFileEdl, evenementEdl, operationInverse,
} from '../src/modules/etude/etat-des-lieux/visite/fileEdlLogique.js'
```

et en fin de fichier :

```js
describe('file de la visite', () => {
  const AFF = 'aff-1'
  const op = (type, charge, creeLe) => operationEdl(type, charge, { affaireId: AFF, creeLe })
  const vide = () => ({ etat: { id: 'e1' }, niveaux: [], pieces: [], visites: [], points: [], photos: [], entrees: [] })
  const pt = (id, numero, extra = {}) => ({
    id, numero, visite_id: 'v1', affaire_id: AFF, niveau_id: 'n1', piece_id: 'p1', x: 1, y: 2,
    type: null, calque: null, pose_le: '2026-11-17T10:00:00.000Z', ...extra,
  })
  const ph = (id, pointId) => ({ id, point_id: pointId, visite_id: 'v1', affaire_id: AFF, chemin: `${AFF}/edl/photos/${id}.webp`, chemin_miniature: `${AFF}/edl/photos/${id}-mini.webp` })

  test('une opération porte son affaire, son heure, aucun échec', () => {
    const o = op(TYPES_EDL.pointSupprimer, { id: 'x' }, 42)
    assert.equal(o.affaireId, AFF)
    assert.equal(o.creeLe, 42)
    assert.equal(o.essais, 0)
    assert.match(o.id, /^[0-9a-f-]{36}$/)
  })
  test('deux gestes dans la même milliseconde gardent leur ordre', () => {
    assert.equal(horodatageSuivant(100, 100), 101)
    assert.equal(horodatageSuivant(100, 250), 250)
    assert.equal(horodatageSuivant(0, 5), 5)
  })
  test('poser deux fois le même point (envoi rejoué) n’en fait qu’un', () => {
    const o = op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1)
    const e = appliquerOperationEdl(appliquerOperationEdl(vide(), o), o)
    assert.equal(e.points.length, 1)
  })
  test('l’ordre de création est rétabli, même si la file est lue dans le désordre', () => {
    const poser = op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1)
    const supprimer = op(TYPES_EDL.pointSupprimer, { id: 'a' }, 2)
    assert.equal(etatAvecFileEdl(vide(), [supprimer, poser]).points.length, 0)
  })
  test('modifier un point : type et calque, ou position', () => {
    const e = etatAvecFileEdl(vide(), [
      op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1),
      op(TYPES_EDL.pointModifier, { id: 'a', champs: { type: 'radiateur', calque: 'chauffage' } }, 2),
      op(TYPES_EDL.pointModifier, { id: 'a', champs: { x: 3.5 } }, 3),
    ])
    assert.equal(e.points[0].type, 'radiateur')
    assert.equal(e.points[0].calque, 'chauffage')
    assert.equal(e.points[0].x, 3.5)
    assert.equal(e.points[0].y, 2)
  })
  test('supprimer un point emporte ses photos ; le reposer les rend', () => {
    const avec = etatAvecFileEdl(vide(), [
      op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [] }, 1),
      op(TYPES_EDL.photoAjouter, { photo: ph('f1', 'a') }, 2),
      op(TYPES_EDL.photoAjouter, { photo: ph('f2', 'b') }, 3),
    ])
    const sans = appliquerOperationEdl(avec, op(TYPES_EDL.pointSupprimer, { id: 'a' }, 4))
    assert.deepEqual(sans.photos.map((p) => p.id), ['f2'])
    const rendu = appliquerOperationEdl(sans, op(TYPES_EDL.pointPoser, { point: pt('a', 1), photos: [ph('f1', 'a')] }, 5))
    assert.deepEqual(rendu.photos.map((p) => p.id).sort(), ['f1', 'f2'])
  })
  test('le journal : seules les entrées dans une pièce sont gardées sur l’appareil', () => {
    const entree = evenementEdl('entree', { visiteId: 'v1', affaireId: AFF, niveauId: 'n1', pieceId: 'p1' }, '2026-11-17T10:00:00Z')
    const point = evenementEdl('point', { visiteId: 'v1', affaireId: AFF, pointId: 'a' })
    const e = etatAvecFileEdl(vide(), [op(TYPES_EDL.evenement, { evenement: entree }, 1), op(TYPES_EDL.evenement, { evenement: point }, 2)])
    assert.deepEqual(e.entrees.map((x) => x.piece_id), ['p1'])
  })
  test('une ligne de journal : heure ISO, détail vide par défaut', () => {
    const ev = evenementEdl('sortie', { visiteId: 'v1', affaireId: AFF, niveauId: 'n1', pieceId: 'p1' }, '2026-11-17T10:00:00Z')
    assert.equal(ev.le, '2026-11-17T10:00:00.000Z')
    assert.deepEqual(ev.detail, {})
    assert.equal(ev.point_id, null)
    assert.equal(ev.visite_id, 'v1')
  })
  test('visite commencée puis terminée', () => {
    const e = etatAvecFileEdl(vide(), [
      op(TYPES_EDL.visiteCreer, { visite: { id: 'v1', etat_id: 'e1', affaire_id: AFF, debut: '2026-11-17T09:00:00.000Z', fin: null } }, 1),
      op(TYPES_EDL.visiteTerminer, { id: 'v1', fin: '2026-11-17T11:00:00.000Z' }, 2),
    ])
    assert.equal(e.visites[0].fin, '2026-11-17T11:00:00.000Z')
  })
  test('résumé : en attente et refusées', () => {
    const ok = op(TYPES_EDL.pointSupprimer, { id: 'a' }, 1)
    const refusee = { ...op(TYPES_EDL.pointSupprimer, { id: 'b' }, 2), essais: ESSAIS_MAX, erreur: 'refus' }
    const r = resumeFileEdl([ok, refusee])
    assert.equal(r.total, 2)
    assert.equal(r.enAttente, 1)
    assert.equal(r.echecs, 1)
    assert.equal(r.premierEchec.id, refusee.id)
    assert.equal(resumeFileEdl([]).premierEchec, null)
  })
})

describe('annuler un geste de la visite', () => {
  const p7 = { id: 'a', numero: 7, piece_id: 'p1', x: 1, y: 2, type: null, calque: null }
  test('un point posé est retiré', () => {
    assert.deepEqual(operationInverse({ type: 'pose', point: p7 }, [p7]), {
      type: TYPES_EDL.pointSupprimer, charge: { id: 'a' }, evenement: 'point-supprime',
    })
  })
  test('un point supprimé revient avec ses photos et son numéro, s’il est libre', () => {
    const photos = [{ id: 'f1', point_id: 'a' }]
    const inv = operationInverse({ type: 'suppression', point: p7, photos }, [{ id: 'c', numero: 9 }])
    assert.equal(inv.type, TYPES_EDL.pointPoser)
    assert.equal(inv.charge.point.numero, 7)
    assert.deepEqual(inv.charge.photos, photos)
    assert.equal(inv.evenement, 'point')
    const pris = operationInverse({ type: 'suppression', point: p7, photos: [] }, [{ id: 'b', numero: 7 }])
    assert.equal(pris.charge.point.numero, 8)
  })
  test('une modification revient aux valeurs d’avant', () => {
    assert.deepEqual(operationInverse({ type: 'modification', id: 'a', avant: { type: null, calque: null } }, [p7]), {
      type: TYPES_EDL.pointModifier, charge: { id: 'a', champs: { type: null, calque: null } }, evenement: 'point-modifie',
    })
  })
  test('geste inconnu : rien', () => {
    assert.equal(operationInverse({ type: 'autre' }, []), null)
  })
})
```

- [ ] **Step 2 : lancer les tests, ils échouent**

Run: `node --import ./tests/resolve-src.mjs --test tests/etat-des-lieux-visite.test.js`
Expected: FAIL — `Cannot find module …/visite/fileEdlLogique.js`.

- [ ] **Step 3 : écrire `fileEdlLogique.js`**

```js
// ─── File d'attente de la visite d'un état des lieux : logique pure ──────────
//
// Tout geste de la visite passe par une file rangée sur l'appareil, même avec
// du réseau : l'écran montre l'instantané emporté plus la file (`etatAvecFileEdl`),
// l'envoi suit. Mêmes règles que le mode Visite des CR (horsLigne/fileLogique.js) :
//   · l'identifiant de chaque ligne est décidé sur l'appareil : un envoi rejoué
//     écrit la même ligne, et l'application ici est idempotente ;
//   · l'ordre de création est l'ordre d'envoi (`creeLe` strictement croissant,
//     `horodatageSuivant` : deux gestes dans la même milliseconde gardent leur ordre).
// Pur, testé (tests/etat-des-lieux-visite.test.js).

import { ESSAIS_MAX, estEnEchec, aEnvoyer } from '../../../chantier/comptes-rendus/horsLigne/fileLogique'
import { numeroPourRestauration } from './visiteLogique'

export { ESSAIS_MAX, estEnEchec, aEnvoyer }

export const TYPES_EDL = {
  visiteCreer: 'visite.creer',
  visiteTerminer: 'visite.terminer',
  evenement: 'evenement.ajouter',
  pointPoser: 'point.poser',
  pointModifier: 'point.modifier',
  pointSupprimer: 'point.supprimer',
  photoAjouter: 'photo.ajouter',
}

export function operationEdl(type, charge, { affaireId, id = null, creeLe = Date.now() } = {}) {
  return { id: id ?? crypto.randomUUID(), affaireId, type, charge, creeLe, essais: 0, erreur: null }
}

export const horodatageSuivant = (dernier, maintenant) => Math.max(maintenant, (dernier ?? 0) + 1)

export function evenementEdl(type, { visiteId, affaireId, niveauId = null, pieceId = null, pointId = null, detail = {} }, le = new Date()) {
  return {
    id: crypto.randomUUID(), visite_id: visiteId, affaire_id: affaireId, type,
    niveau_id: niveauId, piece_id: pieceId, point_id: pointId,
    le: new Date(le).toISOString(), detail,
  }
}

const remplacer = (liste, ligne) => [...(liste ?? []).filter((x) => x.id !== ligne.id), ligne]

/** Applique une opération à l'instantané { etat, niveaux, pieces, visites, points, photos, entrees }. */
export function appliquerOperationEdl(etat, op) {
  const c = op.charge
  switch (op.type) {
    case TYPES_EDL.visiteCreer:
      return { ...etat, visites: remplacer(etat.visites, c.visite) }
    case TYPES_EDL.visiteTerminer:
      return { ...etat, visites: (etat.visites ?? []).map((v) => (v.id === c.id ? { ...v, fin: c.fin } : v)) }
    case TYPES_EDL.evenement:
      // Sur l'appareil, seules les entrées servent (pièces visitées) ; le
      // reste du journal ne sert qu'à l'analyse, au bureau
      return c.evenement.type === 'entree' ? { ...etat, entrees: remplacer(etat.entrees, c.evenement) } : etat
    case TYPES_EDL.pointPoser:
      return {
        ...etat,
        points: remplacer(etat.points, c.point),
        photos: (c.photos ?? []).reduce(remplacer, etat.photos ?? []),
      }
    case TYPES_EDL.pointModifier:
      return { ...etat, points: (etat.points ?? []).map((p) => (p.id === c.id ? { ...p, ...c.champs } : p)) }
    case TYPES_EDL.pointSupprimer:
      return {
        ...etat,
        points: (etat.points ?? []).filter((p) => p.id !== c.id),
        photos: (etat.photos ?? []).filter((p) => p.point_id !== c.id),
      }
    case TYPES_EDL.photoAjouter:
      return { ...etat, photos: remplacer(etat.photos, c.photo) }
    default:
      return etat
  }
}

/**
 * L'instantané emporté, puis la file par-dessus. Les opérations refusées par
 * la base restent appliquées : un point posé pendant la visite ne disparaît
 * pas de l'écran ; le bandeau dit à part ce qui n'est pas passé.
 */
export function etatAvecFileEdl(instantane, operations) {
  return [...(operations ?? [])].sort((a, b) => a.creeLe - b.creeLe).reduce(appliquerOperationEdl, instantane)
}

export function resumeFileEdl(operations) {
  const ops = operations ?? []
  const echecs = ops.filter(estEnEchec)
  return { total: ops.length, enAttente: ops.length - echecs.length, echecs: echecs.length, premierEchec: echecs[0] ?? null }
}

/** L'opération qui défait un geste (« Annuler »), et ce que le journal en note. */
export function operationInverse(geste, points) {
  switch (geste?.type) {
    case 'pose':
      return { type: TYPES_EDL.pointSupprimer, charge: { id: geste.point.id }, evenement: 'point-supprime' }
    case 'suppression':
      return {
        type: TYPES_EDL.pointPoser,
        charge: { point: { ...geste.point, numero: numeroPourRestauration(geste.point, points) }, photos: geste.photos ?? [] },
        evenement: 'point',
      }
    case 'modification':
      return { type: TYPES_EDL.pointModifier, charge: { id: geste.id, champs: geste.avant }, evenement: 'point-modifie' }
    default:
      return null
  }
}
```

- [ ] **Step 4 : lancer les tests, ils passent**

Run: `node --import ./tests/resolve-src.mjs --test tests/etat-des-lieux-visite.test.js`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add src/modules/etude/etat-des-lieux/visite/fileEdlLogique.js tests/etat-des-lieux-visite.test.js
git commit -m "feat: état des lieux — file d'attente de la visite (opérations, annulation, journal)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Visionneuse — agrandir une pièce à tout l'écran

**Files:**
- Modify: `src/modules/chantier/comptes-rendus/plansLogique.js` (ajout après `limiterVue`)
- Modify: `src/modules/chantier/comptes-rendus/VisionneusePlan.jsx`
- Test: `tests/plans.test.js`

**Interfaces:**
- Consumes : `zoomAutour(vue, facteur, px, py, zoomMin = 1, zoomMax = 12)`, `limiterVue` (plansLogique.js).
- Produces :
  - `vueSurCadre(cadre: {x0,y0,x1,y1} (fractions), ecran: { largeur, hauteur }, plan: { bw, bh, ox, oy }, { marge = 0.08, zoomMax = 12 }) → { zoom, dx, dy }`
  - `cleDeCadre(cadre, taille) → string | null` : ce qui déclenche l'ajustement de la vue — `null` tant que le conteneur n'est pas mesuré, `'plan'` sans cadre (indépendant de la taille : les autres visionneuses ne sont jamais recadrées par un redimensionnement), et, avec un cadre, ses coordonnées **plus la taille du conteneur**.

Décision (I1) : quand une pièce s'ouvre, des barres apparaissent au-dessus du plan dans le même rendu que le nouveau cadre ; la vue serait calculée sur l'ancienne taille. Deux protections : la clé d'ajustement contient la taille du conteneur (nouvel ajustement dès que le `ResizeObserver` la donne), et l'écran de visite garde ses barres montées à hauteur fixe pendant toute la visite (Task 12), pour qu'un pincement ne soit pas défait par un panneau qui change de hauteur.
  - `VisionneusePlan` : nouvelles props `cadre = null` (la vue s'y ajuste à chaque changement ; `null` → plan entier) et `zoomMax = 12` (pincement, molette, boutons) ; « Ajuster à l'écran » revient au cadre s'il y en a un. Sans ces props, comportement inchangé (CR, OPR, module Plans, éditeur de pièces).

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `tests/plans.test.js`, ajouter `vueSurCadre` à l'import de `plansLogique.js` :

```js
import {
  dimensionsPlan, indiceSuivant, versionCourante, versionsInutilisees,
  cadrageExtrait, pointSurPlan, zoomAutour, limiterVue, vueSurCadre, cleDeCadre,
} from '../src/modules/chantier/comptes-rendus/plansLogique.js'
```

et en fin de fichier :

```js
describe('vueSurCadre (pièce agrandie de l’état des lieux)', () => {
  const ecran = { largeur: 1000, hauteur: 600 }
  const plan = { bw: 1000, bh: 500, ox: 0, oy: 50 }
  const surEcran = (vue, fx, fy) => [plan.ox + vue.dx + fx * plan.bw * vue.zoom, plan.oy + vue.dy + fy * plan.bh * vue.zoom]

  test('le cadre est centré et remplit l’écran, marge comprise', () => {
    const vue = vueSurCadre({ x0: 0.4, y0: 0.4, x1: 0.5, y1: 0.6 }, ecran, plan, { marge: 0.08, zoomMax: 60 })
    assert.ok(Math.abs(vue.zoom - 5.04) < 1e-9)
    const [x, y] = surEcran(vue, 0.45, 0.5)
    assert.ok(Math.abs(x - 500) < 1e-6)
    assert.ok(Math.abs(y - 300) < 1e-6)
  })
  test('un tout petit cadre s’arrête au zoom maximal', () => {
    const vue = vueSurCadre({ x0: 0.5, y0: 0.5, x1: 0.501, y1: 0.501 }, ecran, plan, { zoomMax: 60 })
    assert.equal(vue.zoom, 60)
  })
  test('le plan entier ne descend pas sous le zoom 1', () => {
    assert.equal(vueSurCadre({ x0: 0, y0: 0, x1: 1, y1: 1 }, ecran, plan).zoom, 1)
  })
})

describe('cleDeCadre (quand réajuster la vue)', () => {
  const cadre = { x0: 0.1, y0: 0.2, x1: 0.3, y1: 0.4 }
  test('rien tant que le conteneur n’est pas mesuré', () => {
    assert.equal(cleDeCadre(cadre, { largeur: 0, hauteur: 0 }), null)
    assert.equal(cleDeCadre(null, { largeur: 0, hauteur: 600 }), null)
  })
  test('sans cadre : la même clé quelle que soit la taille (pas de recadrage au redimensionnement)', () => {
    assert.equal(cleDeCadre(null, { largeur: 800, hauteur: 600 }), 'plan')
    assert.equal(cleDeCadre(null, { largeur: 1000, hauteur: 500 }), 'plan')
  })
  test('avec un cadre : la clé change quand le conteneur change de taille', () => {
    const avant = cleDeCadre(cadre, { largeur: 1000, hauteur: 700 })
    const apres = cleDeCadre(cadre, { largeur: 1000, hauteur: 520 })
    assert.notEqual(avant, apres)
    assert.equal(cleDeCadre(cadre, { largeur: 1000, hauteur: 700 }), avant)
    assert.notEqual(cleDeCadre({ ...cadre, x1: 0.35 }, { largeur: 1000, hauteur: 700 }), avant)
  })
})
```

- [ ] **Step 2 : lancer les tests, ils échouent**

Run: `node --import ./tests/resolve-src.mjs --test tests/plans.test.js`
Expected: FAIL — `vueSurCadre` (et `cleDeCadre`) « does not provide an export ».

- [ ] **Step 3 : écrire `vueSurCadre`** (dans `plansLogique.js`, juste après `limiterVue`)

```js
/**
 * Vue qui montre `cadre` (fractions de l'image, 0 à 1) à tout l'écran,
 * centré, avec une marge : une pièce de l'état des lieux agrandie au toucher.
 * @param ecran { largeur, hauteur } du conteneur
 * @param plan  { bw, bh } taille du plan au zoom 1, { ox, oy } son décalage dans le conteneur
 * @returns transformation { zoom, dx, dy } (même repère que zoomAutour)
 */
export function vueSurCadre(cadre, ecran, plan, { marge = 0.08, zoomMax = 12 } = {}) {
  const largeurCadre = Math.max(1e-6, (cadre.x1 - cadre.x0) * plan.bw)
  const hauteurCadre = Math.max(1e-6, (cadre.y1 - cadre.y0) * plan.bh)
  const zoom = borner(Math.min(
    (ecran.largeur * (1 - 2 * marge)) / largeurCadre,
    (ecran.hauteur * (1 - 2 * marge)) / hauteurCadre,
  ), 1, zoomMax)
  const cx = ((cadre.x0 + cadre.x1) / 2) * plan.bw
  const cy = ((cadre.y0 + cadre.y1) / 2) * plan.bh
  return { zoom, dx: ecran.largeur / 2 - plan.ox - cx * zoom, dy: ecran.hauteur / 2 - plan.oy - cy * zoom }
}

/**
 * Ce qui déclenche l'ajustement de la vue sur `cadre`. Avec un cadre, la
 * taille du conteneur en fait partie : des barres qui apparaissent au-dessus
 * du plan dans le même rendu que le cadre le rétrécissent juste après, et la
 * vue doit être recalculée sur la bonne taille. Sans cadre, la taille n'y est
 * pas : les autres visionneuses ne sont jamais recadrées par un redimensionnement.
 */
export function cleDeCadre(cadre, taille) {
  if (!(taille?.largeur > 0 && taille?.hauteur > 0)) return null
  if (!cadre) return 'plan'
  return `${cadre.x0},${cadre.y0},${cadre.x1},${cadre.y1}|${taille.largeur}x${taille.hauteur}`
}
```

- [ ] **Step 4 : lancer les tests, ils passent**

Run: `node --import ./tests/resolve-src.mjs --test tests/plans.test.js`
Expected: PASS.

- [ ] **Step 5 : brancher la visionneuse**

Dans `VisionneusePlan.jsx` :

1. Import :

```js
import { zoomAutour, limiterVue, pointSurPlan, vueSurCadre, cleDeCadre } from './plansLogique'
```

2. En-tête du commentaire, ajouter à la fin du bloc :

```js
// `cadre` (fractions de l'image) : la vue s'y ajuste à chaque changement —
// une pièce de l'état des lieux remplit l'écran ; le pincement reste libre
// jusqu'à `zoomMax`.
```

3. Signature :

```js
export function VisionneusePlan({ version, obtenirLiens, pastilles = [], idActive, onToucher, onPastille, calque, cadre = null, zoomMax = 12 }) {
```

4. Sous `const [vue, setVue] = useState({ zoom: 1, dx: 0, dy: 0 })`, ajouter :

```js
  const [cadreVu, setCadreVu] = useState(null)
```

5. Juste après `const oy = (taille.hauteur - bh) / 2`, ajouter (ajustement pendant le rendu, pas dans un effet) :

```js
  const vueDuCadre = () => (cadre ? vueSurCadre(cadre, taille, { bw, bh, ox, oy }, { zoomMax }) : { zoom: 1, dx: 0, dy: 0 })
  // Nouveau cadre (pièce ouverte, refermée), ou conteneur redimensionné alors
  // qu'un cadre est posé : la vue s'y ajuste (cleDeCadre, testé). Le pincement
  // qui suit reste libre.
  const cleCadre = echelle > 0 ? cleDeCadre(cadre, taille) : null
  if (cleCadre !== cadreVu) {
    setCadreVu(cleCadre)
    if (cleCadre !== null) setVue(vueDuCadre())
  }
```

6. `zoomer` :

```js
  const zoomer = (facteur, px = taille.largeur / 2, py = taille.hauteur / 2) => {
    setVue(v => limiterVue(zoomAutour(v, facteur, px - ox, py - oy, 1, zoomMax), bw, bh))
  }
```

7. Dans `deplacement`, le pincement :

```js
        const zoomee = zoomAutour(v, distance / precedent.distance, milieu.x - ox, milieu.y - oy, 1, zoomMax)
```

8. Bouton « Ajuster à l'écran » :

```jsx
        <button type="button" aria-label="Ajuster à l’écran" onClick={() => setVue(vueDuCadre())} style={bouton}><Maximize size={16} /></button>
```

- [ ] **Step 6 : vérifier**

Run: `npm test && npm run build`
Expected: vert. Vérification manuelle : le plan d'un CR (mode Visite → Plans) et l'éditeur de pièces de l'état des lieux zooment, pincent et s'ajustent comme avant.

- [ ] **Step 7 : commit**

```bash
git add src/modules/chantier/comptes-rendus/plansLogique.js src/modules/chantier/comptes-rendus/VisionneusePlan.jsx tests/plans.test.js
git commit -m "feat: visionneuse de plan — cadrer une zone à tout l'écran, zoom maximal réglable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Mémoire de l'appareil, envoi et synchro de la visite

**Files:**
- Create: `src/modules/etude/etat-des-lieux/visite/baseEdl.js`
- Create: `src/modules/etude/etat-des-lieux/visite/envoiEdl.js`
- Create: `src/modules/etude/etat-des-lieux/visite/synchroEdl.js`
- Create: `src/modules/etude/etat-des-lieux/visite/visiteDonnees.js`
- Create: `src/modules/etude/etat-des-lieux/visite/photosEdl.js`
- Modify: `src/modules/chantier/comptes-rendus/horsLigne/useFileGlobale.js:2-3`, `:41-44`

**Interfaces:**
- Consumes : `supabase` (`src/core/supabase/client.js`) ; `BUCKET_EDL`, `edlIndisponible` (`edlDonnees.js`) ; `erreurReseau` (`horsLigne/envoi.js`) ; `compresserPhoto(source) → { photo: { blob, largeur, hauteur }, miniature: { blob, … }, extension }` (`compressionPhoto.js`) ; `TYPES_EDL`, `aEnvoyer`, `ESSAIS_MAX`, `appliquerOperationEdl` (Task 6) ; `cheminsPhotoEdl` (Task 5).
- Produces :
  - `baseEdl.js` : `MAGASINS_EDL = { instantanes, operations, fichiers }`, `disponible()`, `lire(magasin, cle)`, `ecrire(magasin, valeur)`, `effacer(magasin, cle)`, `tout(magasin)`, `operationsDeLAffaire(affaireId)` (triées par `creeLe`)
  - `envoiEdl.js` : `envoyerOperationEdl(op)` (lève l'erreur ; doublon `23505` = succès)
  - `synchroEdl.js` : `EVENEMENT_FILE_EDL = 'jga-file-edl'`, `signalerFileEdl()`, `sousVerrouEdl(action)`, `envoyerFileEdl(affaireId) → { envoyees, coupure }`, `envoyerToutEdl() → { envoyees }`
  - `visiteDonnees.js` : `lireToutEdl(affaireId) → { indisponible } | { indisponible: false, donnees }`, `preparerVisite(affaireId) → { indisponible, prepareLe? }`, `instantaneGarde(affaireId) → { affaireId, donnees, prepareLe } | null`
  - `photosEdl.js` : `preparerPhoto(affaireId, fichier) → { id, chemin, chemin_miniature, largeur, hauteur, poids_octets }`, `miniatureLocale(id) → url | undefined`

Décisions : tout geste passe par la file, même en ligne (l'envoi part aussitôt) ; après chaque envoi réussi, l'opération est **reportée dans l'instantané** avant d'être retirée de la file, pour qu'elle ne disparaisse jamais de l'écran. Les lectures de préparation prennent l'alias `synchro_id:id` (exclu du cache du service worker, `vite.config.js`) : un instantané ne se fabrique jamais depuis une réponse périmée. La visite exige IndexedDB (pas de repli « en ligne seulement »).

- [ ] **Step 1 : écrire `baseEdl.js`**

```js
// ─── Mémoire de l'appareil pour la visite d'un état des lieux ────────────────
//
// Base à part (`jga-edl`), comme `jga-audio` : celle des CR (`jga-visite`)
// n'a pas à changer de version. Trois magasins :
//   · instantanes — l'état des lieux emporté (un par affaire) ;
//   · operations  — les gestes qui attendent d'être envoyés ;
//   · fichiers    — les photos prises, en attendant leur envoi.
// Les images des étages restent dans la mémoire des visites de CR
// (`horsLigne/images.js`), relues par leur chemin comme au lot 1.

const BASE = 'jga-edl'
const VERSION = 1
export const MAGASINS_EDL = { instantanes: 'instantanes', operations: 'operations', fichiers: 'fichiers' }

let ouverture = null

export function disponible() {
  return typeof indexedDB !== 'undefined'
}

function ouvrir() {
  if (ouverture) return ouverture
  ouverture = new Promise((resolve, reject) => {
    if (!disponible()) { reject(new Error('Ce navigateur ne garde rien sur l’appareil.')); return }
    const demande = indexedDB.open(BASE, VERSION)
    demande.onupgradeneeded = () => {
      const db = demande.result
      if (!db.objectStoreNames.contains(MAGASINS_EDL.instantanes)) db.createObjectStore(MAGASINS_EDL.instantanes, { keyPath: 'affaireId' })
      if (!db.objectStoreNames.contains(MAGASINS_EDL.operations)) {
        db.createObjectStore(MAGASINS_EDL.operations, { keyPath: 'id' }).createIndex('affaireId', 'affaireId')
      }
      if (!db.objectStoreNames.contains(MAGASINS_EDL.fichiers)) db.createObjectStore(MAGASINS_EDL.fichiers, { keyPath: 'id' })
    }
    demande.onsuccess = () => resolve(demande.result)
    demande.onerror = () => reject(demande.error)
    demande.onblocked = () => reject(new Error('Une autre fenêtre de l’application bloque la mise à jour du stockage.'))
  })
  // Un échec ne doit pas condamner les tentatives suivantes
  ouverture.catch(() => { ouverture = null })
  return ouverture
}

function transaction(magasin, mode, action) {
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(magasin, mode)
    const resultat = action(tx.objectStore(magasin))
    tx.oncomplete = () => resolve(resultat?.result ?? resultat)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export const lire = (magasin, cle) => transaction(magasin, 'readonly', (m) => m.get(cle))
export const ecrire = (magasin, valeur) => transaction(magasin, 'readwrite', (m) => m.put(valeur))
export const effacer = (magasin, cle) => transaction(magasin, 'readwrite', (m) => m.delete(cle))

export function tout(magasin) {
  return transaction(magasin, 'readonly', (m) => m.getAll()).then((r) => r ?? [])
}

/** Les gestes d'une affaire, dans leur ordre de création. */
export async function operationsDeLAffaire(affaireId) {
  if (!disponible()) return []
  const ops = await transaction(MAGASINS_EDL.operations, 'readonly', (m) => m.index('affaireId').getAll(affaireId)).then((r) => r ?? [])
  return ops.sort((a, b) => a.creeLe - b.creeLe)
}
```

- [ ] **Step 2 : écrire `envoiEdl.js`**

```js
// ─── Envoi d'un geste de la visite ───────────────────────────────────────────
//
// Chaque opération porte les identifiants décidés sur l'appareil : la rejouer
// écrit la même ligne. Un doublon (23505) est donc un succès — l'envoi
// précédent était passé avant de perdre le réseau. Une suppression qui ne
// trouve rien est aussi un succès (déjà faite). Une modification qui ne touche
// aucune ligne est un refus (droits, ou ligne disparue) : compté par la synchro.

import { supabase } from '../../../../core/supabase/client'
import { BUCKET_EDL } from '../edlDonnees'
import { TYPES_EDL } from './fileEdlLogique'
import { MAGASINS_EDL, lire, effacer } from './baseEdl'

const DOUBLON = '23505'

function verifier(error) {
  if (error && error.code !== DOUBLON) throw error
}

async function modifier(table, id, champs) {
  const { data, error } = await supabase.from(table).update(champs).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('La base n’a rien modifié (ligne absente ou droits insuffisants).')
}

// Une ligne à la fois : un doublon dans un envoi groupé ferait croire que
// toutes les lignes sont passées
async function inserer(table, ligne) {
  verifier((await supabase.from(table).insert(ligne)).error)
}

// Fichiers d'abord (upsert : un envoi rejoué les réécrit), ligne ensuite,
// copie de l'appareil effacée en dernier. Plus de copie sur l'appareil : soit
// l'envoi précédent est allé jusqu'au bout (la ligne existe, succès), soit
// la photo est perdue — refus, comme les CR (horsLigne/envoi.js), jamais une
// ligne sans fichier.
async function envoyerPhoto(photo) {
  const fichier = await lire(MAGASINS_EDL.fichiers, photo.id)
  if (!fichier) {
    const { data, error } = await supabase.from('edl_photos').select('id').eq('id', photo.id).maybeSingle()
    if (error) throw error
    if (data) return
    throw new Error('La photo n’est plus dans la mémoire de l’appareil.')
  }
  const stockage = supabase.storage.from(BUCKET_EDL)
  for (const [chemin, blob] of [[photo.chemin, fichier.photo], [photo.chemin_miniature, fichier.miniature]]) {
    const { error } = await stockage.upload(chemin, blob, { contentType: blob.type, cacheControl: '31536000', upsert: true })
    if (error) throw error
  }
  await inserer('edl_photos', photo)
  await effacer(MAGASINS_EDL.fichiers, photo.id).catch(() => {})
}

export async function envoyerOperationEdl(op) {
  const c = op.charge
  switch (op.type) {
    case TYPES_EDL.visiteCreer:
      await inserer('edl_visites', c.visite)
      return
    case TYPES_EDL.visiteTerminer:
      await modifier('edl_visites', c.id, { fin: c.fin })
      return
    case TYPES_EDL.evenement:
      await inserer('edl_evenements', c.evenement)
      return
    case TYPES_EDL.pointPoser:
      await inserer('edl_points', c.point)
      for (const photo of c.photos ?? []) await inserer('edl_photos', photo)
      return
    case TYPES_EDL.pointModifier:
      await modifier('edl_points', c.id, c.champs)
      return
    case TYPES_EDL.pointSupprimer: {
      // Les fichiers des photos restent : « Annuler » rend le point intact ;
      // « Nettoyer le stockage » les reprend s'il n'est pas rendu (079)
      const { error } = await supabase.from('edl_points').delete().eq('id', c.id)
      if (error) throw error
      return
    }
    case TYPES_EDL.photoAjouter:
      await envoyerPhoto(c.photo)
      return
    default:
      throw new Error(`Opération inconnue : ${op.type}`)
  }
}
```

- [ ] **Step 3 : écrire `synchroEdl.js`**

```js
// ─── Envoi de la file de la visite, depuis toute l'app ───────────────────────
//
// Un seul envoi à la fois (verrou du navigateur, à défaut une chaîne de
// promesses), la file relue sous le verrou : rien ne part deux fois. Après
// chaque envoi réussi, l'opération est reportée dans l'instantané avant
// d'être retirée de la file : l'écran (instantané + file) la garde. La
// préparation de l'instantané passe sous le même verrou : une lecture faite
// pendant un envoi ne peut pas effacer de l'écran ce qui vient de partir.

import { MAGASINS_EDL, lire, ecrire, effacer, tout, operationsDeLAffaire, disponible } from './baseEdl'
import { aEnvoyer, ESSAIS_MAX, appliquerOperationEdl } from './fileEdlLogique'
import { envoyerOperationEdl } from './envoiEdl'
import { erreurReseau } from '../../../chantier/comptes-rendus/horsLigne/envoi'

export const EVENEMENT_FILE_EDL = 'jga-file-edl'

export function signalerFileEdl() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT_FILE_EDL))
}

let chaine = Promise.resolve()
export function sousVerrouEdl(action) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('jga-envoi-edl', action)
  }
  const suite = chaine.then(action, action)
  chaine = suite.catch(() => {})
  return suite
}

async function reporterDansInstantane(affaireId, op) {
  const garde = await lire(MAGASINS_EDL.instantanes, affaireId).catch(() => null)
  if (garde?.donnees) await ecrire(MAGASINS_EDL.instantanes, { ...garde, donnees: appliquerOperationEdl(garde.donnees, op) })
}

/**
 * Envoie la file d'une affaire, dans l'ordre. Une coupure arrête l'envoi sans
 * compter d'échec ; un refus de la base est compté, et l'opération mise de
 * côté après trois tentatives (elle reste appliquée à l'écran).
 */
export function envoyerFileEdl(affaireId) {
  return sousVerrouEdl(async () => {
    let envoyees = 0
    let coupure = false
    const ops = aEnvoyer(await operationsDeLAffaire(affaireId).catch(() => []))
    for (const op of ops) {
      try {
        await envoyerOperationEdl(op)
        await reporterDansInstantane(affaireId, op)
        await effacer(MAGASINS_EDL.operations, op.id)
        envoyees++
      } catch (err) {
        if (erreurReseau(err)) { coupure = true; break }
        const essais = (op.essais ?? 0) + 1
        await ecrire(MAGASINS_EDL.operations, { ...op, essais, erreur: err?.message ?? String(err) })
        if (essais < ESSAIS_MAX) break // la suite dépend peut-être de celle-ci
      }
    }
    if (ops.length > 0) signalerFileEdl()
    return { envoyees, coupure }
  })
}

/** Toutes les affaires qui ont des gestes en attente (moteur de synchro de l'app). */
export async function envoyerToutEdl() {
  if (!disponible()) return { envoyees: 0 }
  const ops = aEnvoyer(await tout(MAGASINS_EDL.operations).catch(() => []))
  let envoyees = 0
  for (const affaireId of [...new Set(ops.map((o) => o.affaireId))]) {
    const r = await envoyerFileEdl(affaireId)
    envoyees += r.envoyees
    if (r.coupure) break
  }
  return { envoyees }
}
```

- [ ] **Step 4 : écrire `visiteDonnees.js`**

```js
// ─── L'état des lieux emporté pour la visite ─────────────────────────────────
//
// Tout ce que la visite affiche, lu d'un coup et gardé sur l'appareil
// (`preparerVisite`) : étages, pièces, visites, points, photos, entrées dans
// les pièces. Étages et pièces en colonnes nommées : ni les textes du plan
// ni la relecture (lourds, inutiles en visite) ; toutes existent depuis la
// 077, la visite ne dépend donc d'aucune colonne plus récente. Lectures fraîches seulement : l'alias `synchro_id` les exclut
// de la mémoire du service worker (vite.config.js), sans quoi un réseau lent
// ferait garder un état ancien. Pagination par identifiant (1 000 lignes par
// page) : un grand bâtiment dépasse vite 1 000 points.

import { supabase } from '../../../../core/supabase/client'
import { edlIndisponible } from '../edlDonnees'
import { MAGASINS_EDL, ecrire, lire, disponible } from './baseEdl'
import { sousVerrouEdl } from './synchroEdl'

const FRAIS = 'synchro_id:id, *'
const COLONNES_ETAT = 'synchro_id:id, id, affaire_id'
const COLONNES_NIVEAUX = 'synchro_id:id, id, etat_id, affaire_id, nom, ordre, chemin, chemin_apercu, largeur, hauteur, cadrage'
const COLONNES_PIECES = 'synchro_id:id, id, niveau_id, affaire_id, nom, numero, contour, surface_lue, hsp_lue, ordre, fiche'
const PAGE = 1000

// L'alias ne doit pas repartir dans une écriture (point rendu par « Annuler »)
const propre = (ligne) => {
  const copie = { ...ligne }
  delete copie.synchro_id
  return copie
}

async function toutes(table, colonnes, filtrer) {
  const lignes = []
  let dernier = null
  for (;;) {
    let requete = filtrer(supabase.from(table).select(colonnes)).order('id').limit(PAGE)
    if (dernier) requete = requete.gt('id', dernier)
    const { data, error } = await requete
    if (error) throw error
    lignes.push(...(data ?? []).map(propre))
    if (!data || data.length < PAGE) return lignes
    dernier = data[data.length - 1].id
  }
}

export async function lireToutEdl(affaireId) {
  const deLAffaire = (q) => q.eq('affaire_id', affaireId)
  let visites
  try {
    visites = await toutes('edl_visites', FRAIS, deLAffaire)
  } catch (err) {
    if (edlIndisponible(err)) return { indisponible: true }
    throw err
  }
  const { data: etat, error } = await supabase.from('edl_etats').select(COLONNES_ETAT).eq('affaire_id', affaireId).maybeSingle()
  if (error) throw error
  const [niveaux, pieces, points, photos, entrees] = await Promise.all([
    toutes('edl_niveaux', COLONNES_NIVEAUX, deLAffaire),
    toutes('edl_pieces', COLONNES_PIECES, deLAffaire),
    toutes('edl_points', FRAIS, deLAffaire),
    toutes('edl_photos', FRAIS, deLAffaire),
    toutes('edl_evenements', 'synchro_id:id, id, visite_id, niveau_id, piece_id, type, le', (q) => deLAffaire(q).eq('type', 'entree')),
  ])
  return {
    indisponible: false,
    donnees: {
      etat: etat ? propre(etat) : null,
      niveaux: niveaux.sort((a, b) => a.ordre - b.ordre),
      pieces: pieces.sort((a, b) => a.ordre - b.ordre),
      visites,
      points: points.sort((a, b) => a.numero - b.numero),
      photos,
      entrees,
    },
  }
}

/** Lit tout et le garde sur l'appareil ; une erreur (réseau) laisse l'ancien instantané en place. */
export function preparerVisite(affaireId) {
  return sousVerrouEdl(async () => {
    const lu = await lireToutEdl(affaireId)
    if (lu.indisponible) return { indisponible: true }
    const prepareLe = Date.now()
    await ecrire(MAGASINS_EDL.instantanes, { affaireId, donnees: lu.donnees, prepareLe })
    return { indisponible: false, prepareLe }
  })
}

export async function instantaneGarde(affaireId) {
  if (!disponible()) return null
  return (await lire(MAGASINS_EDL.instantanes, affaireId).catch(() => null)) ?? null
}
```

- [ ] **Step 5 : écrire `photosEdl.js`**

```js
// ─── Photos des points, sur l'appareil ───────────────────────────────────────
//
// Compressées comme celles des comptes rendus (1 920 px, WebP, miniature),
// rangées dans la base `jga-edl` jusqu'à leur envoi (envoiEdl.js), puis
// effacées de l'appareil. La miniature locale sert tant que la photo n'est
// pas partie.

import { compresserPhoto } from '../../../chantier/comptes-rendus/compressionPhoto'
import { cheminsPhotoEdl } from './visiteLogique'
import { MAGASINS_EDL, ecrire, lire } from './baseEdl'

export async function preparerPhoto(affaireId, fichier) {
  const c = await compresserPhoto(fichier)
  const id = crypto.randomUUID()
  await ecrire(MAGASINS_EDL.fichiers, { id, photo: c.photo.blob, miniature: c.miniature.blob })
  return {
    id, ...cheminsPhotoEdl(affaireId, id, c.extension),
    largeur: c.photo.largeur, hauteur: c.photo.hauteur,
    poids_octets: c.photo.blob.size + c.miniature.blob.size,
  }
}

const urls = new Map() // id → object URL, le temps de la session

export async function miniatureLocale(id) {
  if (urls.has(id)) return urls.get(id)
  const fichier = await lire(MAGASINS_EDL.fichiers, id).catch(() => null)
  if (!fichier?.miniature) return undefined
  const url = URL.createObjectURL(fichier.miniature)
  urls.set(id, url)
  return url
}
```

- [ ] **Step 6 : brancher le moteur de synchro de l'app**

Dans `src/modules/chantier/comptes-rendus/horsLigne/useFileGlobale.js`, ajouter l'import :

```js
import { envoyerToutEdl } from '../../../etude/etat-des-lieux/visite/synchroEdl'
```

et remplacer dans `useMoteurSynchro` :

```js
    const lancer = () => {
      if (navigator.onLine === false) return
      envoyerTout().catch((err) => console.warn('Envoi des modifications :', err))
    }
```

par :

```js
    const lancer = () => {
      if (navigator.onLine === false) return
      envoyerTout().catch((err) => console.warn('Envoi des modifications :', err))
      // Visites d'état des lieux : leur propre file (base jga-edl)
      envoyerToutEdl().catch((err) => console.warn('Envoi de l’état des lieux :', err))
    }
```

- [ ] **Step 7 : vérifier**

Run: `npm test && npm run build`
Expected: vert. (Ces fichiers touchent IndexedDB et Supabase : leur logique de décision est dans `fileEdlLogique.js`, déjà testée ; le parcours complet se vérifie à la main en Task 12.)

- [ ] **Step 8 : commit**

```bash
git add src/modules/etude/etat-des-lieux/visite/baseEdl.js src/modules/etude/etat-des-lieux/visite/envoiEdl.js src/modules/etude/etat-des-lieux/visite/synchroEdl.js src/modules/etude/etat-des-lieux/visite/visiteDonnees.js src/modules/etude/etat-des-lieux/visite/photosEdl.js src/modules/chantier/comptes-rendus/horsLigne/useFileGlobale.js
git commit -m "feat: état des lieux — visite gardée sur l'appareil, file envoyée par le moteur de synchro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Hook `useVisiteEdl`

**Files:**
- Create: `src/modules/etude/etat-des-lieux/visite/useVisiteEdl.js`

**Interfaces:**
- Consumes : Task 5 (`numeroSuivant`), Task 6 (`TYPES_EDL`, `operationEdl`, `etatAvecFileEdl`, `horodatageSuivant`, `evenementEdl`, `operationInverse`, `resumeFileEdl`), Task 8 (`disponible`, `operationsDeLAffaire`, `ecrire`, `effacer`, `MAGASINS_EDL`, `preparerVisite`, `instantaneGarde`, `envoyerFileEdl`, `signalerFileEdl`, `EVENEMENT_FILE_EDL`, `preparerPhoto`).
- Produces : `useVisiteEdl(affaireId) →`
  - état : `{ charge, indisponible, sansMemoire, erreur, disponible, donnees, prepareLe, file, resume }`
  - `recharger()`
  - `commencer(visiteId, ctx)`, `terminer(visiteId, ctx)`
  - `noter(type, ctx, detail?, le?)` — `ctx = { visiteId, niveauId, pieceId, pointId? }`
  - `poserPoint({ visiteId, niveauId, pieceId, x, y }) → point`
  - `modifierPoint(point, champs, ctx)`, `supprimerPoint(point, ctx)`
  - `ajouterPhoto(point, fichier, ctx) → photo`
  - `annuler(geste, ctx)`
  - `rejouer(opId)`, `abandonner(opId)`

- [ ] **Step 1 : écrire le hook**

```js
// ─── Visite d'un état des lieux : données et gestes ──────────────────────────
//
// L'écran montre l'instantané emporté (visiteDonnees.js) plus la file des
// gestes (fileEdlLogique.js) ; chaque geste est rangé dans la file puis
// envoyé aussitôt s'il y a du réseau (synchroEdl.js), sinon par le moteur de
// synchro de l'app. Rien n'est jamais calculé dans un setState(prev => …) :
// numéros et heures sont décidés avant d'écrire.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { disponible as memoireDisponible, operationsDeLAffaire, ecrire, effacer, MAGASINS_EDL } from './baseEdl'
import { preparerVisite, instantaneGarde } from './visiteDonnees'
import { envoyerFileEdl, signalerFileEdl, EVENEMENT_FILE_EDL } from './synchroEdl'
import {
  TYPES_EDL, operationEdl, etatAvecFileEdl, horodatageSuivant, evenementEdl, operationInverse, resumeFileEdl,
} from './fileEdlLogique'
import { numeroSuivant } from './visiteLogique'
import { preparerPhoto } from './photosEdl'

const enLigne = () => typeof navigator === 'undefined' || navigator.onLine !== false
const VIDE = { charge: false, indisponible: false, erreur: null }

export function useVisiteEdl(affaireId) {
  const [garde, setGarde] = useState(null) // { donnees, prepareLe }
  const [file, setFile] = useState([])
  const [statut, setStatut] = useState(VIDE)
  const [affaireVue, setAffaireVue] = useState(affaireId)
  // Changement d'affaire sans démontage : l'état précédent est vidé dès le rendu
  if (affaireVue !== affaireId) {
    setAffaireVue(affaireId)
    setGarde(null)
    setFile([])
    setStatut(VIDE)
  }
  const sansMemoire = !memoireDisponible()
  const dernierCreeLe = useRef(0)
  // Deux touchers rapides ne doivent pas recevoir le même numéro : le dernier
  // donné est retenu ici, par affaire, avant même que l'écran se redessine
  const numeros = useRef({ affaireId: null, dernier: 0 })
  const donneesCourantes = useRef(null)

  const relire = useCallback(async () => {
    const [g, ops] = await Promise.all([instantaneGarde(affaireId), operationsDeLAffaire(affaireId)])
    for (const o of ops) dernierCreeLe.current = Math.max(dernierCreeLe.current, o.creeLe)
    setGarde(g)
    setFile(ops)
  }, [affaireId])

  const recharger = useCallback(async () => {
    if (!memoireDisponible()) return
    let indisponible = false
    let erreur = null
    if (enLigne()) {
      try {
        indisponible = (await preparerVisite(affaireId)).indisponible
      } catch (err) {
        // Réseau qui lâche : on garde ce qui est déjà sur l'appareil
        erreur = err?.message ?? String(err)
      }
    }
    await relire().catch(() => {})
    setStatut({ charge: true, indisponible, erreur })
  }, [affaireId, relire])

  // Chargement initial, asynchrone (pas de setState synchrone dans l'effet)
  useEffect(() => {
    let actif = true
    Promise.resolve().then(() => { if (actif) recharger() })
    return () => { actif = false }
  }, [recharger])

  useEffect(() => {
    const surFile = () => { relire().catch(() => {}) }
    const surReseau = () => { envoyerFileEdl(affaireId).catch(() => {}) }
    window.addEventListener(EVENEMENT_FILE_EDL, surFile)
    window.addEventListener('online', surReseau)
    return () => {
      window.removeEventListener(EVENEMENT_FILE_EDL, surFile)
      window.removeEventListener('online', surReseau)
    }
  }, [affaireId, relire])

  const donnees = useMemo(() => (garde?.donnees ? etatAvecFileEdl(garde.donnees, file) : null), [garde, file])
  useEffect(() => { donneesCourantes.current = donnees })

  const executer = useCallback(async (type, charge) => {
    const creeLe = horodatageSuivant(dernierCreeLe.current, Date.now())
    dernierCreeLe.current = creeLe
    const op = operationEdl(type, charge, { affaireId, creeLe })
    await ecrire(MAGASINS_EDL.operations, op)
    setFile((f) => [...f, op])
    signalerFileEdl()
    if (enLigne()) envoyerFileEdl(affaireId).catch(() => {})
    return op
  }, [affaireId])

  const noter = useCallback((type, ctx, detail = {}, le = new Date()) => executer(TYPES_EDL.evenement, {
    evenement: evenementEdl(type, { ...ctx, affaireId, detail }, le),
  }), [affaireId, executer])

  const prochainNumero = useCallback(() => {
    const dernier = numeros.current.affaireId === affaireId ? numeros.current.dernier : 0
    const n = Math.max(numeroSuivant(donneesCourantes.current?.points), dernier + 1)
    numeros.current = { affaireId, dernier: n }
    return n
  }, [affaireId])

  const commencer = useCallback(async (visiteId, ctx) => {
    await executer(TYPES_EDL.visiteCreer, {
      visite: { id: visiteId, etat_id: donneesCourantes.current?.etat?.id, affaire_id: affaireId, debut: new Date().toISOString(), fin: null },
    })
    await noter('debut', { ...ctx, visiteId })
  }, [affaireId, executer, noter])

  const terminer = useCallback(async (visiteId, ctx) => {
    await noter('fin', { ...ctx, visiteId })
    await executer(TYPES_EDL.visiteTerminer, { id: visiteId, fin: new Date().toISOString() })
  }, [executer, noter])

  const poserPoint = useCallback(async ({ visiteId, niveauId, pieceId, x, y }) => {
    const point = {
      id: crypto.randomUUID(), visite_id: visiteId, affaire_id: affaireId, niveau_id: niveauId, piece_id: pieceId,
      numero: prochainNumero(), x, y, calque: null, type: null, pose_le: new Date().toISOString(),
    }
    await executer(TYPES_EDL.pointPoser, { point, photos: [] })
    await noter('point', { visiteId, niveauId, pieceId, pointId: point.id }, { numero: point.numero, x, y })
    return point
  }, [affaireId, executer, noter, prochainNumero])

  const modifierPoint = useCallback(async (point, champs, ctx) => {
    await executer(TYPES_EDL.pointModifier, { id: point.id, champs })
    await noter('point-modifie', { ...ctx, pieceId: point.piece_id, pointId: point.id }, champs)
  }, [executer, noter])

  const supprimerPoint = useCallback(async (point, ctx) => {
    await executer(TYPES_EDL.pointSupprimer, { id: point.id })
    await noter('point-supprime', { ...ctx, pieceId: point.piece_id, pointId: point.id }, { numero: point.numero })
  }, [executer, noter])

  const ajouterPhoto = useCallback(async (point, fichier, ctx) => {
    const prete = await preparerPhoto(affaireId, fichier)
    const photo = { ...prete, point_id: point.id, visite_id: ctx.visiteId, affaire_id: affaireId, prise_le: new Date().toISOString() }
    await executer(TYPES_EDL.photoAjouter, { photo })
    await noter('photo', { ...ctx, pieceId: point.piece_id, pointId: point.id }, { photoId: photo.id })
    return photo
  }, [affaireId, executer, noter])

  const annuler = useCallback(async (geste, ctx) => {
    const inverse = operationInverse(geste, donneesCourantes.current?.points ?? [])
    if (!inverse) return
    await executer(inverse.type, inverse.charge)
    const pointId = inverse.charge.id ?? inverse.charge.point?.id ?? null
    await noter(inverse.evenement, { ...ctx, pointId }, { annulation: true })
  }, [executer, noter])

  const rejouer = useCallback(async (opId) => {
    const op = file.find((o) => o.id === opId)
    if (!op) return
    await ecrire(MAGASINS_EDL.operations, { ...op, essais: 0, erreur: null })
    signalerFileEdl()
    envoyerFileEdl(affaireId).catch(() => {})
  }, [affaireId, file])

  const abandonner = useCallback(async (opId) => {
    const op = file.find((o) => o.id === opId)
    await effacer(MAGASINS_EDL.operations, opId)
    if (op?.type === TYPES_EDL.photoAjouter) await effacer(MAGASINS_EDL.fichiers, op.charge.photo.id).catch(() => {})
    signalerFileEdl()
  }, [file])

  // Objet stable : un objet neuf à chaque rendu relancerait les effets qui en dépendent
  return useMemo(() => ({
    ...statut, sansMemoire, donnees, prepareLe: garde?.prepareLe ?? null, file, resume: resumeFileEdl(file),
    disponible: statut.charge && !statut.indisponible && !sansMemoire && !!donnees?.etat,
    recharger, commencer, terminer, noter, poserPoint, modifierPoint, supprimerPoint, ajouterPhoto, annuler, rejouer, abandonner,
  }), [statut, sansMemoire, donnees, garde, file, recharger, commencer, terminer, noter, poserPoint, modifierPoint, supprimerPoint, ajouterPhoto, annuler, rejouer, abandonner])
}
```

- [ ] **Step 2 : vérifier**

Run: `npm run build && npx eslint src/modules/etude/etat-des-lieux/visite 2>&1 | tail -5`
Expected: build réussi ; pas d'erreur ESLint nouvelle dans ce dossier (corriger toute dépendance manquante signalée).

- [ ] **Step 3 : commit**

```bash
git add src/modules/etude/etat-des-lieux/visite/useVisiteEdl.js
git commit -m "feat: état des lieux — gestes de la visite par la file (points, photos, journal, annulation)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : Bandeau d'enregistrement, barre des calques, panneau du point

**Files:**
- Create: `src/modules/etude/etat-des-lieux/visite/BandeauEnregistrement.jsx`
- Create: `src/modules/etude/etat-des-lieux/visite/BarreCalques.jsx`
- Create: `src/modules/etude/etat-des-lieux/visite/PanneauPoint.jsx`

**Interfaces:**
- Consumes : `dureeLisible`, `enregistrementActif` (enregistrementLogique.js) ; `messageArret` (Task 5) ; `CALQUES_DE_POINT`, `typeEdl`, `libellePoint` (Task 2) ; `miniatureLocale` (Task 8) ; icônes lucide `Pause`, `Mic`, `AlertTriangle`, `Droplet`, `Zap`, `Flame`, `Wind`, `DoorOpen`, `Blinds`, `Gauge`, `ShieldAlert`, `TriangleAlert`, `Camera`, `Trash2`, `X` (toutes présentes dans `lucide-react` 1.16).
- Produces :
  - `<BandeauEnregistrement etat duree_s niveau enAttente onPause onReprendre />`
  - `<BarreCalques typeChoisi inactif onChoisir(code | null) />`
  - `<PanneauPoint point photos obtenirLiens inactif onType(code|null) onPhoto(fichier) onSupprimer onFermer />` (`point` peut être `null` : barre grisée et consigne) ; hauteur fixe de 170 px, interne au fichier (I1)
  - `ICONES_CALQUES` reste **interne** à `BarreCalques.jsx` (un fichier de composant n'exporte que des composants)

- [ ] **Step 1 : écrire `BandeauEnregistrement.jsx`**

```jsx
import { Pause, Mic, AlertTriangle } from 'lucide-react'
import { dureeLisible, enregistrementActif } from '../../../chantier/comptes-rendus/enregistrement/enregistrementLogique'
import { messageArret } from './visiteLogique'

// ─── Bandeau de l'enregistrement ─────────────────────────────────────────────
//
// Impossible à manquer, à la demande de l'agence : rouge avec le point qui
// bat, la durée et la jauge du micro tant qu'on enregistre ; sinon une bande
// sombre qui dit pourquoi rien n'est enregistré, avec « Reprendre ».

const boutonBandeau = {
  minHeight: 44, padding: '0 14px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.7)', background: 'transparent',
  color: 'white', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap',
}

export function BandeauEnregistrement({ etat, duree_s, niveau, enAttente, onPause, onReprendre }) {
  const attente = enAttente > 0 && (
    <span style={{ fontSize: 12, opacity: 0.85, whiteSpace: 'nowrap' }}>
      {enAttente} morceau{enAttente > 1 ? 'x' : ''} gardé{enAttente > 1 ? 's' : ''} sur la tablette
    </span>
  )
  if (enregistrementActif(etat)) {
    return (
      <div role="status" style={{ background: '#B8412C', color: 'white', padding: '0 16px', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="jga-enregistre" style={{ width: 12, height: 12, borderRadius: '50%', background: 'white', flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>Enregistrement · {dureeLisible(duree_s)}</span>
        <span aria-label="Niveau du micro" style={{ width: 90, height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <span style={{ display: 'block', height: '100%', width: `${Math.round(niveau * 100)}%`, background: 'white', transition: 'width 0.1s linear' }} />
        </span>
        <span style={{ flex: 1 }} />
        {attente}
        <button type="button" onClick={onPause} style={boutonBandeau}><Pause size={16} /> Pause</button>
      </div>
    )
  }
  return (
    <div role="alert" style={{ background: '#3C3834', color: 'white', padding: '0 16px', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12 }}>
      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600 }}>{messageArret(etat)} — rien n’est enregistré</span>
      <span style={{ flex: 1 }} />
      {attente}
      <button type="button" onClick={onReprendre} style={{ ...boutonBandeau, border: 'none', background: '#B8412C' }}><Mic size={16} /> Reprendre</button>
    </div>
  )
}
```

- [ ] **Step 2 : écrire `BarreCalques.jsx`**

```jsx
import { useState } from 'react'
import { Droplet, Zap, Flame, Wind, DoorOpen, Blinds, Gauge, ShieldAlert, TriangleAlert } from 'lucide-react'
import { CALQUES_DE_POINT, typeEdl } from '../calquesEdl'

// ─── Barre d'icônes des calques ──────────────────────────────────────────────
//
// Préciser le type d'un point est facultatif (spec § 2 : « toucher puis
// parler ») : une icône par calque, ses types en puces dessous. Les symboles
// définitifs des plans viennent au lot 4 ; ici des icônes reconnaissables.
// Hauteur fixe (52 + 6 + 44 px) : la rangée des types garde sa place même
// fermée, pour que le plan dessous ne change pas de taille.

const ACCENT = 'var(--affaire-accent, #E8602C)'
const ACCENT_CLAIR = 'var(--affaire-accent-clair, rgba(232,96,44,0.10))'

// Gardé dans ce fichier : un composant ne doit exporter que des composants
// (react-refresh/only-export-components)
const ICONES_CALQUES = {
  plomberie: Droplet, electricite: Zap, chauffage: Flame, ventilation: Wind, menuiseries: DoorOpen,
  occultations: Blinds, compteurs: Gauge, securite: ShieldAlert, desordres: TriangleAlert,
}

const puce = (actif) => ({
  minHeight: 44, padding: '0 14px', borderRadius: 2, flexShrink: 0, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
  border: `0.5px solid ${actif ? ACCENT : 'rgba(0,0,0,0.15)'}`, background: actif ? ACCENT : 'white', color: actif ? 'white' : '#1F1B17',
})

export function BarreCalques({ typeChoisi, inactif, onChoisir }) {
  const choisi = typeEdl(typeChoisi)
  const [ouvert, setOuvert] = useState(null)
  const codeOuvert = ouvert ?? choisi?.calque ?? null
  const calque = CALQUES_DE_POINT.find((c) => c.code === codeOuvert) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: inactif ? 0.45 : 1 }}>
      <div role="toolbar" aria-label="Calques" style={{ height: 52, display: 'flex', gap: 4, overflowX: 'auto' }}>
        {CALQUES_DE_POINT.map((c) => {
          const Icone = ICONES_CALQUES[c.code]
          const actif = c.code === codeOuvert
          return (
            <button
              key={c.code} type="button" disabled={inactif} title={c.libelle} aria-pressed={actif}
              onClick={() => setOuvert(actif ? null : c.code)}
              style={{
                minWidth: 72, minHeight: 52, padding: '4px 6px', borderRadius: 3, flexShrink: 0,
                border: `0.5px solid ${actif ? ACCENT : 'rgba(0,0,0,0.15)'}`, background: actif ? ACCENT_CLAIR : 'white',
                color: actif ? ACCENT : '#5E5854', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, fontSize: 11, cursor: inactif ? 'default' : 'pointer',
              }}
            >
              <Icone size={20} />
              {c.libelle}
            </button>
          )
        })}
      </div>
      <div style={{ height: 44, display: 'flex', gap: 6, overflowX: 'auto' }}>
        {calque && !inactif && calque.types.map((t) => (
          <button key={t.code} type="button" style={puce(t.code === choisi?.code)} onClick={() => onChoisir(t.code)}>{t.libelle}</button>
        ))}
        {calque && !inactif && choisi && <button type="button" style={{ ...puce(false), color: '#5E5854' }} onClick={() => onChoisir(null)}>Sans type</button>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3 : écrire `PanneauPoint.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, X } from 'lucide-react'
import { libellePoint } from '../calquesEdl'
import { miniatureLocale } from './photosEdl'
import { BarreCalques } from './BarreCalques'

// ─── Le point choisi ─────────────────────────────────────────────────────────
//
// Ancré en haut (le clavier de l'iPad couvre le bas) : type facultatif par la
// barre des calques, photo (appareil de la tablette), suppression. Sans point
// choisi, la barre reste visible, grisée, avec la consigne. Hauteur fixe
// (HAUTEUR_PANNEAU_POINT) : le plan dessous ne change jamais de taille pendant
// la visite, une pièce agrandie ou un pincement ne sont pas défaits.

const HAUTEUR_PANNEAU_POINT = 170

const bouton = {
  minHeight: 44, padding: '0 14px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.18)', background: 'white',
  color: '#1F1B17', fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
}

function Miniature({ photo, obtenirLiens }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let actif = true
    // Pas encore partie : la copie de l'appareil ; sinon le lien signé
    miniatureLocale(photo.id)
      .then(async (locale) => locale ?? (await obtenirLiens([photo.chemin_miniature])).get(photo.chemin_miniature))
      .then((u) => { if (actif) setUrl(u ?? null) })
      .catch(() => {})
    return () => { actif = false }
  }, [photo.id, photo.chemin_miniature, obtenirLiens])
  return url
    ? <img src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, border: '0.5px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
    : <span style={{ width: 40, height: 40, borderRadius: 2, background: '#EFEBE4', flexShrink: 0 }} />
}

export function PanneauPoint({ point, photos, obtenirLiens, inactif, onType, onPhoto, onSupprimer, onFermer }) {
  const entree = useRef(null)
  return (
    <div style={{ height: HAUTEUR_PANNEAU_POINT, boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0, background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: point ? 600 : 400, color: point ? '#1F1B17' : '#5E5854', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {point
            ? `${libellePoint(point)}${point.type ? '' : ' · type à préciser ici, ou à dire à voix haute'}`
            : 'Touchez le plan pour poser un point, puis décrivez-le. Le type se précise ici si vous voulez.'}
        </span>
        {point && photos.length > 0 && (
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 220, flexShrink: 1 }}>
            {photos.map((ph) => <Miniature key={ph.id} photo={ph} obtenirLiens={obtenirLiens} />)}
          </div>
        )}
        {point && (
          <>
            <button type="button" style={bouton} disabled={inactif} onClick={() => entree.current?.click()}>
              <Camera size={18} /> Photo{photos.length ? ` (${photos.length})` : ''}
            </button>
            <button type="button" style={{ ...bouton, color: '#B8412C' }} disabled={inactif} onClick={onSupprimer}><Trash2 size={16} /> Supprimer</button>
            <button type="button" style={{ ...bouton, width: 44, padding: 0, justifyContent: 'center' }} aria-label="Laisser ce point" onClick={onFermer}><X size={18} /></button>
          </>
        )}
        <input
          ref={entree} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }}
        />
      </div>
      <BarreCalques key={point?.id ?? 'aucun'} typeChoisi={point?.type ?? null} inactif={inactif || !point} onChoisir={onType} />
    </div>
  )
}
```

- [ ] **Step 4 : vérifier**

Run: `npm run build`
Expected: build réussi (les composants sont montés en Task 12 ; leur rendu se vérifie là).

- [ ] **Step 5 : commit**

```bash
git add src/modules/etude/etat-des-lieux/visite/BandeauEnregistrement.jsx src/modules/etude/etat-des-lieux/visite/BarreCalques.jsx src/modules/etude/etat-des-lieux/visite/PanneauPoint.jsx
git commit -m "feat: état des lieux — bandeau d'enregistrement, barre des calques, panneau du point

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11 : Plan de la visite

**Files:**
- Create: `src/modules/etude/etat-des-lieux/visite/PlanVisite.jsx`

**Interfaces:**
- Consumes : `VisionneusePlan` avec `calque`, `onToucher({x, y})` (fractions), `cadre`, `zoomMax` (Task 7) ; `versPixels`, `versMetres` (geometrieEdl.js) ; `cadrePiece`, `COULEURS_PIECE`, `etatPiece`, `pointProche`, `ZOOM_MAX_VISITE` (Task 5).
- Produces : `<PlanVisite niveau pieces points nbPhotos visitees piece pointId obtenirLiens onToucher([x, y] mètres) onChoisirPoint(id) onDeplacerPoint(id, [x, y] mètres) />` — monté avec `key={niveau.id}` par l'écran (Task 12) : changer d'étage repart d'une visionneuse neuve.
  - `piece` : pièce ouverte (agrandie) ou `null` (plan de l'étage)
  - points touchables : ceux de la pièce ouverte ; sur le plan de l'étage, ceux rattachés à l'étage seul

Décision (gestes) : **seul le point choisi capture le doigt** (pour être glissé). Les autres points ne prennent aucun événement : un doigt posé dessus fait défiler ou pincer le plan comme ailleurs ; un appui bref passe par `onToucher` de la visionneuse, et `pointProche` (44 px à l'écran convertis en mètres) choisit le point au lieu d'en poser un. Un second doigt posé pendant un glisser, ou un `pointercancel`, **annule** le glisser : rien d'enregistré, rien de choisi.

- [ ] **Step 1 : écrire le composant**

```jsx
import { useMemo, useRef, useState } from 'react'
import { VisionneusePlan } from '../../../chantier/comptes-rendus/VisionneusePlan'
import { versPixels, versMetres } from '../geometrieEdl'
import { cadrePiece, COULEURS_PIECE, etatPiece, pointProche, ZOOM_MAX_VISITE } from './visiteLogique'

// ─── Plan de la visite ───────────────────────────────────────────────────────
//
// Plan de l'étage (pièces grises tant qu'elles ne sont pas visitées), ou
// pièce ouverte agrandie à tout l'écran (`cadre`), les autres pâlies. Les
// points sont dessinés en SVG au-dessus de l'image : nets à tout zoom.
// Gestes : un appui bref sur le plan choisit le point le plus proche (zone de
// 44 px) ou en pose un nouveau ; seul le point choisi capture le doigt et se
// glisse. Un second doigt ou un `pointercancel` annulent le glisser (règle du
// projet : rien d'enregistré).

const ACCENT = 'var(--affaire-accent, #E8602C)'
// Zone sensible de 44 px au doigt, rond visible plus petit
const RAYON_TOUCHER = 22
const SEUIL_GLISSE = 6

export function PlanVisite({ niveau, pieces, points, nbPhotos, visitees, piece, pointId, obtenirLiens, onToucher, onChoisirPoint, onDeplacerPoint }) {
  const svg = useRef(null)
  const glisseCourant = useRef(null)
  const pointeurs = useRef(new Set()) // doigts posés sur le plan, glisser compris
  const [glisse, setGlisse] = useState(null) // { id, pos: [x, y] mètres } pendant un déplacement
  const c = niveau.cadrage

  const version = useMemo(() => ({
    id: niveau.id, chemin: niveau.chemin, chemin_apercu: niveau.chemin_apercu, largeur: niveau.largeur, hauteur: niveau.hauteur,
  }), [niveau])
  const cadre = useMemo(() => (piece ? cadrePiece(piece, niveau) : null), [piece, niveau])
  const touchable = (p) => (piece ? p.piece_id === piece.id : !p.piece_id)

  const depuisEvenement = (e) => {
    const r = svg.current.getBoundingClientRect()
    return versMetres(c, [((e.clientX - r.left) / r.width) * niveau.largeur, ((e.clientY - r.top) / r.height) * niveau.hauteur])
  }

  // 44 px à l'écran, en mètres : la largeur affichée du calque (zoom compris)
  // couvre toute l'image, soit largeur / pxParMetre mètres
  const toleranceMetres = () => {
    const largeurEcran = svg.current?.getBoundingClientRect().width
    if (!largeurEcran) return 0
    return (RAYON_TOUCHER * (niveau.largeur / c.pxParMetre)) / largeurEcran
  }

  const toucher = ({ x, y }) => {
    const m = versMetres(c, [x * niveau.largeur, y * niveau.hauteur])
    const proche = pointProche(points.filter(touchable), m, toleranceMetres())
    if (proche) onChoisirPoint(proche.id)
    else onToucher(m)
  }

  const annulerGlisse = () => {
    if (!glisseCourant.current) return
    glisseCourant.current = { ...glisseCourant.current, annule: true }
    setGlisse(null)
  }

  // Phase de capture : voit chaque doigt, même celui que le point a capturé
  const doigtPose = (e) => {
    pointeurs.current.add(e.pointerId)
    if (pointeurs.current.size > 1) annulerGlisse()
  }
  const doigtLeve = (e) => { pointeurs.current.delete(e.pointerId) }

  const debut = (e) => {
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointeur déjà relâché */ }
    glisseCourant.current = { id: pointId, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, bouge: false, pos: null, annule: pointeurs.current.size > 1 }
  }
  const pendant = (e) => {
    const g = glisseCourant.current
    if (!g || g.annule || e.pointerId !== g.pointerId) return
    e.stopPropagation()
    if (!g.bouge && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < SEUIL_GLISSE) return
    const pos = depuisEvenement(e)
    glisseCourant.current = { ...g, bouge: true, pos }
    setGlisse({ id: g.id, pos })
  }
  const fin = (e) => {
    const g = glisseCourant.current
    if (!g || e.pointerId !== g.pointerId) return
    e.stopPropagation()
    glisseCourant.current = null
    setGlisse(null)
    // Pincement commencé, ou geste repris par le navigateur : rien d'enregistré
    if (g.annule || e.type === 'pointercancel' || !g.bouge || !g.pos) return
    onDeplacerPoint(g.id, g.pos)
  }

  const calque = ({ largeur, hauteur, zoom }) => {
    const enCalque = (p) => {
      const [x, y] = versPixels(c, p)
      return [(x / niveau.largeur) * largeur, (y / niveau.hauteur) * hauteur]
    }
    return (
      <svg ref={svg} width={largeur} height={hauteur} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        {pieces.map((p) => {
          const couleurs = COULEURS_PIECE[etatPiece(p, visitees)]
          const ouverte = p.id === piece?.id
          return (
            <polygon
              key={p.id} points={p.contour.map(enCalque).map((q) => q.join(',')).join(' ')}
              style={{
                fill: ouverte ? 'transparent' : couleurs.fond, stroke: ouverte ? ACCENT : couleurs.trait,
                strokeWidth: (ouverte ? 3 : 1.2) / zoom, opacity: piece && !ouverte ? 0.35 : 1,
              }}
            />
          )
        })}
        {points.map((p) => {
          const pos = glisse?.id === p.id ? glisse.pos : [Number(p.x), Number(p.y)]
          const [cx, cy] = enCalque(pos)
          const choisi = p.id === pointId
          const r = (choisi ? 13 : 11) / zoom
          return (
            <g key={p.id} style={{ pointerEvents: 'none', opacity: touchable(p) || !piece ? 1 : 0.35 }}>
              {choisi && (
                // Seule poignée qui capture le doigt
                <circle
                  cx={cx} cy={cy} r={RAYON_TOUCHER / zoom}
                  onPointerDown={debut} onPointerMove={pendant} onPointerUp={fin} onPointerCancel={fin}
                  style={{ fill: 'transparent', pointerEvents: 'auto', touchAction: 'none', cursor: 'move' }}
                />
              )}
              <circle cx={cx} cy={cy} r={r} style={{ fill: p.piece_id ? ACCENT : '#5E5854', stroke: choisi ? '#1F1B17' : 'white', strokeWidth: (choisi ? 3 : 2) / zoom }} />
              <text x={cx} y={cy} dy="0.35em" textAnchor="middle" style={{ fontSize: 10 / zoom, fontWeight: 700, fill: 'white', fontFamily: "'JetBrains Mono', monospace" }}>
                {p.numero}
              </text>
              {(nbPhotos.get(p.id) ?? 0) > 0 && (
                <circle cx={cx + r * 0.9} cy={cy - r * 0.9} r={4 / zoom} style={{ fill: '#1F1B17', stroke: 'white', strokeWidth: 1 / zoom }} />
              )}
            </g>
          )
        })}
      </svg>
    )
  }

  return (
    <div
      onPointerDownCapture={doigtPose} onPointerUpCapture={doigtLeve} onPointerCancelCapture={doigtLeve}
      style={{ width: '100%', height: '100%' }}
    >
      <VisionneusePlan
        version={version} obtenirLiens={obtenirLiens} onToucher={toucher} calque={calque}
        cadre={cadre} zoomMax={ZOOM_MAX_VISITE}
      />
    </div>
  )
}
```

- [ ] **Step 2 : vérifier**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 3 : commit**

```bash
git add src/modules/etude/etat-des-lieux/visite/PlanVisite.jsx
git commit -m "feat: état des lieux — plan de la visite (pièce agrandie, points touchés et déplacés)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12 : Écran de la visite et intégration au module

**Files:**
- Create: `src/modules/etude/etat-des-lieux/visite/VisiteEdl.jsx`
- Modify: `src/modules/etude/etat-des-lieux/index.jsx`

**Interfaces:**
- Consumes : `useVisiteEdl` (Task 9), `useEnregistrementEdl` (Task 4), `PlanVisite` (Task 11), `BandeauEnregistrement`, `PanneauPoint` (Task 10), `enregistrementActif` (Task 3), `pieceSous`, `piecesVisitees`, `visiteEnCours`, `evenementPourEtat`, `penseBete`, `messageArret`, `designationPiece`, `arrondirMetre` (Task 5), `typeEdl` (Task 2), `aire` (geometrieEdl.js), `useLiensSignes(BUCKET_EDL).obtenirLiens` (déjà dans `index.jsx`).
- Produces :
  - `<VisiteEdl affaireId visite obtenirLiens onFermer />` — écran plein (`position: fixed`, z-index 300, rendu sur place comme `ModeVisite` pour hériter de `--affaire-accent`)
  - Module : bouton « Démarrer la visite » / « Reprendre la visite » → `?visite=1` ; la visite reste ouverte au rechargement ; « Remplacer les plans » n'est plus proposé dès qu'une visite existe.

Décisions : pendant la visite, la barre de la pièce (hauteur fixe 56 px : nom, « Sortir », pense-bête — ou, sur l'étage, la consigne) et le panneau du point (hauteur fixe) restent **toujours montés**, et les messages s'affichent par-dessus le plan : la visionneuse ne change pas de taille quand une pièce s'ouvre (I1, avec `cleDeCadre` de la Task 7). `PlanVisite` reçoit `key={niveau.id}` : changer d'étage repart d'une image et d'un zoom neufs. « Terminer la visite » demande confirmation ; « Pause » et « Terminer » restent possibles quand le plan est grisé, rien d'autre (« Reprendre l'enregistrement » en grand). Le sélecteur d'étage est figé tant qu'une pièce est ouverte (« Sortir de la pièce » d'abord). Le témoin du bandeau du haut reste celui des CR : les envois en attente de l'état des lieux s'affichent dans le module et dans la visite.

- [ ] **Step 1 : écrire `VisiteEdl.jsx`**

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Undo2, Mic, ChevronLeft, Square } from 'lucide-react'
import { useEnregistrementEdl } from './useEnregistrementEdl'
import { enregistrementActif } from '../../../chantier/comptes-rendus/enregistrement/enregistrementLogique'
import {
  pieceSous, piecesVisitees, visiteEnCours, evenementPourEtat, penseBete, messageArret, designationPiece, arrondirMetre,
} from './visiteLogique'
import { typeEdl } from '../calquesEdl'
import { aire } from '../geometrieEdl'
import { PlanVisite } from './PlanVisite'
import { BandeauEnregistrement } from './BandeauEnregistrement'
import { PanneauPoint } from './PanneauPoint'

// ─── Visite d'un état des lieux, sur la tablette ─────────────────────────────
//
// Conception § 5. « Démarrer la visite » ouvre le micro (dans le geste :
// Safari n'ouvre l'écoute du niveau que là) et l'enregistrement court jusqu'à
// « Terminer la visite ». Toucher une pièce l'agrandit ; tout point posé lui
// appartient, même sur une cloison ; « Sortir de la pièce » ramène à l'étage.
// Chaque entrée et sortie coupe le morceau audio en cours. Dès que rien n'est
// enregistré (pause, micro coupé, échec), le plan est grisé et les gestes
// bloqués, sauf « Reprendre l'enregistrement ». Chaque geste est noté au
// journal avec l'heure de l'appareil.

const ACCENT = 'var(--affaire-accent, #E8602C)'
const bouton = {
  minHeight: 44, padding: '0 14px', borderRadius: 3, border: '0.5px solid rgba(0,0,0,0.18)', background: 'white',
  color: '#1F1B17', fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
}
const boutonPlein = { ...bouton, border: 'none', background: ACCENT, color: 'white', fontWeight: 600 }
const HISTORIQUE_MAX = 50
const fmtM2 = (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m²`
const heure = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function ConfirmerFin({ onConfirmer, onAnnuler }) {
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') onAnnuler() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onAnnuler])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,0.38)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'calc(80px + env(safe-area-inset-top)) 16px 32px' }}>
      <div role="alertdialog" aria-modal="true" aria-label="Terminer la visite" style={{ background: '#FAF7F2', width: '100%', maxWidth: 440, borderTop: `3px solid ${ACCENT}`, boxShadow: '0 24px 60px -24px rgba(31,27,23,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17' }}>Terminer la visite ?</h2>
          <button type="button" onClick={onAnnuler} aria-label="Fermer" style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </div>
        <p style={{ margin: 0, padding: '16px 20px', fontSize: 13, color: '#5E5854' }}>
          L’enregistrement s’arrête. Points, photos et enregistrement restent sur la tablette jusqu’à leur envoi ; une autre visite pourra compléter celle-ci.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 20px 18px' }}>
          <button type="button" onClick={onAnnuler} style={bouton}>Continuer la visite</button>
          <button type="button" onClick={onConfirmer} style={boutonPlein}><Square size={15} /> Terminer</button>
        </div>
      </div>
    </div>
  )
}

export function VisiteEdl({ affaireId, visite, obtenirLiens, onFermer }) {
  const { donnees, recharger } = visite
  const [visiteId, setVisiteId] = useState(null)
  const [niveauId, setNiveauId] = useState(null)
  const [pieceId, setPieceId] = useState(null)
  const [pointId, setPointId] = useState(null)
  const [historique, setHistorique] = useState([])
  const [message, setMessage] = useState(null)
  const [confirmerFin, setConfirmerFin] = useState(false)
  // « Terminer » en cours : l'écran d'accueil ne doit pas réapparaître entre
  // l'arrêt du micro et la fermeture
  const [fermeture, setFermeture] = useState(false)
  const annulation = useRef(false)
  const contexte = useRef({ visiteId: null, niveauId: null, pieceId: null })

  const niveaux = donnees?.niveaux ?? []
  const niveau = niveaux.find((n) => n.id === niveauId) ?? niveaux[0] ?? null
  const pieces = useMemo(() => (donnees?.pieces ?? []).filter((p) => p.niveau_id === niveau?.id), [donnees?.pieces, niveau?.id])
  const piece = pieces.find((p) => p.id === pieceId) ?? null
  const points = useMemo(() => (donnees?.points ?? []).filter((p) => p.niveau_id === niveau?.id), [donnees?.points, niveau?.id])
  const point = (donnees?.points ?? []).find((p) => p.id === pointId) ?? null
  const photosDuPoint = (donnees?.photos ?? []).filter((ph) => ph.point_id === pointId)
  const nbPhotos = useMemo(() => {
    const n = new Map()
    for (const ph of donnees?.photos ?? []) n.set(ph.point_id, (n.get(ph.point_id) ?? 0) + 1)
    return n
  }, [donnees?.photos])
  const visitees = useMemo(() => piecesVisitees(donnees?.entrees), [donnees?.entrees])
  const ancienne = visiteEnCours(donnees?.visites)

  useEffect(() => { contexte.current = { visiteId, niveauId: niveau?.id ?? null, pieceId: piece?.id ?? null } })

  // Pause, coupure, reprise : notées au journal avec la pièce où l'on est
  const surEtat = useCallback((nouveau, ancien) => {
    const type = evenementPourEtat(ancien, nouveau)
    if (type && contexte.current.visiteId) {
      visite.noter(type, contexte.current, type === 'coupure' ? { cause: nouveau } : {}).catch(() => {})
    }
  }, [visite])
  const rec = useEnregistrementEdl({ visiteId, affaireId, surEtat })
  const enCours = rec.etat !== 'pret'
  const actif = enregistrementActif(rec.etat)

  // Relue à l'ouverture : les pièces ont pu être corrigées au bureau
  useEffect(() => { recharger() }, [recharger])

  // La page derrière ne défile plus tant que la visite est ouverte
  useEffect(() => {
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = avant }
  }, [])

  const echouer = (err) => setMessage(err?.message ?? String(err))
  const noterGeste = (geste) => setHistorique((h) => [...h.slice(-(HISTORIQUE_MAX - 1)), geste])

  const demarrer = async (reprendreCelle) => {
    setMessage(null)
    const id = reprendreCelle?.id ?? crypto.randomUUID()
    navigator.storage?.persist?.().catch(() => {})
    if (!(await rec.demarrer(id))) return
    setVisiteId(id)
    const ctx = { visiteId: id, niveauId: niveau?.id ?? null, pieceId: null }
    try {
      if (reprendreCelle) {
        await visite.noter('reprise', ctx, { apresInterruption: true })
      } else {
        if (ancienne) await visite.terminer(ancienne.id, { ...ctx, visiteId: ancienne.id })
        await visite.commencer(id, ctx)
      }
    } catch (err) { echouer(err) }
  }

  const entrer = async (p) => {
    setPieceId(p.id)
    setPointId(null)
    try {
      await Promise.all([rec.couper(), visite.noter('entree', { visiteId, niveauId: niveau.id, pieceId: p.id })])
    } catch (err) { echouer(err) }
  }

  const sortir = async () => {
    const ctx = { visiteId, niveauId: niveau.id, pieceId }
    setPieceId(null)
    setPointId(null)
    try {
      await Promise.all([rec.couper(), visite.noter('sortie', ctx)])
    } catch (err) { echouer(err) }
  }

  const toucher = async (m) => {
    if (!actif || !visiteId || !niveau) return
    if (!piece) {
      const sous = pieceSous(pieces, m)
      if (sous) { entrer(sous); return }
    }
    try {
      const nouveau = await visite.poserPoint({
        visiteId, niveauId: niveau.id, pieceId: piece?.id ?? null, x: arrondirMetre(m[0]), y: arrondirMetre(m[1]),
      })
      setPointId(nouveau.id)
      noterGeste({ type: 'pose', point: nouveau })
    } catch (err) { echouer(err) }
  }

  const choisirType = async (code) => {
    if (!point) return
    const t = typeEdl(code)
    noterGeste({ type: 'modification', id: point.id, avant: { type: point.type ?? null, calque: point.calque ?? null } })
    try {
      await visite.modifierPoint(point, { type: t?.code ?? null, calque: t?.calque ?? null }, contexte.current)
    } catch (err) { echouer(err) }
  }

  const deplacer = async (id, [x, y]) => {
    const p = (donnees?.points ?? []).find((q) => q.id === id)
    if (!p || !actif) return
    noterGeste({ type: 'modification', id, avant: { x: p.x, y: p.y } })
    try {
      await visite.modifierPoint(p, { x: arrondirMetre(x), y: arrondirMetre(y) }, contexte.current)
    } catch (err) { echouer(err) }
  }

  const supprimer = async () => {
    if (!point) return
    noterGeste({ type: 'suppression', point, photos: photosDuPoint })
    setPointId(null)
    try {
      await visite.supprimerPoint(point, contexte.current)
    } catch (err) { echouer(err) }
  }

  const photographier = async (fichier) => {
    if (!point) return
    try {
      await visite.ajouterPhoto(point, fichier, contexte.current)
    } catch (err) { echouer(err) }
  }

  // Le geste est retiré de l'historique avant d'être défait : un second
  // appui pendant l'écriture défait le geste d'avant, pas le même
  const annuler = async () => {
    if (!historique.length || annulation.current || !actif) return
    const geste = historique[historique.length - 1]
    setHistorique(historique.slice(0, -1))
    annulation.current = true
    try {
      await visite.annuler(geste, contexte.current)
    } catch (err) {
      echouer(err)
    } finally {
      annulation.current = false
    }
  }

  useEffect(() => {
    if (!enCours) return undefined
    const touche = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      annuler()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  const terminer = async () => {
    setConfirmerFin(false)
    setFermeture(true)
    const ctx = contexte.current
    try {
      if (ctx.pieceId) await visite.noter('sortie', ctx)
      await rec.arreter()
      await visite.terminer(visiteId, ctx)
      onFermer()
    } catch (err) {
      setFermeture(false)
      echouer(err)
    }
  }

  const ecran = { position: 'fixed', inset: 0, zIndex: 300, background: '#F5F1E9', display: 'flex', flexDirection: 'column' }
  const bandeSure = <div style={{ height: 'env(safe-area-inset-top)', background: '#1F1B17', flexShrink: 0 }} />
  const alerte = message && (
    <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C', background: '#FDF2F0', borderBottom: '0.5px solid rgba(184,65,44,0.4)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" onClick={() => setMessage(null)} style={{ border: 'none', background: 'none', color: '#B8412C', cursor: 'pointer', fontSize: 13, minHeight: 44 }}>Fermer</button>
    </p>
  )

  if (fermeture) {
    return (
      <div style={ecran}>
        {bandeSure}
        <p style={{ margin: 0, padding: 24, fontSize: 14, color: '#5E5854' }}>Fin de la visite…</p>
      </div>
    )
  }

  // ─── Avant de démarrer ─────────────────────────────────────────────────────
  if (!enCours) {
    let contenu
    if (visite.sansMemoire) contenu = <p style={{ margin: 0 }}>Ce navigateur ne garde rien sur l’appareil (navigation privée ?) : la visite a besoin de sa mémoire pour ne rien perdre sans réseau.</p>
    else if (!visite.charge) contenu = <p style={{ margin: 0 }}>Chargement…</p>
    else if (visite.indisponible) contenu = <p style={{ margin: 0 }}>La visite demande la migration 079 dans Supabase.</p>
    else if (!donnees?.etat || !niveaux.length) contenu = <p style={{ margin: 0 }}>Cet état des lieux n’est pas sur cet appareil : ouvrez-le une fois avec du réseau.</p>
    else if (!rec.possible) contenu = <p style={{ margin: 0 }}>Ce navigateur ne sait pas enregistrer : la visite a besoin du micro.</p>
    else {
      contenu = (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Prévenez les personnes présentes que la visite est enregistrée.</li>
            <li>Ne verrouillez pas l’écran et ne changez pas d’application : le micro se couperait (le plan se grise, il suffit de reprendre).</li>
            <li>Touchez une pièce pour l’agrandir, puis touchez le plan à chaque élément que vous décrivez.</li>
            <li>L’enregistrement reste sur la tablette jusqu’à son analyse.</li>
          </ul>
          {rec.erreur && <p role="alert" style={{ margin: 0, color: '#B8412C' }}>{rec.erreur}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ancienne ? (
              <>
                <button type="button" style={{ ...boutonPlein, minHeight: 52, fontSize: 15 }} onClick={() => demarrer(ancienne)}>
                  <Mic size={18} /> Reprendre la visite du {heure(ancienne.debut)}
                </button>
                <button type="button" style={{ ...bouton, minHeight: 52 }} onClick={() => demarrer(null)}>La terminer et en commencer une nouvelle</button>
              </>
            ) : (
              <button type="button" style={{ ...boutonPlein, minHeight: 52, fontSize: 15 }} onClick={() => demarrer(null)}><Mic size={18} /> Démarrer la visite</button>
            )}
          </div>
        </>
      )
    }
    return (
      <div style={ecran}>
        {bandeSure}
        <header style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 600, color: '#1F1B17' }}>État des lieux · visite</p>
          <button type="button" style={bouton} onClick={onFermer}><X size={16} /> Fermer</button>
        </header>
        {alerte}
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 620, width: '100%', background: 'white', borderTop: `3px solid ${ACCENT}`, padding: 20, fontSize: 14, color: '#5E5854', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {contenu}
          </div>
        </div>
      </div>
    )
  }

  // ─── Pendant la visite ─────────────────────────────────────────────────────
  const refus = visite.resume.premierEchec
  return (
    <div style={ecran}>
      {bandeSure}
      <header style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div role="tablist" aria-label="Étages" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {niveaux.map((n) => {
            const choisi = n.id === niveau?.id
            return (
              <button
                key={n.id} type="button" role="tab" aria-selected={choisi} disabled={!!piece || !actif}
                title={piece ? 'Sortez de la pièce pour changer d’étage' : undefined}
                onClick={() => { setNiveauId(n.id); setPointId(null) }}
                style={{
                  minHeight: 44, padding: '0 14px', border: 'none', borderBottom: `2px solid ${choisi ? ACCENT : 'transparent'}`,
                  background: 'none', fontSize: 14, fontWeight: choisi ? 600 : 400, color: choisi ? '#1F1B17' : '#5E5854',
                  cursor: piece ? 'default' : 'pointer', opacity: piece && !choisi ? 0.4 : 1, flexShrink: 0,
                }}
              >{n.nom}</button>
            )
          })}
        </div>
        {visite.resume.enAttente > 0 && <span style={{ fontSize: 12, color: '#9C9591', whiteSpace: 'nowrap' }}>{visite.resume.enAttente} à envoyer</span>}
        <button type="button" style={{ ...bouton, opacity: historique.length && actif ? 1 : 0.45 }} disabled={!historique.length || !actif} onClick={annuler}
          title="Annuler le dernier geste (⌘Z / Ctrl+Z)" aria-label="Annuler le dernier geste"><Undo2 size={16} /> Annuler</button>
        <button type="button" style={boutonPlein} onClick={() => setConfirmerFin(true)}><Square size={15} /> Terminer la visite</button>
      </header>
      <BandeauEnregistrement
        etat={rec.etat} duree_s={rec.duree_s} niveau={rec.niveau} enAttente={rec.enAttente}
        onPause={rec.pause} onReprendre={rec.reprendre}
      />
      {/* Barre de la pièce, toujours montée à hauteur fixe : le plan dessous ne change pas de taille */}
      <div style={{ height: 56, boxSizing: 'border-box', flexShrink: 0, background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.1)', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
        {!piece && (
          <p style={{ margin: 0, fontSize: 13, color: '#5E5854', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Touchez une pièce pour l’agrandir · hors des pièces, un point se rattache à l’étage
          </p>
        )}
        {piece && (<>
          <button type="button" style={bouton} disabled={!actif} onClick={sortir}><ChevronLeft size={18} /> Sortir de la pièce</button>
          <div style={{ minWidth: 0, flexShrink: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1F1B17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{designationPiece(piece)}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9C9591' }}>{fmtM2(aire(piece.contour))}</p>
          </div>
          <div aria-label="À décrire dans la pièce" style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
            {penseBete(piece.fiche).map((r) => (
              <span key={r.cle} style={{
                fontSize: 12, padding: '4px 8px', borderRadius: 2, whiteSpace: 'nowrap',
                border: `0.5px solid ${r.fait ? '#2A8A4E' : 'rgba(0,0,0,0.15)'}`, color: r.fait ? '#2A8A4E' : '#5E5854',
                background: r.fait ? 'rgba(42,138,78,0.08)' : 'white',
              }}>{r.fait ? '✓ ' : ''}{r.libelle}</span>
            ))}
          </div>
        </>)}
      </div>
      <PanneauPoint
        point={point} photos={photosDuPoint} obtenirLiens={obtenirLiens} inactif={!actif}
        onType={choisirType} onPhoto={photographier} onSupprimer={supprimer} onFermer={() => setPointId(null)}
      />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {niveau && (
          <PlanVisite
            key={niveau.id}
            niveau={niveau} pieces={pieces} points={points} nbPhotos={nbPhotos} visitees={visitees}
            piece={piece} pointId={pointId} obtenirLiens={obtenirLiens}
            onToucher={toucher} onChoisirPoint={setPointId} onDeplacerPoint={deplacer}
          />
        )}
        {/* Messages par-dessus le plan, pas au-dessus : sa taille ne bouge pas */}
        {(message || refus) && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6, display: 'flex', flexDirection: 'column' }}>
            {alerte}
            {refus && (
              <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B8412C', background: '#FDF2F0', borderBottom: '0.5px solid rgba(184,65,44,0.4)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1 }}>Un geste a été refusé par la base ({refus.erreur}). Il reste affiché ici.</span>
                <button type="button" style={bouton} onClick={() => visite.rejouer(refus.id)}>Réessayer</button>
                <button type="button" style={bouton} onClick={() => visite.abandonner(refus.id)}>Abandonner</button>
              </p>
            )}
          </div>
        )}
        {!actif && (
          // Tout le plan grisé, gestes arrêtés : seul ce bouton reste
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(60,56,52,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 48, gap: 14, textAlign: 'center' }}>
            <p style={{ margin: 0, color: 'white', fontSize: 17, fontWeight: 600 }}>{messageArret(rec.etat)}</p>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>Aucun point ne se pose tant que rien n’est enregistré.</p>
            {rec.erreur && <p style={{ margin: 0, color: 'white', fontSize: 13 }}>{rec.erreur}</p>}
            <button type="button" onClick={rec.reprendre} style={{ ...boutonPlein, background: '#B8412C', minHeight: 56, fontSize: 16, padding: '0 24px' }}>
              <Mic size={20} /> Reprendre l’enregistrement
            </button>
          </div>
        )}
      </div>
      {confirmerFin && <ConfirmerFin onConfirmer={terminer} onAnnuler={() => setConfirmerFin(false)} />}
    </div>
  )
}
```

- [ ] **Step 2 : intégrer au module (`index.jsx`)**

1. Imports — remplacer :

```js
import { useParams } from 'react-router-dom'
import { Upload, RefreshCw, X } from 'lucide-react'
```

par :

```js
import { useParams, useSearchParams } from 'react-router-dom'
import { Upload, RefreshCw, X, Mic } from 'lucide-react'
```

et ajouter après `import { EditeurPieces } from './EditeurPieces'` :

```js
import { useVisiteEdl } from './visite/useVisiteEdl'
import { VisiteEdl } from './visite/VisiteEdl'
import { visiteEnCours } from './visite/visiteLogique'
```

2. À la fin du commentaire d'en-tête (après la ligne `// fenêtres à liseré de la couleur de la phase).`), ajouter :

```js
// Lot 2 : « Démarrer la visite » ouvre l'écran plein de la visite (?visite=1,
// gardé au rechargement) ; l'état des lieux est recopié sur l'appareil à
// chaque ouverture avec du réseau. Après une visite, les plans ne se
// remplacent plus (points rattachés aux étages ; refusé aussi par la base).
```

3. Sous `const [confirmer, setConfirmer] = useState(false)`, ajouter :

```js
  const [params, setParams] = useSearchParams()
  const visite = useVisiteEdl(affaireId)
  const visiteOuverte = params.get('visite') === '1' && !lectureSeule
  const aEuUneVisite = (visite.donnees?.visites?.length ?? 0) > 0
  const ouvrirVisite = () => setParams((p) => { const n = new URLSearchParams(p); n.set('visite', '1'); return n })
  const fermerVisite = () => {
    setParams((p) => { const n = new URLSearchParams(p); n.delete('visite'); return n }, { replace: true })
    edl.recharger()
    visite.recharger()
  }
```

4. Juste avant `if (edl.indisponible) {`, ajouter (la visite s'ouvre même si la lecture du lot 1 échoue sans réseau : elle lit son instantané) :

```js
  if (visiteOuverte) {
    return <VisiteEdl affaireId={affaireId} visite={visite} obtenirLiens={obtenirLiens} onFermer={fermerVisite} />
  }
```

5. Remplacer le bloc de la barre :

```jsx
        <p style={{ ...texteDiscret, flex: 1 }}>
          {pluriel(edl.niveaux.length, 'étage')} · {pluriel(edl.pieces.length, 'pièce')}
          {horsLigne ? ' · sans réseau : plans lus sur cet appareil' : ' · plans gardés sur cet appareil pour la visite'}
        </p>
        {!lectureSeule && (
          <button type="button" onClick={() => setConfirmer(true)} style={boutonSecondaire}><RefreshCw size={14} /> Remplacer les plans</button>
        )}
```

par :

```jsx
        <p style={{ ...texteDiscret, flex: 1 }}>
          {pluriel(edl.niveaux.length, 'étage')} · {pluriel(edl.pieces.length, 'pièce')}
          {aEuUneVisite && ` · ${pluriel(visite.donnees.visites.length, 'visite')} · ${pluriel(visite.donnees.points.length, 'point')}`}
          {visite.resume.enAttente > 0 && ` · ${visite.resume.enAttente} geste${visite.resume.enAttente > 1 ? 's' : ''} de visite à envoyer`}
          {horsLigne ? ' · sans réseau : plans lus sur cet appareil' : ' · plans gardés sur cet appareil pour la visite'}
        </p>
        {!lectureSeule && visite.indisponible && (
          <span style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '0.5px solid #F59E0B', padding: '6px 10px' }}>La visite demande la migration 079 dans Supabase.</span>
        )}
        {!lectureSeule && visite.disponible && (
          <button type="button" onClick={ouvrirVisite} style={boutonPrincipal}>
            <Mic size={15} /> {visiteEnCours(visite.donnees.visites) ? 'Reprendre la visite' : 'Démarrer la visite'}
          </button>
        )}
        {!lectureSeule && !aEuUneVisite && (
          <button type="button" onClick={() => setConfirmer(true)} style={boutonSecondaire}><RefreshCw size={14} /> Remplacer les plans</button>
        )}
```

- [ ] **Step 3 : vérifier build, tests et lint**

Run: `npm test && npm run build && npx eslint src 2>&1 | tail -3`
Expected: tout vert ; nombre de problèmes ESLint pas plus haut qu'avant le lot (corriger ce qui vient des nouveaux fichiers).

- [ ] **Step 4 : vérification manuelle (Chrome, ordinateur avec micro), migration 079 passée sur la base de développement**

`npm run dev`, une affaire d'essai avec des plans importés (DXF inventé ou exemple hors dépôt) → module État des lieux :

1. « Démarrer la visite » → écran plein, rappel, « Démarrer la visite » → autorisation du micro → bandeau rouge « Enregistrement · 0:0x », jauge qui bouge en parlant.
2. Toucher une pièce : elle remplit l'écran, nom et surface en tête, pense-bête Sol · Murs · Plafond · Plinthes · HSP ; pincement / molette au-delà du zoom 12.
3. Toucher le plan, même sur une cloison : point « 1 » ; barre des calques active ; Chauffage → Radiateur : le titre devient « P1 · Radiateur ». Glisser le point choisi : il se déplace. Poser un deuxième point, puis toucher le premier : il est choisi (aucun point posé) ; un doigt qui part du premier fait défiler le plan. Pincer avec un doigt sur le point choisi : le point ne bouge pas. Photo : une image du disque → miniature.
   Ouvrir une pièce près du bord de l'étage : elle est centrée et remplit la zone du plan (pas de décalage dû aux barres) ; changer d'étage depuis le plan de l'étage : le nouvel étage s'affiche entier, sans l'ancien zoom.
4. « Annuler » (et ⌘Z) : défait le déplacement, puis le type, puis la pose.
5. « Pause » : plan grisé, aucun toucher ne pose de point, étages et « Sortir » inactifs ; « Reprendre l'enregistrement » → rouge à nouveau.
6. « Sortir de la pièce » : retour à l'étage, la pièce visitée est à la couleur de l'affaire, les autres grises.
7. DevTools → Application → IndexedDB : `jga-edl` (instantané, opérations vidées après envoi) et `jga-audio` (morceaux marqués `edlVisiteId`, un par entrée / sortie de pièce). Dans Supabase : `edl_visites`, `edl_points`, `edl_evenements` (debut, entree, point, point-modifie, pause, reprise, sortie…), `edl_photos`, fichiers dans `edl/<affaire>/edl/photos/`.
8. DevTools → Network → Offline : poser deux points, une photo → « N à envoyer » ; repasser en ligne → la file part (sans recharger), les points restent à l'écran.
9. Recharger la page en pleine visite : l'écran revient (`?visite=1`), « Reprendre la visite du … » repart dans la même visite.
10. « Terminer la visite » → confirmation → « Fin de la visite… » puis retour au module, sans repasser par l'écran d'accueil ; « Remplacer les plans » a disparu ; dans l'éditeur SQL, `delete from edl_etats where affaire_id = '<id>'` est refusé avec le message de la 079.
11. Un CR en mode Visite : le robot enregistre et s'arrête comme avant.

Sur iPad (app installée, après déploiement) : heure lisible dans la bande du haut, boutons au doigt, verrouiller l'écran 10 s → au retour, plan grisé puis reprise automatique (micro coupé), journal « coupure » / « reprise ».

- [ ] **Step 5 : commit**

```bash
git add src/modules/etude/etat-des-lieux/visite/VisiteEdl.jsx src/modules/etude/etat-des-lieux/index.jsx
git commit -m "feat: état des lieux — visite sur la tablette (enregistrement continu, pièces, points, photos, voile gris)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13 : Documentation, vérification finale, livraison

**Files:**
- Modify: `CLAUDE.md` (ligne 14 `npm test`, ligne ≈ 194 « Base : … fichiers », « Visite enregistrée » lot 1 ≈ ligne 516, section « État des lieux » ≈ lignes 760-785). Relire le texte exact avant chaque remplacement.
- Modify: `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` (§ 5, § 6, § 10 : ce qui passe au lot 3)

**Interfaces:**
- Consumes : tout ce qui précède.
- Produces : documentation à jour, lot poussé sur `main`.

- [ ] **Step 1 : compter tests et migrations**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"` puis `ls supabase/migrations/0*.sql | wc -l`
Expected: `# fail 0` ; noter le nombre de tests et de migrations.

- [ ] **Step 2 : mettre à jour `CLAUDE.md`**

1. Ligne 14 (`npm test         # 1099 tests node --test (…, état des lieux)`) : remplacer `1099` par le nombre relevé. « état des lieux » est déjà dans la liste : rien d'autre.
2. Ligne ≈ 194 (« **Base** : … numérotées, 78 fichiers, **passées à la** ») : remplacer « 78 fichiers » par le nombre relevé (79 fichiers).
3. Dans la puce **Données** de la section « État des lieux » (≈ ligne 763), remplacer :

```markdown
  par `fichiers_orphelins()` et la gestion de l'application. « Remplacer les
  plans » supprime tout l'état des lieux. **La règle restrictive de stockage
```

par :

```markdown
  par `fichiers_orphelins()` et la gestion de l'application. « Remplacer les
  plans » supprime tout l'état des lieux — **tant qu'aucune visite n'a eu
  lieu** : ensuite le bouton disparaît et la base refuse (079,
  `edl_etats_garde_visites`). **La règle restrictive de stockage
```

4. Dans « Visite enregistrée » → **Lot 1** (≈ ligne 516), après « Morceaux de **3 minutes** (limite de 4,5 Mo des fonctions Vercel). », ajouter :

```markdown
    Le moteur côté écran est commun aux CR et à l'état des lieux
    (`useEnregistreur` : démarrer, pause, reprendre, arrêter, `couper()` ;
    état décidé par les seuls signaux du moteur, `etatApresEvenement`) ;
    les morceaux portent `crId` **ou** `edlVisiteId` (`deLaVisite`,
    `champsVisite`). Le robot des CR garde son affichage d'avant
    (`etatPourLeCr` : sourdine et échec y restent « enregistre », la durée
    avance pendant la sourdine). Les tranches orphelines ne sont jamais
    recollées pendant que leur enregistrement tourne
    (`enregistrementsARecuperer`).
```

5. Dans la section « État des lieux », après la puce **Écran** (≈ ligne 774), ajouter :

```markdown
- **Visite (lot 2)** (`visite/`, migration 079, plan
  `docs/superpowers/plans/2026-11-17-etat-des-lieux-lot2-visiter.md`) :
  « Démarrer la visite » (`?visite=1`, gardé au rechargement) ouvre
  `VisiteEdl`, écran plein. Le micro s'ouvre **dans le geste** (Safari),
  puis la visite est créée (`edl_visites`, id décidé sur l'appareil) ;
  une visite non terminée se reprend. Enregistrement continu par le moteur
  des CR (`useEnregistrementEdl`), **coupé à chaque entrée et sortie de
  pièce** (`couper()`), pas à chaque point (horodatages par segment de
  Mistral à vérifier au lot 3 ; d'après sa documentation,
  `timestamp_granularities` est incompatible avec `language`). Au lot 2,
  l'audio de l'état des lieux attend sur l'appareil (`jga-audio`) : ni
  transcription ni envoi par le moteur de synchro avant le lot 3. Bandeau rouge « Enregistrement · 12:34 » + jauge ; **dès
  que rien n'est enregistré** (pause, sourdine, micro coupé, échec) le plan
  est grisé et seuls « Reprendre l'enregistrement », « Pause » et
  « Terminer » restent. Toucher une pièce l'agrandit (`cadre` /
  `zoomMax` de `VisionneusePlan`, `vueSurCadre`, zoom jusqu'à 60) ; tout
  point posé appartient à la pièce ouverte, même sur une cloison ; hors des
  pièces, un point se rattache à l'étage. Points numérotés dans l'ordre de
  l'état des lieux (`numeroSuivant`, décidé sur l'appareil), type facultatif
  par la barre des calques (`calquesEdl.js`, seule liste des calques
  `EDL-` et des types), photo, déplacement (seul le point choisi capture
  le doigt ; les autres se choisissent par un appui bref, `pointProche`, et
  un doigt posé dessus fait défiler le plan ; second doigt ou
  `pointercancel` = rien d'enregistré), suppression, **Annuler / ⌘Z**
  (`operationInverse`). Barres au-dessus du plan à hauteur fixe pendant
  toute la visite et `cleDeCadre` (taille du conteneur dans la clé) : une
  pièce ouverte est toujours bien cadrée. Pièces grises tant
  qu'elles ne sont pas visitées (`piecesVisitees`). Pense-bête Sol · Murs ·
  Plafond · Plinthes · HSP, coché d'après `edl_pieces.fiche` (lot 3).
  **Journal** `edl_evenements` (debut, fin, entree, sortie, point,
  point-modifie, point-supprime, photo, pause, reprise, coupure), heure de
  l'appareil.
- **Hors ligne de la visite** : base IndexedDB à part `jga-edl`
  (instantané par affaire, opérations, photos). **Tout geste passe par la
  file**, même en ligne (`fileEdlLogique.js`, testé) : écran = instantané +
  file ; après chaque envoi réussi, l'opération est reportée dans
  l'instantané avant d'être retirée (`synchroEdl.js`, verrou
  `jga-envoi-edl`). Instantané relu sous le même verrou, en lectures
  `synchro_id:id` (hors cache du service worker), paginées par identifiant.
  Envoi aussi par `useMoteurSynchro` (`envoyerToutEdl`). Le témoin du
  bandeau du haut reste celui des CR ; le module et la visite comptent
  leurs gestes à envoyer. La visite exige IndexedDB.
- **Photos des points** : compressées comme les CR, `edl/<affaire>/edl/photos/`,
  envoyées en `upsert`. Un point supprimé emporte ses lignes de photos
  mais **pas leurs fichiers** (« Annuler » le rend intact) :
  `fichiers_orphelins()` (079) les rattrape.
- **Plus de « Remplacer les plans » après une visite** : bouton retiré, et
  déclencheur `edl_etats_garde_visites` (la cascade de suppression
  d'affaire passe, `pg_trigger_depth() > 1`).
```

- [ ] **Step 3 : reporter dans la spec ce qui passe au lot 3**

Dans `docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md` :

1. § 5, remplacer :

```markdown
  et sortie de pièce. Les modules `audioLocal`, `transcription` et
  `useEnregistrementVisite` sont rendus indépendants du CR (une « visite »
  générique : CR ou état des lieux).
```

par :

```markdown
  et sortie de pièce. `audioLocal` et le moteur côté écran
  (`useEnregistreur`, commun au robot des CR) sont rendus indépendants du
  CR au lot 2 (une « visite » générique : CR ou état des lieux) ;
  `transcription` le sera au lot 3.
```

2. § 5, remplacer :

```markdown
  `jga-edl`. Le moteur de synchro de l'app (`useMoteurSynchro`) envoie aussi
  cette file et les morceaux audio en attente.
```

par :

```markdown
  `jga-edl`. Le moteur de synchro de l'app (`useMoteurSynchro`) envoie aussi
  cette file ; les morceaux audio en attente, au lot 3 (avec la
  transcription).
```

3. § 6, remplacer :

```markdown
les horodatages par segment (paramètre de Mistral à vérifier au début du
lot 2). Repli s'ils manquent : couper aussi un morceau à chaque point posé.
```

par :

```markdown
les horodatages par segment (`timestamp_granularities=segment` d'après la
documentation de Mistral, incompatible avec `language` : à vérifier au
début du lot 3). Repli s'ils manquent : couper aussi un morceau à chaque
point posé.
```

4. § 10, remplacer :

```markdown
2. **Visiter** : mode visite, enregistrement continu et découpé, journal,
   points, barre d'icônes, photos, voile gris, file hors ligne.
3. **Analyser** : transcription horodatée, analyse à la sortie de pièce,
   couleurs, relecture.
```

par :

```markdown
2. **Visiter** : mode visite, enregistrement continu et découpé, journal,
   points, barre d'icônes, photos, voile gris, file hors ligne (l'audio
   attend sur l'appareil).
3. **Analyser** : vérification des horodatages de Mistral, transcription
   horodatée (rendue indépendante du CR, morceaux envoyés aussi par le
   moteur de synchro), analyse à la sortie de pièce, couleurs, relecture.
```

- [ ] **Step 4 : vérification finale**

Run: `npm test && npm run build && npx eslint src 2>&1 | tail -3`
Expected: tests verts, build réussi, ESLint sans problème ajouté.

- [ ] **Step 5 : commit et push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-11-17-etat-des-lieux-design.md
git commit -m "docs: état des lieux — lot 2 (visite) dans CLAUDE.md et la conception

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6 : compte rendu final à l'utilisateur** (en français, simplement), avec obligatoirement la ligne :

« À faire de votre côté : passer à la main la migration 079 (`supabase/migrations/079_edl_visite.sql`) dans le SQL Editor de Supabase — sans elle, le bouton « Démarrer la visite » reste caché et le module le dit. Ensuite, essayer une visite sur l'iPad. »

(Aucun test SQL n'est exécuté dans ce lot : la vérification de la migration reste le contrôle de la Task 1, Step 2, et l'essai manuel de la Task 12.)

---

## Self-review

**1. Couverture de la spec (lot 2 = « mode visite, enregistrement continu et découpé, journal, points, barre d'icônes, photos, voile gris, file hors ligne »)**

| Exigence | Tâche |
|---|---|
| Démarrer : demande du micro, enregistrement continu, plan du premier étage, sélecteur d'étage en haut | 4, 12 |
| `couper()` à l'entrée / sortie de pièce ; `audioLocal`, `useEnregistrementVisite` indépendants du CR | 3, 4 (transcription et envoi de l'audio par `useMoteurSynchro` : lot 3, décision reportée dans la spec en 13) |
| Récupération des tranches orphelines sans toucher l'enregistrement en cours | 3 (`enregistrementsARecuperer`), 4 |
| Pause, « Terminer la visite » | 4, 12 |
| Pièce d'abord : toucher → pièce à tout l'écran, pincement, points de la pièce ouverte même sur une cloison, « Sortir », parole hors pièce → étage | 5, 7 (`cleDeCadre` : recadrage sur la bonne taille), 11, 12 (barres à hauteur fixe, `key={niveau.id}`) |
| Journal horodaté (entrée, sortie, point, photo, pause, reprise) ; morceaux avec heure de début | 1, 6, 9, 12 (morceaux : `debut` et `debutEnregistrement` déjà rangés) |
| Points numérotés, déplaçables, supprimables, photo rattachée | 5, 6, 9, 10, 11 |
| Barre d'icônes des calques visible, type facultatif ; liste dans un seul fichier pur | 2, 10 |
| Pense-bête Sol · Murs · Plafond · Plinthes · HSP | 5, 12 |
| Bandeau rouge + jauge ; grisé décidé par les seuls événements du moteur | 3, 10, 12 |
| Couleur des pièces : visitée / non visitée (le reste au lot 3) | 5, 11 |
| Hors ligne : file, ids sur l'appareil, ordre, 23505, base `jga-edl`, `useMoteurSynchro` | 6, 8, 9 |
| Écran plein, 44 px, safe-area | 10, 12 |
| Données § 8 (`edl_points`, `edl_evenements`, `edl_photos`) + droits + `fichiers_orphelins` | 1 |
| Migration absente tolérée | 8 (`lireToutEdl` → `indisponible`), 12 (messages) |
| « Remplacer les plans » refusé après une visite | 1, 12 |
| Annuler dans la visite | 6, 12 |
| Tests sans navigateur sur données inventées | 2, 3, 5, 6, 7 |

Robot des CR inchangé à l'écran : `etatPourLeCr` (sourdine et échec restent « enregistre »), durée qui avance pendant la sourdine (`minuterieActive`), `demarrer` enveloppé (l'événement d'un clic ne devient jamais des champs de visite) — Tasks 3 et 4.

Hors de ce lot, volontairement : vérification des horodatages de Mistral, transcription indépendante du CR et envoi de l'audio par le moteur de synchro, analyse à la sortie de pièce et couleurs sablier / vert / orange (lot 3), symboles et export (lot 4), suppression d'une photo seule (pas demandé ; supprimer le point suffit).

**2. Placeholders** : aucun « TBD », « à compléter » ni « comme la tâche N » ; chaque étape de code donne le code entier. Les seules indications non codées sont des vérifications manuelles décrites pas à pas.

**3. Cohérence des noms** : `cleDeCadre` (7) utilisé par `VisionneusePlan` (7) ; `pointProche` (5) en 11 ; `enregistrementsARecuperer`, `minuterieActive` (3) en 4 ; `enregistrementCourant()` rendu par `useEnregistreur` (4) et lu par les deux hooks de visite (4) ; `libellePoint` (2) en 10 ; `ICONES_CALQUES` interne à `BarreCalques.jsx` ; `TYPES_EDL` (6) utilisé tel quel en 8 et 9 ; `operationInverse` rend `{ type, charge, evenement }` (6) lu en 9 ; `useEnregistrementEdl(...).demarrer(visiteId)` (4) appelé en 12 ; `cadre` / `zoomMax` (7) passés par `PlanVisite` (11) avec `ZOOM_MAX_VISITE` (5) ; `MAGASINS_EDL.fichiers` clé = id de la photo (8), relue par `miniatureLocale` (8) et effacée par `abandonner` (9) ; `EVENEMENT_FILE_EDL` émis par `signalerFileEdl` (8) écouté en 9 ; `etatPourLeCr` (3) utilisé en 4 ; `messageArret` (5) en 10 et 12 ; `cheminsPhotoEdl` (5) en 8.

**4. Risques connus**
- **Netteté** : au zoom 60, l'image de l'étage (6 000 px au plus) s'adoucit ; contours et points restent nets (SVG). Si l'agence le juge gênant, redessiner les traits du DXF en SVG dans la pièce ouverte (hors lot).
- **Deux tablettes sur le même état des lieux en même temps** : numéros de points possiblement en double (aucune contrainte d'unicité, choisie pour ne jamais refuser un point hors ligne) ; à renuméroter au lot 4 si cela arrive.
- **Gros bâtiment** : instantané complet relu à chaque ouverture avec réseau (paginé) ; acceptable pour quelques milliers de points.
- **Pincement commencé sur le point choisi** : le glisser est annulé (le point ne bouge pas) mais le plan ne zoome pas non plus, la visionneuse ne voyant que le second doigt ; il suffit de pincer ailleurs.
- **Message ou refus affiché** : posé par-dessus le haut du plan (pas au-dessus) pour ne pas changer sa taille ; il peut masquer le haut d'une pièce le temps de le fermer.
- **AudioContext sur Safari** : le micro s'ouvre dans le geste « Démarrer » ; la reprise automatique après une coupure (sans geste) peut laisser la jauge immobile sur iPad — l'enregistrement, lui, repart (essai du lot 0). À vérifier sur iPad.
- **Stockage de l'iPad** : l'audio attend le lot 3 sur l'appareil (≈ 250 Ko/min) ; `navigator.storage.persist()` est demandé au démarrage pour éviter qu'iOS ne l'efface.
- **ESLint** (`react-hooks`) peut signaler les ajustements pendant le rendu ou les dépendances : comparer au compte d'avant, ne rien ajouter.
