-- Migration 075 : nettoyage du stockage — photos de couverture inutilisées
--
-- Une photo de couverture d'affaire (stockage public `affaires-photos`,
-- migration 014) n'est désignée que par `affaires.photo_url` (son adresse
-- publique). Changer de photo ou supprimer l'affaire efface d'ordinaire
-- l'ancien fichier, mais un échec en route le laisse seul. Elle est désormais
-- comptée parmi les fichiers inutilisés si aucune affaire ne la désigne — et,
-- comme le reste, seulement passé une heure (envoi en cours).
--
-- Reprend fichiers_orphelins() de la migration 046 en y ajoutant ce cas.
-- Aucune table. Rejouable.

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
      -- L'adresse publique finit par « /affaires-photos/<chemin> », parfois
      -- suivie d'un « ?… » : on compare le chemin seul
      (o.bucket_id = 'affaires-photos' and not exists (
        select 1 from public.affaires a
        where split_part(split_part(a.photo_url, '/affaires-photos/', 2), '?', 1) = o.name))
    )
  order by o.bucket_id, o.name
$$;

revoke all on function fichiers_orphelins() from public, anon;
grant execute on function fichiers_orphelins() to authenticated;

notify pgrst, 'reload schema';
