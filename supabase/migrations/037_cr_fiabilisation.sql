-- Migration 037 : fiabilisation des comptes rendus de chantier
--
-- 1. Date d'émission d'un compte rendu.
-- 2. Historique conservé : chaque présence garde une copie du participant, et
--    chaque remarque une copie du libellé de son destinataire. Supprimer une
--    fiche (interlocuteur, entreprise, lot) ne vide plus les anciens comptes
--    rendus : les clés passent de « on delete cascade » à « on delete set null ».
-- 3. Verrou : un compte rendu émis ne peut plus être modifié ni supprimé tant
--    qu'il n'est pas rouvert. Le verrou est posé en base pour qu'un onglet
--    resté ouvert ailleurs ne puisse pas passer outre.
--
-- Ordre imposé : les copies sont remplies AVANT la pose du verrou, qui
-- refuserait sinon d'écrire dans les comptes rendus déjà émis.

-- ── 1. Date d'émission ────────────────────────────────────────────────────────
alter table comptes_rendus add column if not exists date_emission timestamptz;

-- Comptes rendus émis avant cette migration : leur dernière modification est la
-- meilleure approximation disponible.
update comptes_rendus
set date_emission = updated_at
where statut = 'emis' and date_emission is null;

-- ── 2a. Copie du participant dans chaque présence ─────────────────────────────
alter table cr_presences
  add column if not exists copie_type            text check (copie_type in ('interlocuteur', 'entreprise')),
  add column if not exists copie_categorie       text,
  add column if not exists copie_categorie_label text,
  add column if not exists copie_prenom          text,
  add column if not exists copie_nom             text,
  add column if not exists copie_fonction        text,
  add column if not exists copie_organisation    text,
  add column if not exists copie_adresse         text,
  add column if not exists copie_email           text,
  add column if not exists copie_telephone       text,
  add column if not exists copie_ordre           integer,
  add column if not exists copie_lot_numero      integer,
  add column if not exists copie_lot_nom         text,
  add column if not exists copie_entreprise      text;

update cr_presences p set
  copie_type            = 'interlocuteur',
  copie_categorie       = i.categorie,
  copie_categorie_label = i.categorie_label,
  copie_prenom          = i.prenom,
  copie_nom             = i.nom,
  copie_fonction        = i.fonction,
  copie_organisation    = i.organisation,
  copie_adresse         = i.adresse,
  copie_email           = i.email,
  copie_telephone       = i.telephone,
  copie_ordre           = i.ordre
from affaire_interlocuteurs i
where p.interlocuteur_id = i.id and p.copie_type is null;

update cr_presences p set
  copie_type       = 'entreprise',
  copie_lot_numero = l.numero,
  copie_lot_nom    = l.nom,
  copie_entreprise = e.raison_sociale,
  copie_prenom     = c.prenom,
  copie_nom        = c.nom,
  copie_email      = coalesce(c.email, e.email),
  copie_telephone  = coalesce(c.telephone, e.telephone)
from lot_entreprises le
join lots l on l.id = le.lot_id
join entreprises e on e.id = le.entreprise_id
left join interlocuteurs c on c.id = le.interlocuteur_id
where p.lot_entreprise_id = le.id and p.copie_type is null;

-- ── 2b. Copie du destinataire de chaque remarque ─────────────────────────────
alter table cr_remarques add column if not exists copie_destinataire text;

update cr_remarques r set
  copie_destinataire = case when l.numero is null then l.nom else 'Lot ' || l.numero || ' — ' || l.nom end
from lots l
where r.lot_id = l.id and r.copie_destinataire is null;

update cr_remarques r set
  copie_destinataire = coalesce(
    nullif(trim(coalesce(i.prenom, '') || ' ' || coalesce(i.nom, '')), ''),
    i.organisation
  )
from affaire_interlocuteurs i
where r.interlocuteur_id = i.id and r.copie_destinataire is null;

