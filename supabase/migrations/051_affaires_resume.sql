-- Migration 051 : l'affaire vue par un intervenant extérieur
--
-- La table `affaires` porte elle-même des montants : enveloppe, travaux,
-- honoraires. Une règle de sécurité travaille par ligne, jamais par colonne :
-- laisser un extérieur lire « son » affaire, c'est lui donner ces montants.
--
-- D'où une vue qui ne montre que ce dont un compte rendu a besoin (nom, code,
-- adresse, maître d'ouvrage, photo). La table redevient réservée à l'agence.
--
-- La vue n'est pas en `security_invoker` : elle s'exécute avec les droits de
-- son propriétaire, et filtre elle-même les lignes sur `acces_affaire(id)`.
-- C'est ce qui lui permet de montrer une affaire que la table refuse.

create or replace view affaires_resume
with (security_invoker = false) as
  select
    a.id, a.code_affaire, a.nom, a.phase, a.avancement,
    a.projet_adresse, a.projet_commune, a.projet_code_postal,
    a.moa_nom, a.photo_url,
    a.date_demarrage_travaux, a.date_livraison,
    a.created_at
  from affaires a
  where public.acces_affaire(a.id);

grant select on affaires_resume to authenticated;

-- La table complète : l'agence seule. Un extérieur passe par la vue.
drop policy if exists "Lecture des affaires accessibles" on affaires;
drop policy if exists "Lecture des affaires" on affaires;
create policy "Lecture des affaires" on affaires
  for select to authenticated using (public.est_agence());

notify pgrst, 'reload schema';
