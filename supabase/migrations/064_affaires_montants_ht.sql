-- Migration 064 : montants de l'affaire en HT
--
-- À l'agence, c'est le HT qui prime : enveloppe, travaux et honoraires se
-- saisissent et s'affichent en HT, le TTC en petit. Le HT est enregistré (un
-- changement de taux de TVA ne doit pas le faire varier après coup) ; le TTC
-- reste enregistré à côté, calculé depuis le HT par l'application, pour les
-- écrans et sauvegardes qui le lisent.
--
-- Les affaires existantes reçoivent leur HT depuis le TTC et le taux de TVA
-- de l'affaire.
--
-- Rejouable.

alter table affaires add column if not exists enveloppe_ht numeric;
alter table affaires add column if not exists montant_travaux_ht numeric;
alter table affaires add column if not exists honoraires_ht numeric;

update affaires set enveloppe_ht = round(enveloppe_ttc / coalesce(nullif(taux_tva, 0), 1.2), 2)
  where enveloppe_ht is null and enveloppe_ttc is not null;
update affaires set montant_travaux_ht = round(montant_travaux_ttc / coalesce(nullif(taux_tva, 0), 1.2), 2)
  where montant_travaux_ht is null and montant_travaux_ttc is not null;
update affaires set honoraires_ht = round(honoraires_ttc / coalesce(nullif(taux_tva, 0), 1.2), 2)
  where honoraires_ht is null and honoraires_ttc is not null;

notify pgrst, 'reload schema';
