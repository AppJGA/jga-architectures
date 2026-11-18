-- Migration 081 : état des lieux — plan vectoriel allégé de chaque étage
--
-- À l'import, chaque calque du DXF reçoit un traitement (garder, pocher les
-- murs, masquer le motif, masquer), proposé par Claude et modifiable. L'étage
-- allégé est gardé en plus de son image, dans un fichier vectoriel compressé
-- du stockage `edl` (`<affaire>/edl/vecteurs/<id>.json.gz`) : c'est lui que
-- l'écran redessine, net à tous les zooms.
--   chemin_vecteurs : chemin de ce fichier (null pour un étage plus ancien,
--                     qui s'affiche par son image comme avant) ;
--   calques         : { decisions, raisons, source } — le traitement retenu
--                     pour chaque calque, les raisons de Claude, et d'où
--                     vient le choix ('claude', 'main', 'defaut').
-- Sans cette migration, l'import marche sans fichier vectoriel.
--
-- Rejouable. La table edl_niveaux a déjà ses droits et ses règles (077).

alter table edl_niveaux
  add column if not exists chemin_vecteurs text,
  add column if not exists calques jsonb;

-- ─── Fichiers inutilisés : fonction de la 079 + les fichiers vectoriels ──────
-- Recopiée entière : un `create or replace` remplace toute la fonction.
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
          where n.chemin = o.name or n.chemin_apercu = o.name or n.chemin_source = o.name
             or n.chemin_vecteurs = o.name)
        and not exists (
          select 1 from public.edl_photos p
          where p.chemin = o.name or p.chemin_miniature = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
