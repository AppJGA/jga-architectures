-- Migration 049 : avancement par lot figé dans le compte rendu
--
-- L'avancement affiché vient du planning chantier (`planning.avancement`), qui
-- continue de vivre après la réunion. Un CR émis doit montrer les chiffres du
-- jour de la visite : ils sont recopiés à l'émission, lot par lot.
--
-- Forme : [{"lot_id": uuid|null, "nom": "Lot 01 — Gros œuvre", "couleur": "#…",
--           "realise": 80, "prevu": 60, "taches": 2, "jours": 25}]

alter table comptes_rendus
  add column if not exists avancement_lots jsonb;

notify pgrst, 'reload schema';
