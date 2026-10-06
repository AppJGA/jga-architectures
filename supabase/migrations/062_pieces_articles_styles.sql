-- Migration 062 : pièces écrites — mise en forme des articles
--
-- Gras, italique et souligné d'origine, relevés à la lecture du PDF (nom de
-- la police, traits sous le texte), gardés à part du texte pour ne pas
-- gêner la recherche : [[début, fin, code]], code = g (gras), i (italique),
-- s (souligné), combinables (« gs »). Les CCTP importés avant cette
-- migration n'en ont pas : les réimporter pour la retrouver.
--
-- Rejouable.

alter table pieces_articles add column if not exists styles jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
