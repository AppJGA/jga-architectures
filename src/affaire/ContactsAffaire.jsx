import { ChevronRight, Phone, Mail } from 'lucide-react'
import { useAffaireInterlocuteurs, CATEGORIE_META } from '../shared/hooks/useAffaireInterlocuteurs'
import { useLotsEntreprises } from '../shared/hooks/useLotsEntreprises'
import { annuaireAffaire, lienTelephone, telephones } from './annuaireLogique'

const LIEN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, color: '#1F1B17', textDecoration: 'none',
  // Une adresse e-mail longue ne doit pas élargir la fiche
  overflowWrap: 'anywhere', minHeight: 24,
}

function Fiche({ fiche, couleur }) {
  const numeros = telephones(fiche.telephone)
  return (
    <div style={{
      border: '0.5px solid rgba(0,0,0,0.08)', backgroundColor: '#FAFAF9',
      padding: '10px 12px', minWidth: 0,
    }}>
      <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: couleur ?? 'var(--jga-beige)', margin: '0 0 3px' }}>
        {fiche.role}
      </p>
      <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', margin: 0 }}>{fiche.nom}</p>
      {fiche.detail && (
        <p style={{ fontSize: 11, color: '#7A736E', margin: '1px 0 0' }}>{fiche.detail}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
        {/* Un numéro écrit d'une façon que le téléphone ne compose pas reste lisible */}
        {numeros.length === 0 && fiche.telephone && (
          <span style={{ ...LIEN, color: '#7A736E' }}><Phone size={12} strokeWidth={1.5} style={{ flexShrink: 0 }} />{fiche.telephone}</span>
        )}
        {numeros.map((n) => (
          <a key={n} href={lienTelephone(n)} style={LIEN}>
            <Phone size={12} strokeWidth={1.5} color="var(--jga-orange)" style={{ flexShrink: 0 }} />{n}
          </a>
        ))}
        {fiche.email && (
          <a href={`mailto:${fiche.email}`} style={LIEN}>
            <Mail size={12} strokeWidth={1.5} color="var(--jga-orange)" style={{ flexShrink: 0 }} />{fiche.email}
          </a>
        )}
        {!fiche.telephone && !fiche.email && (
          <span style={{ fontSize: 11, color: 'var(--jga-beige)' }}>Pas de coordonnées</span>
        )}
      </div>
    </div>
  )
}

function Groupe({ titre, fiches, couleur }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#5E5854', margin: '0 0 8px' }}>{titre}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {fiches.map((f) => <Fiche key={f.cle} fiche={f} couleur={couleur?.(f)} />)}
      </div>
    </div>
  )
}

// Les coordonnées de tous ceux qu'on peut avoir à joindre sur l'affaire, à un
// geste : interlocuteurs (ceux des visites de chantier) et représentants des
// entreprises de chaque lot.
export function ContactsAffaire({ affaireId, canEdit, onGerer, style }) {
  const { interlocuteurs, loading: chargeInterlo } = useAffaireInterlocuteurs(affaireId)
  const { lots, loading: chargeLots } = useLotsEntreprises(affaireId)
  const annuaire = annuaireAffaire({ interlocuteurs, lots })
  const vide = annuaire.interlocuteurs.length === 0 && annuaire.entreprises.length === 0

  return (
    <div className="jga-entree-carte" style={{
      backgroundColor: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>Contacts</span>
        {canEdit && (
          <button
            type="button"
            onClick={onGerer}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--jga-orange)',
            }}
          >
            Gérer les interlocuteurs <ChevronRight size={12} strokeWidth={1.25} />
          </button>
        )}
      </div>

      {vide ? (
        <p style={{ fontSize: 12, color: 'var(--jga-beige)', margin: 0 }}>
          {chargeInterlo || chargeLots
            ? 'Chargement…'
            : 'Aucun contact pour l’instant : ajoutez les interlocuteurs, et attribuez les lots dans « Entreprises & Lots ».'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {annuaire.interlocuteurs.length > 0 && (
            <Groupe titre="Interlocuteurs" fiches={annuaire.interlocuteurs} couleur={(f) => CATEGORIE_META[f.categorie]?.color} />
          )}
          {annuaire.entreprises.length > 0 && (
            <Groupe titre="Entreprises" fiches={annuaire.entreprises} />
          )}
        </div>
      )}
    </div>
  )
}
