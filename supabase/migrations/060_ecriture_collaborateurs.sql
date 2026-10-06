-- Migration 060 : seuls les collaborateurs d'une affaire la modifient
--
-- Jusqu'ici, tout compte de l'agence pouvait écrire dans n'importe quelle
-- affaire (règles « Agence » / « Écriture agence » de la migration 050) :
-- l'écran disait « lecture seule », mais rien n'arrêtait une écriture — un
-- planning a ainsi été modifié sur une affaire qu'on ne gère pas.
--
-- Règle, identique à `canEdit` de useAffaireCollaborateurs : un compte de
-- l'agence modifie une affaire s'il en est propriétaire ou collaborateur, ou
-- si l'affaire n'a encore aucun collaborateur déclaré (création, démarrage).
-- On peut toujours se promener partout : la lecture ne change pas.
--
-- Mise en œuvre : des règles RESTRICTIVES, pour l'écriture seulement
-- (insert, update, delete). Elles s'ajoutent aux règles existantes (ET) au
-- lieu de les remplacer : rien n'est ouvert par erreur, et la lecture n'est
-- pas touchée. Un intervenant extérieur garde ses règles à lui (migration
-- 052) : la restriction ne vise que les comptes de l'agence. L'éditeur SQL
-- (pas de session) et la clé de service des sauvegardes ne sont pas visés.
-- Les suppressions en cascade (suppression d'affaire) ne passent pas par les
-- règles.
--
-- Rejouable.

-- ─── 1. La règle ──────────────────────────────────────────────────────────────

create or replace function public.peut_modifier_affaire(cible uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_agence() and (
    not exists (select 1 from public.affaire_collaborateurs ac where ac.affaire_id = cible)
    or exists (
      select 1 from public.affaire_collaborateurs ac
      where ac.affaire_id = cible and ac.user_id = auth.uid()
        and ac.role in ('proprietaire', 'collaborateur')
    )
  )
$$;

-- L'affaire d'une version de plan (la table ne porte que le plan)
create or replace function public.affaire_du_plan(cible uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.affaire_id from public.affaire_plans p where p.id = cible
$$;

-- L'affaire d'un fichier : le premier dossier du chemin, s'il a la forme d'un
-- identifiant (sinon rien, plutôt qu'une erreur de conversion)
create or replace function public.affaire_du_chemin(chemin text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(chemin, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(chemin, '/', 1)::uuid
  end
$$;

grant execute on function public.peut_modifier_affaire(uuid), public.affaire_du_plan(uuid),
  public.affaire_du_chemin(text) to authenticated;

-- ─── 2. Les tables d'une affaire ─────────────────────────────────────────────

-- Chaque entrée : « table|expression donnant son affaire »
do $$
declare
  entree text;
  t text;
  condition text;
begin
  foreach entree in array array[
    -- l'affaire et son équipe
    'affaires|id',
    'affaire_collaborateurs|affaire_id', 'affaire_interlocuteurs|affaire_id',
    'affaire_generalites|affaire_id', 'affaire_plans|affaire_id',
    'affaire_plan_versions|public.affaire_du_plan(plan_id)',
    'lots|affaire_id', 'lot_entreprises|affaire_id',
    -- plannings
    'planning|affaire_id', 'planning_jalons|affaire_id', 'planning_segments|affaire_id',
    'planning_dependances|affaire_id', 'planning_zones|affaire_id', 'periodes_bloquees|affaire_id',
    'planning_etude_phases|affaire_id', 'planning_etude_jalons|affaire_id',
    'planning_etude_segments|affaire_id',
    -- finances
    'lignes_financieres|affaire_id', 'estimations_lots|affaire_id',
    'suivi_financier_etude|affaire_id', 'ftm|affaire_id',
    -- comptes rendus
    'comptes_rendus|affaire_id', 'cr_remarques|affaire_id', 'cr_photos|affaire_id',
    'cr_pastilles|affaire_id', 'cr_archives|affaire_id', 'cr_diffusions|affaire_id',
    'cr_enregistrements|affaire_id', 'cr_sections_template|affaire_id',
    'cr_sections|public.affaire_du_cr(cr_id)', 'cr_sous_sections|public.affaire_du_cr(cr_id)',
    'cr_presences|public.affaire_du_cr(cr_id)',
    -- OPR
    'opr|affaire_id', 'opr_visites|affaire_id', 'opr_reserves|affaire_id',
    'opr_constats|affaire_id', 'opr_photos|affaire_id', 'opr_pastilles|affaire_id',
    'opr_presences|affaire_id', 'opr_archives|affaire_id', 'opr_diffusions|affaire_id',
    'opr_pv|affaire_id', 'reserves|affaire_id',
    -- divers
    'todos|affaire_id', 'rapports_chantier|affaire_id'
  ]
  loop
    t := split_part(entree, '|', 1);
    if to_regclass('public.' || t) is null then continue; end if;
    condition := format('not public.est_agence() or public.peut_modifier_affaire(%s)', split_part(entree, '|', 2));
    execute format('drop policy if exists "Collaborateurs : ajout" on %I', t);
    execute format('drop policy if exists "Collaborateurs : modification" on %I', t);
    execute format('drop policy if exists "Collaborateurs : suppression" on %I', t);
    execute format('create policy "Collaborateurs : ajout" on %I as restrictive for insert to authenticated with check (%s)', t, condition);
    execute format('create policy "Collaborateurs : modification" on %I as restrictive for update to authenticated using (%s) with check (%s)', t, condition, condition);
    execute format('create policy "Collaborateurs : suppression" on %I as restrictive for delete to authenticated using (%s)', t, condition);
  end loop;
end $$;

-- ─── 3. Les fichiers d'une affaire ───────────────────────────────────────────
--
-- Une seule règle par commande sur storage.objects, qui ne vise que les
-- espaces rangés par affaire (`<affaire_id>/…`).

do $$
declare
  condition text := 'bucket_id not in (''cr-photos'', ''cr-plans'', ''cr-archives'', ''audio-temporaire'')'
    || ' or not public.est_agence() or public.peut_modifier_affaire(public.affaire_du_chemin(name))';
begin
  execute 'drop policy if exists "Collaborateurs : dépôt" on storage.objects';
  execute 'drop policy if exists "Collaborateurs : modification" on storage.objects';
  execute 'drop policy if exists "Collaborateurs : suppression" on storage.objects';
  execute format('create policy "Collaborateurs : dépôt" on storage.objects as restrictive for insert to authenticated with check (%s)', condition);
  execute format('create policy "Collaborateurs : modification" on storage.objects as restrictive for update to authenticated using (%s) with check (%s)', condition, condition);
  execute format('create policy "Collaborateurs : suppression" on storage.objects as restrictive for delete to authenticated using (%s)', condition);
end $$;

notify pgrst, 'reload schema';
