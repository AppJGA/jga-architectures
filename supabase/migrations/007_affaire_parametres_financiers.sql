-- Migration 007 : Paramètres financiers de l'affaire

alter table affaires
  add column if not exists taux_tva numeric(5,4) not null default 1.20,
  -- 1.20 = TVA 20% (neuf / tertiaire)
  -- 1.10 = TVA 10% (réhabilitation résidentielle)
  -- 1.055 = TVA 5.5% (réhabilitation logement social)
  add column if not exists seuil_aleas_pct numeric(5,2) not null default 5.00;
  -- Pourcentage du marché de base au-delà duquel une alerte est déclenchée
