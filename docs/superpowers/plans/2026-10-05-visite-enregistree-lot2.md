# Visite enregistrée — lot 2 : remarques proposées par l'IA — réalisation

**Spec :** `docs/superpowers/specs/2026-10-05-visite-enregistree-ia-design.md`
(§ 1 « Faire proposer », « Valider », « Ce que l'IA propose » ; § 4 ; § 5).

## Ce qui a été fait

| Fichier | Rôle |
|---|---|
| `supabase/migrations/058_cr_remarques_proposees.sql` | `a_valider`, `ia_extrait`, `ia_clore_origine`, `enregistrement_id` ; `analyse_le`, `cout_estime` ; verrou d'émission |
| `enregistrement/analyseIaLogique.js` (testé) | Contexte à références courtes, consignes, schéma de l'outil, lecture du flux, relecture tolérante, coût, propositions à valider, écritures de validation |
| `api/analyser-visite.js` | Fonction **Edge** : session agence, Claude `claude-sonnet-5-5`, sortie imposée par outil, réponse en flux |
| `enregistrement/propositions.js` | Proposer (analyse des enregistrements non analysés, création par les chemins habituels), valider, écarter |
| `enregistrement/Proposition.jsx`, `styleProposition.js` | Carte en surbrillance bleue, extrait entendu, Valider / Modifier / Écarter, bandeau |
| `ModeVisite.jsx`, `CrSectionEditor.jsx`, `CrDetail.jsx` | Branchement ; modifier une proposition la valide ; émission refusée avec message |
| `crLogique.js` | La reprise n'emporte pas une proposition non validée |
| `rapportLogique.js` | Aperçu PDF d'un brouillon : « (proposée, à valider) » |

## Choix

- **Consignes côté serveur** : la fonction construit la demande à partir de
  `analyseIaLogique.js` ; le navigateur n'envoie que des données. Elle est
  « Edge » (assemblée par Vercel avec ses imports) et renvoie le flux de
  l'API : la réponse commence en quelques secondes, une longue réunion ne
  bute pas sur la durée maximale d'une fonction classique.
- **L'IA ne voit aucun identifiant** : L1, I2, Z1, R41, retraduits par l'app.
- **Une suite qui clôt** sa remarque d'origine ne la clôt qu'à la validation.
- **Sans destinataire** : la remarque va dans « À attribuer » (partie VII) ;
  « Choisir et valider » ouvre la modification, et enregistrer valide.
- **Un enregistrement analysé** (`analyse_le`) ne repart pas à l'IA.

## Vérifications

- Tests purs (`tests/analyse-ia.test.js`, reprise dans `comptes-rendus.test.js`).
- Fonction : Supabase et Anthropic simulés (401, 403, 503, transcription
  vide, flux transmis, consignes et outil imposés, 413) ; assemblage par
  rolldown en un fichier autonome.
- Navigateur (mode Visite et éditeur de bureau, analyse simulée) :
  3 propositions créées, suite qui clôt la n° 41 à la validation, écart,
  « Choisir et valider » → destinataire → validée, bandeau qui disparaît.

## Reste

- Essai réel avec la clé Anthropic (compte personnel de Victor) et la
  migration 058.
- Lot 3 : exemples de rédaction tirés des CR émis, guide de l'agence,
  vocabulaire du métier pour la transcription.
