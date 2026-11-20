-- Migration 085 : état des lieux — finitions de murs au toucher
--
-- À passer dans le SQL Editor de Supabase, après la 084. Sans elle, toucher
-- un mur pendant la visite ne fait que l'allumer (rien n'est noté), et
-- l'analyse comme les exports restent ceux de la 084.
--
-- Plan : docs/superpowers/plans/2026-11-20-etat-des-lieux-murs-cotes-gestes.md.
-- Pendant la visite, l'architecte touche un mur (un côté du contour de la
-- pièce) et dit sa finition (« faïence toute hauteur ») : le journal note le
-- toucher (`mur-touche`, extrémités du mur dans `detail`), et l'analyse
-- propose une finition de mur. Une finition de mur est une trace de plus :
--   · sorte 'finition' : le mur, de (xa, ya) à (xb, yb) en mètres (repère du
--     plan d'origine, comme les cotes) ; `valeur` = la finition telle que
--     dite (« Faïence toute hauteur ») ; `statut` = conserver / rafraichir /
--     deposer, ou nul (« à préciser », codes de statutsEdl.js).
-- Rien n'est créé sans finition dite : Claude seul les propose
-- (origine 'ia', « à valider »), écrites par edl_ecrire_analyse dans la même
-- transaction que la fiche.
--
-- Aucun fichier, aucune table : fichiers_orphelins() et les droits de la 084
-- ne changent pas. Rejouable.

-- ─── Traces : la sorte 'finition' et son statut ─────────────────────────────
alter table edl_traces add column if not exists statut text;

-- Les contraintes de la 084 (sorte en ligne, nommée par PostgreSQL, et
-- edl_traces_forme) sont retirées quel que soit leur nom, puis reposées en
-- entier : les deux sortes de la 084, plus 'finition'.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.edl_traces'::regclass
       and contype = 'c'
       and (pg_get_constraintdef(oid) ilike '%sorte%' or conname in ('edl_traces_forme', 'edl_traces_statut_check'))
  loop
    execute format('alter table public.edl_traces drop constraint %I', c);
  end loop;
end $$;

alter table edl_traces add constraint edl_traces_sorte_check
  check (sorte in ('commande', 'cote', 'finition'));

-- Une finition se pose sur un mur : ses deux extrémités, comme une cote. Sa
-- valeur n'est pas exigée ici (celle d'une proposition de Claude l'est par
-- edl_ecrire_analyse), pour qu'une finition puisse un jour se poser à la main.
alter table edl_traces add constraint edl_traces_forme check (
  (sorte = 'commande' and point_a is not null and point_b is not null)
  or (sorte in ('cote', 'finition') and xa is not null and ya is not null and xb is not null and yb is not null)
);

alter table edl_traces add constraint edl_traces_statut_check
  check (statut is null or statut in ('conserver', 'rafraichir', 'deposer'));

-- ─── Journal : un mur touché ────────────────────────────────────────────────
-- La liste complète : les onze types de la 079, les quatre de la 084, et
-- `mur-touche`. Même retrait que la 084 : toute contrainte de vérification
-- qui porte sur `type`, quel que soit son nom.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.edl_evenements'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.edl_evenements drop constraint %I', c);
  end loop;
end $$;

alter table edl_evenements add constraint edl_evenements_type_check check (type in (
  'debut', 'fin', 'entree', 'sortie', 'point', 'point-modifie', 'point-supprime',
  'photo', 'pause', 'reprise', 'coupure',
  'point-touche', 'angle-touche', 'trace', 'trace-supprimee',
  'mur-touche'));

