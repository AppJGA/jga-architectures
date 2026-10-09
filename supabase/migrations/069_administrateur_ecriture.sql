-- Migration 069 : l'administrateur écrit partout
--
-- Le statut d'administrateur (068) lève toutes les restrictions d'écriture :
-- il modifie n'importe quelle affaire comme un collaborateur (règles
-- restrictives de la 060, stockage compris, par `peut_modifier_affaire`), et
-- la fiche de l'affaire comme son responsable (photo, phase, montants…), y
-- compris la supprimer. Pour les autres comptes, rien ne change : la fiche
-- reste au responsable (règle de la 050), le reste aux collaborateurs.
--
-- Rejouable. Suppose la migration 068.

create or replace function public.peut_modifier_affaire(cible uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_agence() and (
    public.est_admin()
    or not exists (select 1 from public.affaire_collaborateurs ac where ac.affaire_id = cible)
    or exists (
      select 1 from public.affaire_collaborateurs ac
      where ac.affaire_id = cible and ac.user_id = auth.uid()
        and ac.role in ('proprietaire', 'collaborateur')
    )
  )
$$;

drop policy if exists "Modification par propriétaire" on affaires;
create policy "Modification par propriétaire" on affaires
  for update to authenticated using (
    public.est_agence() and (
      public.est_admin()
      or exists (select 1 from affaire_collaborateurs ac where ac.affaire_id = affaires.id and ac.user_id = auth.uid() and ac.role = 'proprietaire')
      or not exists (select 1 from affaire_collaborateurs ac where ac.affaire_id = affaires.id and ac.role = 'proprietaire')
    )
  );

drop policy if exists "Suppression par propriétaire" on affaires;
create policy "Suppression par propriétaire" on affaires
  for delete to authenticated using (
    public.est_agence() and (
      public.est_admin()
      or exists (
        select 1 from affaire_collaborateurs ac
        where ac.affaire_id = affaires.id and ac.user_id = auth.uid() and ac.role = 'proprietaire'
      )
    )
  );

notify pgrst, 'reload schema';
