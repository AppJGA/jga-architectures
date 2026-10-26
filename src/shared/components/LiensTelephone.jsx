import { Phone, Smartphone } from 'lucide-react'
import { numerosFiche, texteTelephones } from '../telephones'
import { lienTelephone } from '../../affaire/annuaireLogique'

// Les numéros d'une fiche, chacun cliquable pour appeler : le combiné pour un
// fixe, le téléphone mobile pour un portable. Un texte qui n'a pas l'air d'un
// numéro reste lisible, sans lien.
export function LiensTelephone({ fixe, portable, taille = 11, couleurIcone = '#9C9591', style, enLigne = false }) {
  const numeros = numerosFiche(fixe, portable)
  const brut = texteTelephones(fixe, portable)
  if (!brut) return null
  const lien = { color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, ...style }
  return (
    <span style={{ display: 'flex', flexDirection: enLigne ? 'row' : 'column', flexWrap: 'wrap', gap: enLigne ? '2px 12px' : 4 }}>
      {numeros.length === 0 && (
        <span style={lien}><Phone size={taille} style={{ color: couleurIcone, flexShrink: 0 }} />{brut}</span>
      )}
      {numeros.map(({ numero, portable: estPortable }) => {
        const Icone = estPortable ? Smartphone : Phone
        return (
          <a key={numero} href={lienTelephone(numero)} style={lien} title={estPortable ? 'Portable' : 'Fixe'}>
            <Icone size={taille} style={{ color: couleurIcone, flexShrink: 0 }} />{numero}
          </a>
        )
      })}
    </span>
  )
}