-- ─── Écriture d'une analyse : la 084, plus les finitions de murs ────────────
-- Même corps et mêmes paramètres que la 084 (aucune signature retirée : elle
-- ne change pas). `p_traces` porte en plus des lignes
-- { id, sorte: 'finition', visite_id, xa, ya, xb, yb, valeur, statut, extrait } :
--   · les finitions proposées et pas encore relues de la pièce sont
--     remplacées, comme les liaisons (même suppression : origine 'ia' et
--     « à valider », toutes sortes) ;
--   · une finition sans valeur, ou déjà relevée sur le même mur avec le même
--     texte (dans un sens ou dans l'autre), n'est pas ajoutée ;
--   · un statut inconnu devient nul (« à préciser »), sans faire échouer
--     l'analyse.
create or replace function public.edl_ecrire_analyse(
  p_piece uuid,
  p_version timestamptz,
  p_fiche jsonb,
  p_elements jsonb,
  p_analyse_le timestamptz,
  p_garder_fiche boolean default false,
  p_traces jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_piece edl_pieces%rowtype;
  v_version timestamptz;
  v_remplaces integer;
  v_ajoutes integer;
  v_traces_remplacees integer := 0;
  v_traces_ajoutees integer := 0;
  v_cotes_lues integer := 0;
  v_finitions_ajoutees integer := 0;
begin
  -- `for update` applique aussi les règles de modification : une pièce
  -- qu'on ne peut pas modifier n'est pas trouvée
  select * into v_piece from edl_pieces where id = p_piece for update;
  if not found then
    return jsonb_build_object('statut', 'introuvable');
  end if;
  if v_piece.updated_at is distinct from p_version then
    return jsonb_build_object('statut', 'conflit', 'updated_at', v_piece.updated_at);
  end if;

  delete from edl_elements
   where piece_id = p_piece and origine = 'ia' and a_valider;
  get diagnostics v_remplaces = row_count;

  -- Un identifiant déjà en base (élément validé entre deux essais) reste tel quel
  insert into edl_elements (
    id, affaire_id, niveau_id, piece_id, point_id, calque, "type", libelle, cotes, extrait,
    a_valider, a_verifier, origine, valide_le
  )
  select e.id, v_piece.affaire_id, v_piece.niveau_id, p_piece, e.point_id, e.calque, e."type",
         coalesce(e.libelle, ''), e.cotes, e.extrait, true, coalesce(e.a_verifier, false), 'ia', null
    from jsonb_to_recordset(coalesce(p_elements, '[]'::jsonb)) as e(
      id uuid, point_id uuid, calque text, "type" text, libelle text, cotes text, extrait text, a_verifier boolean
    )
  on conflict (id) do nothing;
  get diagnostics v_ajoutes = row_count;

  if p_traces is not null then
    -- Liaisons et finitions proposées, pas encore relues : remplacées
    delete from edl_traces
     where piece_id = p_piece and origine = 'ia' and a_valider;
    get diagnostics v_traces_remplacees = row_count;

    -- Valeurs proposées par une analyse précédente, pas encore relues : la
    -- nouvelle analyse les remplace (la cote, posée à la main, reste)
    update edl_traces set valeur = null, extrait = null, a_valider = false
     where piece_id = p_piece and sorte = 'cote' and origine = 'main' and a_valider;

    insert into edl_traces (
      id, affaire_id, visite_id, niveau_id, piece_id, sorte, point_a, point_b, extrait, origine, a_valider
    )
    select t.id, v_piece.affaire_id, t.visite_id, v_piece.niveau_id, p_piece, 'commande',
           t.point_a, t.point_b, t.extrait, 'ia', true
      from jsonb_to_recordset(p_traces) as t(
        id uuid, sorte text, visite_id uuid, point_a uuid, point_b uuid, extrait text
      )
     where t.sorte = 'commande'
       and t.point_a is not null and t.point_b is not null and t.point_a <> t.point_b
       and exists (select 1 from edl_points p where p.id = t.point_a)
       and exists (select 1 from edl_points p where p.id = t.point_b)
       and not exists (
         select 1 from edl_traces x
          where x.sorte = 'commande'
            and ((x.point_a = t.point_a and x.point_b = t.point_b)
              or (x.point_a = t.point_b and x.point_b = t.point_a)))
    on conflict (id) do nothing;
    get diagnostics v_traces_ajoutees = row_count;

    update edl_traces c set
      valeur = t.valeur,
      extrait = t.extrait,
      a_valider = true
      from jsonb_to_recordset(p_traces) as t(id uuid, sorte text, valeur text, extrait text)
     where t.sorte = 'cote'
       and c.id = t.id
       and c.piece_id = p_piece
       and c.sorte = 'cote'
       and c.valeur is null
       and nullif(btrim(t.valeur), '') is not null;
    get diagnostics v_cotes_lues = row_count;

    -- Finitions de murs proposées : le mur touché et ce qui en a été dit
    insert into edl_traces (
      id, affaire_id, visite_id, niveau_id, piece_id, sorte, xa, ya, xb, yb, valeur, statut, extrait, origine, a_valider
    )
    select t.id, v_piece.affaire_id, t.visite_id, v_piece.niveau_id, p_piece, 'finition',
           t.xa, t.ya, t.xb, t.yb, btrim(t.valeur),
           case when t.statut in ('conserver', 'rafraichir', 'deposer') then t.statut end,
           t.extrait, 'ia', true
      from jsonb_to_recordset(p_traces) as t(
        id uuid, sorte text, visite_id uuid, xa double precision, ya double precision,
        xb double precision, yb double precision, valeur text, statut text, extrait text
      )
     where t.sorte = 'finition'
       and t.id is not null
       and t.xa is not null and t.ya is not null and t.xb is not null and t.yb is not null
       and (t.xa <> t.xb or t.ya <> t.yb)
       and nullif(btrim(t.valeur), '') is not null
       and not exists (
         select 1 from edl_traces x
          where x.piece_id = p_piece and x.sorte = 'finition'
            and lower(btrim(coalesce(x.valeur, ''))) = lower(btrim(t.valeur))
            and ((x.xa = t.xa and x.ya = t.ya and x.xb = t.xb and x.yb = t.yb)
              or (x.xa = t.xb and x.ya = t.yb and x.xb = t.xa and x.yb = t.ya)))
    on conflict (id) do nothing;
    get diagnostics v_finitions_ajoutees = row_count;
  end if;

  update edl_pieces set
    fiche = case when p_garder_fiche then fiche else coalesce(p_fiche, '{}'::jsonb) end,
    fiche_a_valider = case when p_garder_fiche then fiche_a_valider else true end,
    analyse_le = p_analyse_le,
    analyse_erreur = null
   where id = p_piece
  returning updated_at into v_version;
  if not found then
    -- Refus des règles sur la pièce : les éléments ne doivent pas rester seuls
    raise exception 'edl_ecrire_analyse : écriture de la pièce refusée' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'statut', 'ok', 'updated_at', v_version, 'remplaces', v_remplaces, 'ajoutes', v_ajoutes,
    'traces_remplacees', v_traces_remplacees, 'traces_ajoutees', v_traces_ajoutees, 'cotes_lues', v_cotes_lues,
    'finitions_ajoutees', v_finitions_ajoutees
  );
end $$;

grant execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean, jsonb) to authenticated;
grant execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean, jsonb) to service_role;
revoke execute on function public.edl_ecrire_analyse(uuid, timestamptz, jsonb, jsonb, timestamptz, boolean, jsonb) from public, anon;

notify pgrst, 'reload schema';
