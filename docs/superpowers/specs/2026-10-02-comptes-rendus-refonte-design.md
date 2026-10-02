# Comptes rendus de chantier : refonte

Validé avec Victor le 2026-10-02, à partir de son CR n°30 de Meillonnas
(structure cible). Trois chantiers successifs, chacun livré seul :

1. **Remarques (parties VI et VII)** — ce document, § 1.
2. **Généralités (parties I à V)** — § 2.
3. **Mise en page du PDF et de l'écran** — à présenter après 1 et 2.

Constat de départ : les parties I à V sont des sections comme les autres, leur
texte n'y entre que sous forme de remarques ; une remarque se range à la main
dans une section et une sous-section ; le destinataire n'est proposé que dans
certaines sections et n'est jamais prérempli ; une sous-remarque (▶) n'a pas
de statut propre. Base : 6 CR, 4 remarques — la restructuration ne menace
aucune donnée.

## 1. Remarques (VI et VII)

### Règles

- **Toute remarque a un destinataire** : un lot (`lot_id`, partie VII) ou un
  interlocuteur de l'affaire (`interlocuteur_id`, partie VI). Plus de section ni
  de sous-section choisie à la main pour une nouvelle remarque.
- **Rangement calculé** : VI groupée par rôle de l'interlocuteur (libellé de
  catégorie : « Maitre d'oeuvre », « CSPS », « BET Electricité »…), VII par lot
  dans l'ordre des numéros. Tous les lots de l'affaire sont proposés, même sans
  entreprise. Une ancienne remarque sans destinataire va dans « À attribuer ».
- **Destinataire proposé** : celui de la dernière remarque créée sur l'appareil
  pour ce CR. Le « + » d'un titre de groupe crée une remarque pour ce
  destinataire.
- **Toucher une remarque** ouvre « Ajouter une suite » : texte, statut (À faire
  par défaut), Pour le, case « Clore la remarque d'origine » ; bouton Modifier
  pour la remarque elle-même.
- **Une sous-remarque a son propre statut et sa propre échéance** (colonnes
  `statut`, `date_echeance` de la ligne fille) ; `est_clos` s'en déduit comme
  pour une remarque (migration 054, déclencheur).
- Même panneau de saisie à la tablette (mode Visite) et à l'ordinateur.
  Filtres actuels conservés.
- Remarques des intervenants extérieurs : toujours regroupées à part, signées.
- Inchangé : reprise (ouvertes + closes de la dernière visite une fois), photos,
  plans, FTM, zones, hors ligne, verrou des CR émis.
- PDF : VI et VII rangées par destinataire dès ce chantier ; sous-remarques
  avec leur statut.

## 2. Généralités (I à V)

- **Une version par affaire**, imprimée dans tous ses CR, modifiable à tout
  moment. **Copiée dans le CR à l'émission** : un CR émis garde la version de
  son jour (même principe que `avancement_lots`).
- Structure : parties (numéro romain, titre) → rubriques (code, titre) →
  paragraphes (date « Note du », texte, marque de suite ▶).
- Bouton « Généralités » sur la page du CR : éditeur ; « Importer d'une autre
  affaire » remplace tout (confirmation). Pas de texte modèle ; une affaire vide
  peut partir des cinq titres habituels, sans contenu.
- PDF : après les présences, avant VI et VII.
- Lecture pour les membres de l'affaire (intervenants extérieurs compris),
  écriture agence seule (règles `acces_affaire` / `est_agence`).
- Migration 055.
