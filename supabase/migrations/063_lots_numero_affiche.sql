-- Migration 063 : numéro de lot tel que saisi (« 01 », « 060 »)
--
-- `lots.numero` est un nombre (tri, unicité par affaire) : « 060 » y devient
-- 60. Le texte saisi est gardé à côté et c'est lui que l'application affiche
-- (`numeroLot`, src/shared/lots/numeroLot.js). Vide : le nombre suffit.
--
-- Les copies d'historique suivent : présences des CR et des OPR, destinataire
-- d'une remarque (tenu par la base). Les CR déjà émis gardent leurs copies
-- d'origine.
--
-- Rejouable.

alter table lots add column if not exists numero_affiche text;
alter table cr_presences add column if not exists copie_lot_numero_affiche text;

do $$
begin
  if to_regclass('public.opr_presences') is not null then
    alter table opr_presences add column if not exists copie_lot_numero_affiche text;
  end if;
end $$;

-- Le destinataire recopié dans chaque remarque prend le numéro saisi
create or replace function cr_remarque_copie_destinataire() returns trigger
language plpgsql as $$
begin
  if new.lot_id is not null then
    select case
             when l.numero is null and coalesce(l.numero_affiche, '') = '' then l.nom
             else 'Lot ' || coalesce(nullif(l.numero_affiche, ''), l.numero::text) || ' — ' || l.nom
           end
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

notify pgrst, 'reload schema';
