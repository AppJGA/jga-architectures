-- Migration 017 : Ajout du champ interlocuteur_id dans cr_remarques
-- Permet d'attribuer une remarque à un interlocuteur (MOA, MOE, BE...)
-- en plus de l'attribution à un lot (lot_id) déjà existante.
-- Les deux champs sont mutuellement exclusifs (gérés côté application).

alter table cr_remarques
  add column if not exists interlocuteur_id uuid
    references affaire_interlocuteurs(id) on delete set null;
