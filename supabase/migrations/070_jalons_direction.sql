-- Migration 070 : jalons fixés depuis la gestion d'agence
--
-- Les associés posent, déplacent ou retirent les jalons de n'importe quelle
-- affaire depuis le calendrier des rendus ; ils apparaissent dans le planning
-- d'étude ou de chantier, où l'équipe s'organise autour (et inversement : un
-- jalon du planning est dans le calendrier). Seuls les jalons leur sont
-- ouverts : le reste d'un planning reste aux collaborateurs de l'affaire
-- (règles restrictives de la 060). Un jalon posé ainsi porte
-- `fixe_direction`, signalé discrètement dans les plannings ; il reste
-- modifiable par l'équipe.
--
-- Rejouable. Suppose les migrations 060, 067, 068.

alter table planning_jalons add column if not exists fixe_direction boolean not null default false;
alter table planning_etude_jalons add column if not exists fixe_direction boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array['planning_jalons', 'planning_etude_jalons'] loop
    execute format('drop policy if exists "Collaborateurs : ajout" on %I', t);
    execute format('drop policy if exists "Collaborateurs : modification" on %I', t);
    execute format('drop policy if exists "Collaborateurs : suppression" on %I', t);
    execute format('create policy "Collaborateurs : ajout" on %I as restrictive for insert to authenticated with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id) or public.acces_gestion())', t);
    execute format('create policy "Collaborateurs : modification" on %I as restrictive for update to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id) or public.acces_gestion()) with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id) or public.acces_gestion())', t);
    execute format('create policy "Collaborateurs : suppression" on %I as restrictive for delete to authenticated using (not public.est_agence() or public.peut_modifier_affaire(affaire_id) or public.acces_gestion())', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
