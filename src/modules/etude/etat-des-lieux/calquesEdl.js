// ─── Calques de l'état des lieux ─────────────────────────────────────────────
//
// Seule liste des calques et des types d'éléments (conception § 3) : la barre
// d'icônes de la visite, les consignes de Claude (lot 3), l'export DXF et le
// rapport (lot 4) la lisent. Un type de plus = une ligne. Les codes de type
// sont uniques tous calques confondus : un point garde son type seul, le
// calque s'en déduit. Pur, testé (tests/etat-des-lieux-visite.test.js).

const t = (code, libelle) => ({ code, libelle })

export const CALQUES = [
  { code: 'pieces', nom: 'EDL-Pièces', libelle: 'Pièces', types: [] },
  { code: 'finitions', nom: 'EDL-Finitions', libelle: 'Finitions', types: [] },
  {
    code: 'plomberie', nom: 'EDL-Plomberie', libelle: 'Plomberie',
    types: [t('lavabo', 'Lavabo'), t('evier', 'Évier'), t('baignoire', 'Baignoire'), t('douche', 'Douche'), t('wc', 'WC'), t('ballon-eau-chaude', 'Ballon d’eau chaude')],
  },
  {
    code: 'electricite', nom: 'EDL-Électricité', libelle: 'Électricité',
    // Libellés de la légende de l'agence (planche « report relevé », 2026-11-19)
    types: [
      t('interrupteur', 'Interrupteur'), t('prise', 'Prise de courant'), t('rj45', 'Prise informatique RJ45'),
      t('luminaire', 'Luminaire'), t('applique', 'Point lumineux en applique'), t('dalle', 'Luminaire plafond carré (dalle)'),
      t('reglette', 'Luminaire linéaire (réglette)'), t('goulotte', 'Goulotte électrique'),
      t('tableau-electrique', 'Tableau électrique'), t('baie-brassage', 'Baie de brassage'),
    ],
  },
  { code: 'chauffage', nom: 'EDL-Chauffage', libelle: 'Chauffage', types: [t('radiateur', 'Radiateur'), t('chaudiere', 'Chaudière'), t('thermostat', 'Thermostat')] },
  { code: 'ventilation', nom: 'EDL-Ventilation', libelle: 'Ventilation', types: [t('bouche-vmc', 'Bouche de VMC'), t('grille', 'Grille'), t('conduit', 'Conduit')] },
  { code: 'menuiseries', nom: 'EDL-Menuiseries', libelle: 'Menuiseries', types: [t('fenetre', 'Fenêtre'), t('porte', 'Porte'), t('placard', 'Placard')] },
  { code: 'occultations', nom: 'EDL-Occultations', libelle: 'Occultations', types: [t('volet', 'Volet'), t('store', 'Store')] },
  // Les cotes dictées accompagnent un élément : pas de point à elles
  { code: 'cotes', nom: 'EDL-Cotes', libelle: 'Cotes', types: [] },
  {
    code: 'compteurs', nom: 'EDL-Compteurs', libelle: 'Compteurs',
    types: [t('compteur-eau', 'Compteur d’eau'), t('compteur-gaz', 'Compteur de gaz'), t('compteur-electricite', 'Compteur d’électricité')],
  },
  {
    code: 'securite', nom: 'EDL-Sécurité', libelle: 'Sécurité',
    types: [t('detecteur-fumee', 'Détecteur de fumée'), t('eclairage-secours', 'Éclairage de secours'), t('extincteur', 'Extincteur')],
  },
  {
    code: 'desordres', nom: 'EDL-Désordres', libelle: 'Désordres',
    types: [t('fissure', 'Fissure'), t('humidite', 'Humidité'), t('degradation', 'Dégradation'), t('materiau-suspect', 'Matériau suspect (amiante, plomb)')],
  },
  { code: 'photos', nom: 'EDL-Photos', libelle: 'Photos', types: [] },
]

export const CALQUES_DE_POINT = CALQUES.filter((c) => c.types.length > 0)

const PAR_TYPE = new Map(CALQUES.flatMap((c) => c.types.map((ty) => [ty.code, { ...ty, calque: c.code }])))

export const calqueEdl = (code) => CALQUES.find((c) => c.code === code) ?? null

export const typeEdl = (code) => (code ? PAR_TYPE.get(code) ?? null : null)

export function libellePoint(point) {
  const type = typeEdl(point?.type)
  return type ? `P${point.numero} · ${type.libelle}` : `P${point?.numero ?? '?'}`
}
