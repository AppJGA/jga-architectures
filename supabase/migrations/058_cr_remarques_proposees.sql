-- Migration 058 : visite enregistrée — remarques proposées par l'IA (lot 2)
--
-- Une proposition est une ligne de cr_remarques comme une autre (remarque ou
-- suite), rangée par destinataire, mais marquée « à valider » : elle
-- apparaît en surbrillance et doit être validée, modifiée ou écartée.
--   · a_valider        — vrai tant que personne ne l'a validée ni modifiée
--   · ia_extrait       — le passage de la réunion qui la justifie
--   · ia_clore_origine — pour une suite : clore la remarque d'origine, mais
--                        seulement au moment de la validation
--   · enregistrement_id — l'enregistrement analysé (migration 057)
--
-- Le verrou : un compte rendu ne passe pas à « émis » tant qu'il garde une
-- proposition à valider. L'écran prévient avant ; la base garantit. Une
-- proposition ne peut donc atteindre ni un CR diffusé ni la visite suivante.
--
-- cr_enregistrements.analyse_le : un enregistrement déjà analysé ne repart
-- pas à l'IA (et n'est pas facturé deux fois).
--
-- Rejouable.

alter table cr_remarques
  add column if not exists a_valider boolean not null default false,
  add column if not exists ia_extrait text,
  add column if not exists ia_clore_origine boolean not null default false,
  add column if not exists enregistrement_id uuid references cr_enregistrements(id) on delete set null;

create index if not exists cr_remarques_a_valider on cr_remarques(cr_id) where a_valider;

alter table cr_enregistrements
  add column if not exists analyse_le timestamptz,
  add column if not exists cout_estime numeric;

create or replace function cr_verifier_propositions() returns trigger
language plpgsql as $$
begin
  if new.statut = 'emis' and old.statut is distinct from 'emis'
     and exists (select 1 from cr_remarques where cr_id = new.id and a_valider) then
    raise exception 'Des remarques proposées restent à valider : validez-les, modifiez-les ou écartez-les avant d''émettre.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists comptes_rendus_propositions on comptes_rendus;
create trigger comptes_rendus_propositions
  before update on comptes_rendus
  for each row execute function cr_verifier_propositions();

notify pgrst, 'reload schema';
