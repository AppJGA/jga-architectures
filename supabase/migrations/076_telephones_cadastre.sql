-- Migration 076 : téléphone fixe et portable, plusieurs références cadastrales
--
-- 1. Deux numéros pour chaque organisation et chaque personne (carnet,
--    interlocuteurs d'affaire, maître d'ouvrage) : la colonne `telephone`
--    d'origine devient le fixe, le portable a sa propre colonne. Les numéros
--    déjà saisis sont répartis : ceux en 06 / 07 (+33 6, +33 7) passent au
--    portable, tout le reste reste au fixe — rien ne se perd. Un champ qui
--    portait deux numéros (« 03 … / 06 … ») est partagé entre les deux.
--    Règle jumelle de `repartirNumeros` (src/shared/telephones.js).
--    Les présences des CR et des OPR gardent leur copie : un CR émis imprime
--    ce qu'il imprimait ; un brouillon reçoit le portable à sa prochaine
--    ouverture.
--
-- 2. Plusieurs sections cadastrales par affaire : `affaires.cadastre_references`
--    (jsonb, [{ section, parcelles, superficie }]). La référence actuelle de
--    chaque affaire en devient la première ligne. Les anciennes colonnes
--    restent, tenues à jour par l'app (première section, superficie totale).
--
-- Aucune table créée : les droits d'API ne changent pas. Rejouable.

-- ── 1. Téléphones ─────────────────────────────────────────────────────────────

alter table entreprises            add column if not exists telephone_portable text;
alter table interlocuteurs         add column if not exists telephone_portable text;
alter table affaire_interlocuteurs add column if not exists telephone_portable text;
alter table affaires               add column if not exists moa_telephone_portable text;
alter table cr_presences           add column if not exists copie_telephone_portable text;
alter table opr_presences          add column if not exists copie_telephone_portable text;

-- Morceaux d'un champ, dans l'ordre de saisie
create or replace function public.jga_tel_morceaux(texte text)
returns table (morceau text, rang bigint)
language sql immutable set search_path = '' as $$
  select trim(m), n
  from regexp_split_to_table(coalesce(texte, ''), '\s*[/;,\n]\s*|\s{2,}') with ordinality as t(m, n)
  where trim(m) <> ''
$$;

create or replace function public.jga_tel_est_portable(morceau text)
returns boolean
language sql immutable set search_path = '' as $$
  select regexp_replace(morceau, '[^0-9+]', '', 'g') ~ '^(0[67]|\+33[67]|0033[67])'
     and length(regexp_replace(morceau, '\D', '', 'g')) >= 6
$$;

create or replace function public.jga_tel_portable(texte text)
returns text
language sql immutable set search_path = '' as $$
  select string_agg(morceau, ' / ' order by rang)
  from public.jga_tel_morceaux(texte)
  where public.jga_tel_est_portable(morceau)
$$;

create or replace function public.jga_tel_fixe(texte text)
returns text
language sql immutable set search_path = '' as $$
  select string_agg(morceau, ' / ' order by rang)
  from public.jga_tel_morceaux(texte)
  where not public.jga_tel_est_portable(morceau)
$$;

-- Seules les lignes sans portable et dont le champ en contient un : un
-- second passage ne touche plus rien
update entreprises
   set telephone_portable = public.jga_tel_portable(telephone),
       telephone = public.jga_tel_fixe(telephone)
 where telephone_portable is null and public.jga_tel_portable(telephone) is not null;

update interlocuteurs
   set telephone_portable = public.jga_tel_portable(telephone),
       telephone = public.jga_tel_fixe(telephone)
 where telephone_portable is null and public.jga_tel_portable(telephone) is not null;

update affaire_interlocuteurs
   set telephone_portable = public.jga_tel_portable(telephone),
       telephone = public.jga_tel_fixe(telephone)
 where telephone_portable is null and public.jga_tel_portable(telephone) is not null;

update affaires
   set moa_telephone_portable = public.jga_tel_portable(moa_telephone),
       moa_telephone = public.jga_tel_fixe(moa_telephone)
 where moa_telephone_portable is null and public.jga_tel_portable(moa_telephone) is not null;

-- Outils de la répartition seulement : rien d'autre ne s'en sert
drop function public.jga_tel_fixe(text);
drop function public.jga_tel_portable(text);
drop function public.jga_tel_est_portable(text);
drop function public.jga_tel_morceaux(text);

-- ── 2. Références cadastrales ────────────────────────────────────────────────

alter table affaires add column if not exists cadastre_references jsonb not null default '[]'::jsonb;

update affaires
   set cadastre_references = jsonb_build_array(jsonb_build_object(
         'section', nullif(trim(coalesce(cadastre_section, '')), ''),
         'parcelles', nullif(trim(coalesce(cadastre_parcelle, '')), ''),
         'superficie', cadastre_superficie))
 where cadastre_references = '[]'::jsonb
   and (coalesce(trim(cadastre_section), '') <> ''
     or coalesce(trim(cadastre_parcelle), '') <> ''
     or cadastre_superficie is not null);

notify pgrst, 'reload schema';
