-- Migration 065 : liens de téléchargement courts et lisibles
--
-- Le lien signé du stockage, envoyé dans l'e-mail de diffusion, est long et
-- illisible. L'e-mail porte désormais une adresse de l'app :
--   https://<site>/pdf/2618-LVV-CR03-k7Pq9x
-- La fonction Vercel `api/pdf.js` lit ici le lien signé (30 jours) et y
-- renvoie le visiteur. Le code finit par 6 caractères tirés au hasard : une
-- adresse ne se devine pas à partir d'une autre.
--
-- Le destinataire n'a pas de compte : la lecture passe par la fonction
-- `lien_telechargement`, qui ne rend que le lien du code demandé, encore
-- valable. La table, elle, reste à l'agence (écriture : collaborateurs de
-- l'affaire, règle de la migration 060).
--
-- Rejouable.

create table if not exists liens_telechargement (
  code        text primary key check (code ~ '^[A-Za-z0-9-]{6,80}$'),
  affaire_id  uuid not null references affaires(id) on delete cascade,
  chemin      text not null,
  url         text not null,
  expire_le   timestamptz not null,
  cree_le     timestamptz not null default now(),
  cree_par    uuid default auth.uid()
);

create index if not exists liens_telechargement_affaire on liens_telechargement(affaire_id);

alter table liens_telechargement enable row level security;
drop policy if exists "Agence" on liens_telechargement;
create policy "Agence" on liens_telechargement for all to authenticated
  using (public.est_agence()) with check (public.est_agence());
drop policy if exists "Collaborateurs : ajout" on liens_telechargement;
drop policy if exists "Collaborateurs : modification" on liens_telechargement;
drop policy if exists "Collaborateurs : suppression" on liens_telechargement;
create policy "Collaborateurs : ajout" on liens_telechargement as restrictive for insert to authenticated
  with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id));
create policy "Collaborateurs : modification" on liens_telechargement as restrictive for update to authenticated
  using (not public.est_agence() or public.peut_modifier_affaire(affaire_id))
  with check (not public.est_agence() or public.peut_modifier_affaire(affaire_id));
create policy "Collaborateurs : suppression" on liens_telechargement as restrictive for delete to authenticated
  using (not public.est_agence() or public.peut_modifier_affaire(affaire_id));

-- Le lien d'un code, s'il existe et n'a pas expiré ; rien sinon
create or replace function lien_telechargement(p_code text)
returns text
language sql stable security definer set search_path = '' as $$
  select l.url from public.liens_telechargement l
  where l.code = p_code and l.expire_le > now()
$$;

revoke all on function lien_telechargement(text) from public;
grant execute on function lien_telechargement(text) to anon, authenticated;

notify pgrst, 'reload schema';
