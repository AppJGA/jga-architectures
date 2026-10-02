// Sections habituelles d'un compte rendu de l'agence (titres seuls). Sert au
// modèle de sections d'une affaire et au départ des généralités (I à V).
export const DEFAULT_TEMPLATE_SECTIONS = [
  { numero_romain: 'I',   titre: 'MISE AU POINT ADMINISTRATIVE',        ordre: 0, sous_sections: [
    { code: '1-1', titre: 'Réunion de chantier' },
    { code: '1-2', titre: 'Situation de travaux - DGD' },
    { code: '1-3', titre: 'Marché - Ordre de service' },
  ]},
  { numero_romain: 'II',  titre: 'COORDINATION - SANTÉ - SÉCURITÉ',     ordre: 1, sous_sections: [
    { code: '1-1', titre: 'Chantier propre' },
    { code: '1-2', titre: 'SPS' },
  ]},
  { numero_romain: 'III', titre: 'MISE AU POINT TECHNIQUE - INTERVENTION', ordre: 2, sous_sections: [
    { code: '1-1', titre: 'Installation de chantier' },
    { code: '1-2', titre: 'Planning' },
  ]},
  { numero_romain: 'IV',  titre: 'RESPECT',                              ordre: 3, sous_sections: [] },
  { numero_romain: 'V',   titre: 'PLANS - DOCUMENTS - RÉSERVATIONS',     ordre: 4, sous_sections: [
    { code: '1-1', titre: 'Fiches techniques et nuanciers' },
    { code: '1-2', titre: 'Plans EXE' },
  ]},
  { numero_romain: 'VI',  titre: 'ÉQUIPE MOE ET MOA',                    ordre: 5, sous_sections: [] },
  { numero_romain: 'VII', titre: 'ENTREPRISES',                          ordre: 6, sous_sections: [] },
]
