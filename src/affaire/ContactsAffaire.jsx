import { useState } from 'react'
import { ChevronRight, ChevronDown, Phone, Mail, UserPlus, Download, Pencil } from 'lucide-react'
import { useAffaireInterlocuteurs, CATEGORIE_META } from '../shared/hooks/useAffaireInterlocuteurs'
import { useLotsEntreprises } from '../shared/hooks/useLotsEntreprises'
import { annuaireAffaire, lienTelephone, telephones } from './annuaireLogique'
import { ModaleInterlocuteur } from '../modules/chantier/comptes-rendus/InterlocuteursModal'
import { vcard, vcards, csvOutlook, nomFichierContacts, nomFichierContact } from './exportContactsLogique'

// Le fichier est fabriqué dans la page : rien ne passe par Supabase
function telecharger(texte, type, nom) {
  const url = URL.createObjectURL(new Blob([texte], { type }))
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const TYPE_VCARD = 'text/vcard;charset=utf-8'

const LIEN = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, color: '#1F1B17', textDecoration: 'none',
  // Une adresse e-mail longue ne doit pas élargir la fiche
  overflowWrap: 'anywhere', minHeight: 24,
}

const BOUTON_FICHE = {
  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer', color: '#9C9591', padding: 0,
}

function Fiche({ fiche, couleur, onExporter, onModifier }) {
  const numeros = telephones(fiche.telephone)
  const marge = onModifier ? 60 : 28
  return (
    <div style={{
      position: 'relative',
      border: '0.5px solid rgba(0,0,0,0.08)', backgroundColor: '#FAFAF9',
      padding: '10px 12px', minWidth: 0,
    }}>
      <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex' }}>
        {onModifier && (
          <button type="button" onClick={() => onModifier(fiche)} title="Modifier cet interlocuteur"
            aria-label={`Modifier ${fiche.nom}`} style={BOUTON_FICHE}>
            <Pencil size={14} strokeWidth={1.5} />
          </button>
        )}
        <button type="button" onClick={() => onExporter(fiche)} title="Ajouter ce contact au téléphone (.vcf)"
          aria-label={`Ajouter ${fiche.nom} au téléphone`} style={BOUTON_FICHE}>
          <UserPlus size={14} strokeWidth={1.5} />
        </button>
      </div>
      <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: couleur ?? 'var(--jga-beige)', margin: `0 ${marge}px 3px 0` }}>
        {fiche.role}
      </p>
      <p style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17', margin: `0 ${marge}px 0 0` }}>{fiche.nom}</p>
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
            <Phone size={12} strokeWidth={1.5} color="var(--affaire-accent, var(--jga-orange))" style={{ flexShrink: 0 }} />{n}
          </a>
        ))}
        {fiche.email && (
          <a href={`mailto:${fiche.email}`} style={LIEN}>
            <Mail size={12} strokeWidth={1.5} color="var(--affaire-accent, var(--jga-orange))" style={{ flexShrink: 0 }} />{fiche.email}
          </a>
        )}
        {!fiche.telephone && !fiche.email && (
          <span style={{ fontSize: 11, color: 'var(--jga-beige)' }}>Pas de coordonnées</span>
        )}
      </div>
    </div>
  )
}

function ChoixExport({ titre, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF7F2' }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
        background: 'transparent', border: 'none', cursor: 'pointer',
      }}
    >
      <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#1F1B17' }}>{titre}</span>
      <span style={{ display: 'block', fontSize: 11, color: '#7A736E', marginTop: 2 }}>{detail}</span>
    </button>
  )
}

function Groupe({ titre, fiches, couleur, onExporter, onModifier }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#5E5854', margin: '0 0 8px' }}>{titre}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {fiches.map((f) => <Fiche key={f.cle} fiche={f} couleur={couleur?.(f)} onExporter={onExporter} onModifier={onModifier} />)}
      </div>
    </div>
  )
}

