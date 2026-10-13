-- Migration 072 : carnet d'adresses, plusieurs interlocuteurs par organisation
--
-- Conception : docs/superpowers/specs/2026-10-13-carnet-interlocuteurs-design.md.
-- Une organisation du carnet a un type (entreprise, bureau d'études, maître
-- d'ouvrage, autre) et un contact d'affaire est relié à sa personne du carnet
-- (`interlocuteur_id`) en plus de sa copie, qui reste l'historique imprimé
-- dans les comptes rendus. Les contacts déjà saisis sont reliés quand le
-- prénom, le nom et l'organisation retrouvent une seule personne.
--
-- Rejouable. La clé de comparaison `carnet_cle` est recopiée en JS
-- (`cleComparaison`, src/shared/carnet/carnetLiensLogique.js) : modifier les
-- deux ensemble.

alter table entreprises add column if not exists type text not null default 'autre';
alter table entreprises drop constraint if exists entreprises_type_check;
alter table entreprises add constraint entreprises_type_check check (type in ('entreprise', 'bet', 'moa', 'autre'));

alter table affaire_interlocuteurs add column if not exists interlocuteur_id uuid references interlocuteurs(id) on delete set null;
create index if not exists affaire_interlocuteurs_interlocuteur on affaire_interlocuteurs (interlocuteur_id);
create index if not exists affaire_interlocuteurs_entreprise on affaire_interlocuteurs (entreprise_id);

-- Supprimer une personne vide le représentant du lot, sans supprimer le lot.
-- La contrainte existante est retrouvée dans pg_constraint, quel que soit son
-- nom réel, puis remplacée par la version nommée.
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'lot_entreprises'::regclass and con.contype = 'f' and att.attname = 'interlocuteur_id'
  loop
    execute format('alter table lot_entreprises drop constraint %I', c);
  end loop;
end $$;
alter table lot_entreprises add constraint lot_entreprises_interlocuteur_id_fkey
  foreign key (interlocuteur_id) references interlocuteurs(id) on delete set null;

-- Sans majuscules, accents ni ponctuation ; pas d'extension unaccent supposée.
-- Les ligatures (œ, æ) s'écrivent en deux lettres avant la translation, pour
-- que « Gros œuvre » et « Gros oeuvre » donnent la même clé.
create or replace function carnet_cle(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(lower(translate(replace(replace(replace(replace(coalesce(t, ''), 'Œ', 'OE'), 'œ', 'oe'), 'Æ', 'AE'), 'æ', 'ae'),
    'ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Reprise : une personne nommée, retrouvée seule dans l'organisation copiée
-- (ou, sans organisation, dans la fiche à son nom)
with candidats as (
  select ai.id as contact_id, i.id as personne_id, i.entreprise_id,
         count(*) over (partition by ai.id) as n
  from affaire_interlocuteurs ai
  join entreprises e
    on carnet_cle(e.raison_sociale) = carnet_cle(coalesce(nullif(btrim(ai.organisation), ''), concat_ws(' ', ai.prenom, ai.nom)))
  join interlocuteurs i
    on i.entreprise_id = e.id and carnet_cle(concat_ws(' ', i.prenom, i.nom)) = carnet_cle(concat_ws(' ', ai.prenom, ai.nom))
  where ai.interlocuteur_id is null and carnet_cle(concat_ws(' ', ai.prenom, ai.nom)) <> ''
    and (ai.entreprise_id is null or ai.entreprise_id = i.entreprise_id)
)
update affaire_interlocuteurs ai
set interlocuteur_id = c.personne_id, entreprise_id = c.entreprise_id
from candidats c
where c.contact_id = ai.id and c.n = 1;

-- Une organisation seule (sans personne retrouvée) : relier la fiche
with candidats as (
  select ai.id as contact_id, e.id as entreprise_id, count(*) over (partition by ai.id) as n
  from affaire_interlocuteurs ai
  join entreprises e on carnet_cle(e.raison_sociale) = carnet_cle(ai.organisation)
  where ai.entreprise_id is null and carnet_cle(ai.organisation) <> ''
)
update affaire_interlocuteurs ai set entreprise_id = c.entreprise_id
from candidats c where c.contact_id = ai.id and c.n = 1;

-- Type déduit, une fois : attributaire d'un lot, puis BET, puis MOA.
-- Seules les fiches encore « autre » (valeur par défaut) sont typées.
update entreprises e set type = 'entreprise'
where e.type = 'autre' and exists (select 1 from lot_entreprises le where le.entreprise_id = e.id);
update entreprises e set type = 'bet'
where e.type = 'autre' and exists (select 1 from affaire_interlocuteurs ai where ai.entreprise_id = e.id and ai.categorie = 'be');
update entreprises e set type = 'moa'
where e.type = 'autre' and exists (select 1 from affaire_interlocuteurs ai where ai.entreprise_id = e.id and ai.categorie = 'moa');

notify pgrst, 'reload schema';
