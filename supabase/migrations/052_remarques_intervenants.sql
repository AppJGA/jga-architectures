-- Migration 052 : un intervenant extérieur écrit ses propres remarques
--
-- Troisième et dernier lot. Ce qu'il peut faire, sur les seules affaires où il
-- est invité et tant que le compte rendu n'est pas émis :
--   · ajouter ses remarques, avec photos et pastille sur plan ;
--   · les modifier et les supprimer — les siennes, jamais les nôtres ;
--   · répondre sous une remarque (un suivi n'altère pas la remarque, il s'y
--     ajoute) ;
--   · rien d'autre : ni sections, ni présences, ni statut de nos remarques.
--
-- Ses remarques se rangent dans une section dédiée, « Observations des
-- intervenants », créée à la demande : lui ne crée pas de section.

-- Le type de section accueille cette nouvelle valeur
alter table cr_sections drop constraint if exists cr_sections_type_section_check;
alter table cr_sections
  add constraint cr_sections_type_section_check
  check (type_section in ('general', 'interlocuteurs', 'intervenants'));

-- ─── La section d'accueil ─────────────────────────────────────────────────────

create or replace function public.chiffre_romain(n integer) returns text
language sql immutable as $$
  select coalesce((array[
    'I','II','III','IV','V','VI','VII','VIII','IX','X',
    'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'
  ])[n], n::text)
$$;

/**
 * Section « Observations des intervenants » du compte rendu, créée si elle
 * manque. `security definer` : créer une section est réservé à l'agence, mais
 * un intervenant invité doit pouvoir déposer sa remarque quelque part.
 */
create or replace function public.section_intervenants(cr uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  affaire uuid;
  emis boolean;
  existante uuid;
  rang integer;
  nouvelle uuid;
begin
  select c.affaire_id, c.statut = 'emis' into affaire, emis
  from public.comptes_rendus c where c.id = cr;
  if affaire is null then
    raise exception 'Compte rendu introuvable.' using errcode = 'P0001';
  end if;
  if not public.acces_affaire(affaire) then
    raise exception 'Ce compte rendu ne vous est pas accessible.' using errcode = 'P0001';
  end if;
  if emis then
    raise exception 'Ce compte rendu est émis : il ne reçoit plus de remarque.' using errcode = 'P0001';
  end if;

  select s.id into existante
  from public.cr_sections s where s.cr_id = cr and s.type_section = 'intervenants' limit 1;
  if existante is not null then return existante; end if;

  select coalesce(max(s.ordre), -1) + 1 into rang from public.cr_sections s where s.cr_id = cr;
  insert into public.cr_sections (cr_id, numero_romain, titre, ordre, type_section)
  values (cr, public.chiffre_romain(rang + 1), 'Observations des intervenants', rang, 'intervenants')
  returning id into nouvelle;
  return nouvelle;
end $$;

grant execute on function public.section_intervenants(uuid), public.chiffre_romain(integer) to authenticated;

-- ─── Ses remarques ────────────────────────────────────────────────────────────
--
-- `created_by` porte l'auteur (migration 050) et vaut `auth.uid()` par défaut.
-- Les règles s'y adossent : ce qu'il écrit est à lui, ce qui est à nous lui
-- reste fermé. Le verrou des comptes rendus émis (migration 037) s'applique
-- avant tout cela.

drop policy if exists "Intervenant ajoute ses remarques" on cr_remarques;
create policy "Intervenant ajoute ses remarques" on cr_remarques
  for insert to authenticated with check (
    public.membre_affaire(affaire_id)
    and created_by = auth.uid()
    and public.affaire_du_cr(cr_id) = affaire_id
    -- Un suivi peut répondre à n'importe quelle remarque du compte rendu ;
    -- une remarque principale se range où elle veut, elle reste la sienne.
  );

drop policy if exists "Intervenant modifie ses remarques" on cr_remarques;
create policy "Intervenant modifie ses remarques" on cr_remarques
  for update to authenticated
  using (created_by = auth.uid() and public.membre_affaire(affaire_id))
  with check (created_by = auth.uid() and public.membre_affaire(affaire_id));

drop policy if exists "Intervenant supprime ses remarques" on cr_remarques;
create policy "Intervenant supprime ses remarques" on cr_remarques
  for delete to authenticated
  using (created_by = auth.uid() and public.membre_affaire(affaire_id));

-- L'auteur d'une ligne ne se réécrit pas : sans cela, une remarque de l'agence
-- pourrait être « adoptée » puis modifiée.
create or replace function public.cr_auteur_fige() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.created_by is distinct from old.created_by and not public.est_agence() then
    raise exception 'L''auteur d''une ligne ne se change pas.' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['cr_remarques', 'cr_photos', 'cr_pastilles'] loop
    execute format('drop trigger if exists %I on %I', t || '_auteur_fige', t);
    execute format('create trigger %I before update on %I for each row execute function public.cr_auteur_fige()', t || '_auteur_fige', t);
  end loop;
end $$;

-- ─── Ses photos et ses pastilles ──────────────────────────────────────────────
--
-- Rattachées à ses remarques seulement : une photo ajoutée sous une remarque de
-- l'agence en changerait le contenu.

create or replace function public.remarque_de_lauteur(cible uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cr_remarques r where r.id = cible and r.created_by = auth.uid()
  )
$$;

grant execute on function public.remarque_de_lauteur(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['cr_photos', 'cr_pastilles'] loop
    execute format('drop policy if exists %I on %I', 'Intervenant ajoute les siennes', t);
    execute format($f$create policy "Intervenant ajoute les siennes" on %I
      for insert to authenticated with check (
        public.membre_affaire(affaire_id) and created_by = auth.uid()
        and public.remarque_de_lauteur(remarque_id)
      )$f$, t);

    execute format('drop policy if exists %I on %I', 'Intervenant modifie les siennes', t);
    execute format($f$create policy "Intervenant modifie les siennes" on %I
      for update to authenticated
      using (created_by = auth.uid() and public.membre_affaire(affaire_id))
      with check (created_by = auth.uid())$f$, t);

    execute format('drop policy if exists %I on %I', 'Intervenant supprime les siennes', t);
    execute format($f$create policy "Intervenant supprime les siennes" on %I
      for delete to authenticated
      using (created_by = auth.uid() and public.membre_affaire(affaire_id))$f$, t);
  end loop;
end $$;

-- ─── Ses fichiers ─────────────────────────────────────────────────────────────
--
-- Il dépose une photo dans le dossier de son affaire, et ne peut retirer que
-- les fichiers qu'il a lui-même envoyés (`owner`, tenu par le stockage).

drop policy if exists "Intervenant dépose ses photos" on storage.objects;
create policy "Intervenant dépose ses photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'cr-photos'
    and public.membre_affaire(nullif(split_part(name, '/', 1), '')::uuid)
  );

drop policy if exists "Intervenant retire ses photos" on storage.objects;
create policy "Intervenant retire ses photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'cr-photos'
    and owner = auth.uid()
    and public.membre_affaire(nullif(split_part(name, '/', 1), '')::uuid)
  );

notify pgrst, 'reload schema';