// Les coordonnées de tous ceux qu'on peut avoir à joindre sur l'affaire, à un
// geste : interlocuteurs (ceux des visites de chantier) et représentants des
// entreprises de chaque lot.
export function ContactsAffaire({ affaire, affaireId, canEdit, onGerer, style }) {
  const { interlocuteurs, loading: chargeInterlo, updateInterlocuteur, deleteInterlocuteur } = useAffaireInterlocuteurs(affaireId)
  // Le crayon d'une fiche : modifier l'interlocuteur sans passer par la fiche de l'affaire
  const [aModifier, setAModifier] = useState(null)
  const modifier = (fiche) => setAModifier(interlocuteurs.find((i) => `interlo:${i.id}` === fiche.cle) ?? null)
  const { lots, loading: chargeLots } = useLotsEntreprises(affaireId)
  const [menuExport, setMenuExport] = useState(false)
  const annuaire = annuaireAffaire({ interlocuteurs, lots })
  const tous = [...annuaire.interlocuteurs, ...annuaire.entreprises]
  const vide = tous.length === 0

  const exporterUn = (fiche) => telecharger(vcard(fiche, affaire), TYPE_VCARD, nomFichierContact(fiche))
  const exporterTous = (format) => {
    setMenuExport(false)
    if (format === 'vcf') telecharger(vcards(tous, affaire), TYPE_VCARD, nomFichierContacts(affaire, 'vcf'))
    else telecharger(csvOutlook(tous, affaire), 'text/csv;charset=utf-8', nomFichierContacts(affaire, 'csv'))
  }

  return (
    <div className="jga-entree-carte" style={{
      backgroundColor: 'white', border: '0.5px solid rgba(0,0,0,0.08)', padding: 20, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#1F1B17' }}>Contacts</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {!vide && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setMenuExport((o) => !o)}
              aria-expanded={menuExport}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--affaire-accent, var(--jga-orange))', padding: '6px 0',
              }}
            >
              <Download size={12} strokeWidth={1.5} /> Exporter <ChevronDown size={12} strokeWidth={1.25} />
            </button>
            {menuExport && (
              <>
                {/* Un clic n'importe où ailleurs referme le menu */}
                <div onClick={() => setMenuExport(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 21, width: 270,
                  maxWidth: 'calc(100vw - 32px)',
                  backgroundColor: 'white', border: '0.5px solid rgba(0,0,0,0.12)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.10)', padding: 4,
                }}>
                  <ChoixExport
                    titre="Pour le téléphone"
                    detail="Fichier .vcf : à l’ouverture, l’iPhone propose d’ajouter tous les contacts."
                    onClick={() => exporterTous('vcf')}
                  />
                  <ChoixExport
                    titre="Pour Outlook"
                    detail="Fichier .csv : dans Outlook, Fichier › Ouvrir et exporter › Importer/Exporter."
                    onClick={() => exporterTous('csv')}
                  />
                </div>
              </>
            )}
          </div>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onGerer}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--affaire-accent, var(--jga-orange))',
            }}
          >
            Gérer les interlocuteurs <ChevronRight size={12} strokeWidth={1.25} />
          </button>
        )}
        </div>
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
            <Groupe titre="Interlocuteurs" fiches={annuaire.interlocuteurs} couleur={(f) => CATEGORIE_META[f.categorie]?.color} onExporter={exporterUn}
              onModifier={canEdit ? modifier : undefined} />
          )}
          {annuaire.entreprises.length > 0 && (
            <Groupe titre="Entreprises" fiches={annuaire.entreprises} onExporter={exporterUn} />
          )}
        </div>
      )}
      {aModifier && (
        <ModaleInterlocuteur
          interlocuteur={aModifier}
          onEnregistrer={(data) => updateInterlocuteur(aModifier.id, data)}
          onSupprimer={() => deleteInterlocuteur(aModifier.id)}
          onFermer={() => setAModifier(null)}
        />
      )}
    </div>
  )
}