-- Tenue à jour par la base à chaque écriture : l'application n'a rien à
-- envoyer. Quand la fiche est supprimée, la clé repasse à null en cascade
-- (pg_trigger_depth() > 1) et la copie reste ; quand l'utilisateur retire
-- l'attribution lui-même, la copie part avec.
create or replace function cr_remarque_copie_destinataire() returns trigger
language plpgsql as $$
begin
  if new.lot_id is not null then
    select case when l.numero is null then l.nom else 'Lot ' || l.numero || ' — ' || l.nom end
      into new.copie_destinataire
      from lots l where l.id = new.lot_id;
  elsif new.interlocuteur_id is not null then
    select coalesce(nullif(trim(coalesce(i.prenom, '') || ' ' || coalesce(i.nom, '')), ''), i.organisation)
      into new.copie_destinataire
      from affaire_interlocuteurs i where i.id = new.interlocuteur_id;
  elsif tg_op = 'UPDATE' and pg_trigger_depth() = 1
    and (old.lot_id is not null or old.interlocuteur_id is not null) then
    new.copie_destinataire := null;
  end if;
  return new;
end $$;

drop trigger if exists cr_remarques_copie_destinataire on cr_remarques;
create trigger cr_remarques_copie_destinataire
  before insert or update on cr_remarques
  for each row execute function cr_remarque_copie_destinataire();

-- ── 2c. Supprimer une fiche ne supprime plus les présences ────────────────────
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'cr_presences'::regclass
      and con.contype = 'f'
      and att.attname in ('interlocuteur_id', 'lot_entreprise_id')
  loop
    execute format('alter table cr_presences drop constraint %I', c.conname);
  end loop;
end $$;

alter table cr_presences
  add constraint cr_presences_interlocuteur_id_fkey
    foreign key (interlocuteur_id) references affaire_interlocuteurs(id) on delete set null,
  add constraint cr_presences_lot_entreprise_id_fkey
    foreign key (lot_entreprise_id) references lot_entreprises(id) on delete set null;

-- ── 3. Verrou d'un compte rendu émis ──────────────────────────────────────────

-- Contenu d'un compte rendu (présences, sections, sous-sections, remarques).
-- Les écritures faites par la base elle-même en cascade (suppression d'une
-- affaire, fiche supprimée qui remet une clé à null) passent : sans cela,
-- supprimer une affaire ou un lot échouerait dès qu'un compte rendu est émis.
-- On les reconnaît à pg_trigger_depth() > 1.
create or replace function cr_verifier_brouillon() returns trigger
language plpgsql as $$
declare v_cr_id uuid;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then v_cr_id := old.cr_id; else v_cr_id := new.cr_id; end if;
  if exists (select 1 from comptes_rendus where id = v_cr_id and statut = 'emis') then
    raise exception 'Ce compte rendu est émis : rouvrez-le pour le modifier.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['cr_presences', 'cr_sections', 'cr_sous_sections', 'cr_remarques'] loop
    execute format('drop trigger if exists %I on %I', t || '_verrou_emis', t);
    execute format(
      'create trigger %I before insert or update or delete on %I
         for each row execute function cr_verifier_brouillon()',
      t || '_verrou_emis', t
    );
  end loop;
end $$;

-- Le compte rendu lui-même : émis, il ne change que pour être rouvert, et ne
-- se supprime pas. La suppression reste possible quand elle vient d'une
-- cascade (suppression de l'affaire) : pg_trigger_depth() vaut alors plus de 1.
create or replace function cr_verrou_compte_rendu() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'emis' and pg_trigger_depth() = 1 then
      raise exception 'Ce compte rendu est émis : rouvrez-le pour le supprimer.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.statut = 'emis' and new.statut = 'emis' then
    raise exception 'Ce compte rendu est émis : rouvrez-le pour le modifier.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists comptes_rendus_verrou_emis on comptes_rendus;
create trigger comptes_rendus_verrou_emis
  before update or delete on comptes_rendus
  for each row execute function cr_verrou_compte_rendu();

notify pgrst, 'reload schema';
