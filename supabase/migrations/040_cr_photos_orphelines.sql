-- Migration 040 : repérer les fichiers photo inutilisés
--
-- Un fichier du stockage `cr-photos` peut ne plus être désigné par aucune
-- ligne de `cr_photos` : affaire supprimée avant que l'application ne sache
-- effacer ses photos, envoi interrompu entre le fichier et la ligne, nettoyage
-- qui a échoué. Cette fonction les liste ; l'application les efface ensuite
-- par l'API du stockage (le stockage ne se purge pas en SQL).
--
-- Les fichiers de moins d'une heure sont ignorés : une photo en cours d'envoi
-- existe déjà dans le stockage avant que sa ligne ne soit enregistrée.

create or replace function cr_photos_orphelines()
returns table (chemin text, taille bigint)
language sql stable security definer set search_path = '' as $$
  select o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'cr-photos'
    and o.created_at < now() - interval '1 hour'
    and not exists (
      select 1 from public.cr_photos p
      where p.chemin = o.name or p.chemin_miniature = o.name
    )
  order by o.name
$$;

revoke all on function cr_photos_orphelines() from public, anon;
grant execute on function cr_photos_orphelines() to authenticated;

notify pgrst, 'reload schema';
