-- ─── État des lieux : « Remplacer les plans » même après une visite ─────────
--
-- La 079 refusait la suppression d'un état des lieux qui avait une visite
-- (`edl_etats_garde_visites`). À la demande de l'agence (2026-11-18), le
-- bouton reste toujours proposé : une fenêtre d'avertissement dit ce qui sera
-- perdu (étages, pièces, visites, points, photos), puis tout part par
-- cascade (edl_visites → edl_points, edl_photos, edl_evenements). Les
-- fichiers des photos sont retirés par l'application ; ceux qui resteraient
-- sont rattrapés par `fichiers_orphelins()` (« Nettoyer le stockage »).
-- Rejouable.

drop trigger if exists edl_etats_garde_visites on edl_etats;
drop function if exists edl_etats_garde_visites();
