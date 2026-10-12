// Petite marque d'une échéance liée à une carte Notion : un « N » dans un
// carré, lisible à 12 px, sans le logo de la marque (aucun dessin de tiers).
export function MarqueNotion({ size = 12, title = 'Liée à Notion' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" role="img" aria-label={title} style={{ flexShrink: 0 }}>
      <title>{title}</title>
      <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill="white" stroke="#37352F" />
      <path d="M3.5 9V3l5 6V3" fill="none" stroke="#37352F" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
