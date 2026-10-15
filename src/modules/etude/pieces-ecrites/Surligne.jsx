// Mots trouvés surlignés ; gras, italique et souligné du CCTP d'origine
// gardés, pour distinguer titres, références et réserves comme sur le papier
export function Surligne({ morceaux }) {
  return morceaux.map((m, i) => {
    const style = {
      fontWeight: m.gras ? 700 : undefined,
      fontStyle: m.italique ? 'italic' : undefined,
      textDecoration: m.souligne ? 'underline' : undefined,
    }
    return m.surligne
      ? <mark key={i} style={{ ...style, background: '#FDE68A', color: 'inherit', padding: 0 }}>{m.texte}</mark>
      : <span key={i} style={style}>{m.texte}</span>
  })
}
