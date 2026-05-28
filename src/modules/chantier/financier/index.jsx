import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Printer, TrendingUp, X, AlertTriangle, FilePen } from 'lucide-react'
import { useSuiviFinancier } from '../../../shared/hooks/useSuiviFinancier'
import { useAffaire } from '../../../shared/hooks/useAffaires'
import { useFtm } from '../../../shared/hooks/useFtm'
import { supabase } from '../../../core/supabase/client'
import { AffaireFormModal } from '../../../dashboard/AffaireFormModal'
import { FtmFormModal } from '../ftm/FtmFormModal'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CAT = {
  aleas:          { label: 'Aléa chantier',    color: '#E05A1E', bg: '#FAF0EB', emoji: '🔶' },
  adaptation_moe: { label: 'Adapt./Err. MOE',  color: '#4B5563', bg: '#F3F4F6', emoji: '🔧' },
  demande_mo:     { label: 'Demande MO',       color: '#2563EB', bg: '#EFF6FF', emoji: '👤' },
}

const STATUT = {
  avenant_signe: { label: 'Avenant signé', bg: '#EAF3DE', color: '#3B6D11' },
  devis_valide:  { label: 'Devis validé',  bg: '#FAF0EB', color: '#993C1D' },
  en_attente:    { label: 'En attente',    bg: '#FEF3C7', color: '#92400E' },
  refuse:        { label: 'Refusé',        bg: '#F1EFE8', color: '#9B8F85' },
}

const FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'avenant_signe', label: 'Avenants signés' },
  { id: 'devis_valide',  label: 'Devis validés' },
  { id: 'en_attente',    label: 'En attente' },
  { id: 'refuse',        label: 'Refusés' },
]

const PLACEHOLDERS = {
  aleas:          'Ex : Travaux supplémentaires suite découverte amiante…',
  adaptation_moe: 'Ex : Correction des plans de réservations…',
  demande_mo:     "Ex : Ajout d'une cloison demandée par le MO…",
}

// Flex widths partagés
const C = { des: 3, ent: 2, ale: 1.5, ada: 1.5, mo: 1.5, ht: 1.5, pct: 0.8, ttc: 1.5, act: 0.5 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function euro(v) {
  if (v == null || v === 0) return null
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function pct(v) {
  if (v == null) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)} %`
}

function colorDelta(v) {
  if (v <= 0) return '#639922'
  if (v <= 5) return '#E05A1E'
  return '#DC2626'
}

function montantColor(v, cat) {
  if (!v) return 'var(--jga-beige)'
  if (v < 0) return '#639922'
  if (cat === 'aleas') return '#E05A1E'
  if (cat === 'demande_mo') return '#2563EB'
  return '#DC2626'
}

function formatTvaPct(tva) {
  if (!tva) return '20 %'
  const p = (tva - 1) * 100
  return p % 1 === 0 ? `${p.toFixed(0)} %` : `${p.toFixed(1).replace('.', ',')} %`
}

// ─── Styles partagés ──────────────────────────────────────────────────────────

const INPUT = {
  height: 38, padding: '0 12px', fontSize: 13, color: '#1a1a1a',
  border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8,
  backgroundColor: '#FAFAF9', outline: 'none', boxSizing: 'border-box', width: '100%',
}

const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'var(--jga-beige)', letterSpacing: '0.05em',
  textTransform: 'uppercase', marginBottom: 4,
}

// ─── Row / Cell layout ────────────────────────────────────────────────────────

function Row({ children, bg, border, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '7px 14px', backgroundColor: bg,
      borderTop: border ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
      ...style,
    }}>
      {children}
    </div>
  )
}

function Cel({ flex, right, bold, color, muted, children, indent, clip }) {
  return (
    <div style={{
      flex,
      textAlign: right ? 'right' : 'left',
      fontWeight: bold ? 500 : 400,
      fontSize: 12,
      color: color ?? (muted ? 'var(--jga-beige)' : '#1a1a1a'),
      paddingLeft: indent ? 18 : 0,
      overflow: clip ? 'hidden' : 'visible',
      textOverflow: clip ? 'ellipsis' : 'clip',
      whiteSpace: clip ? 'nowrap' : 'normal',
    }}>
      {children}
    </div>
  )
}

// ─── LigneFinanciereModal ─────────────────────────────────────────────────────

function LigneModal({ lots, editingLigne, defaultLotId, onSave, onClose, tva }) {
  const [lotId, setLotId] = useState(editingLigne?.lot_id ?? defaultLotId ?? lots[0]?.id ?? '')
  const [categorie, setCategorie] = useState(editingLigne?.categorie ?? 'aleas')
  const [intitule, setIntitule] = useState(editingLigne?.intitule ?? '')
  const [absValue, setAbsValue] = useState(Math.abs(editingLigne?.montant_ht ?? 0) || '')
  const [isNegative, setIsNegative] = useState((editingLigne?.montant_ht ?? 0) < 0)
  const [statut, setStatut] = useState(editingLigne?.statut ?? 'en_attente')
  const [reference, setReference] = useState(editingLigne?.reference ?? '')
  const [saving, setSaving] = useState(false)

  const computedMontant = () => {
    const abs = Math.abs(Number(absValue) || 0)
    return categorie === 'aleas' ? abs : isNegative ? -abs : abs
  }
  const computedTtc = computedMontant() * (tva ?? 1.20)
  const canSave = intitule.trim() && absValue !== '' && lotId

  const handleSubmit = async () => {
    if (!canSave) return
    setSaving(true)
    await onSave({ lot_id: lotId, categorie, intitule: intitule.trim(), montant_ht: computedMontant(), statut, reference: reference || null })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>
            {editingLigne ? 'Modifier la ligne' : 'Nouvelle ligne'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jga-beige)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Lot */}
          <div>
            <label style={LABEL}>Lot</label>
            <select value={lotId} onChange={e => setLotId(e.target.value)} style={{ ...INPUT, height: 38 }}>
              {lots.map(l => (
                <option key={l.id} value={l.id}>Lot {l.numero} — {l.nom}</option>
              ))}
            </select>
          </div>

          {/* Catégorie */}
          <div>
            <label style={LABEL}>Catégorie</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {Object.entries(CAT).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategorie(key)}
                  style={{
                    padding: '9px 6px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${categorie === key ? cfg.color : 'rgba(0,0,0,0.1)'}`,
                    backgroundColor: categorie === key ? cfg.bg : 'transparent',
                    fontSize: 11, fontWeight: 500,
                    color: categorie === key ? cfg.color : '#6b7280',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 14, marginBottom: 3 }}>{cfg.emoji}</div>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Intitulé */}
          <div>
            <label style={LABEL}>Intitulé *</label>
            <textarea
              value={intitule}
              onChange={e => setIntitule(e.target.value)}
              rows={2}
              placeholder={PLACEHOLDERS[categorie]}
              style={{ ...INPUT, height: 'auto', padding: '8px 12px', resize: 'none' }}
            />
          </div>

          {/* Montant */}
          <div>
            <label style={LABEL}>Montant HT (€) *</label>
            <div style={{ display: 'flex', gap: 0 }}>
              {categorie !== 'aleas' && (
                <button
                  type="button"
                  onClick={() => setIsNegative(!isNegative)}
                  style={{
                    width: 38, height: 38, flexShrink: 0,
                    border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: '8px 0 0 8px',
                    borderRight: 'none',
                    backgroundColor: isNegative ? '#EAF3DE' : '#FAF0EB',
                    color: isNegative ? '#639922' : '#DC2626',
                    fontSize: 18, fontWeight: 500, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isNegative ? '−' : '+'}
                </button>
              )}
              <input
                type="number"
                min={0}
                value={absValue}
                onChange={e => setAbsValue(e.target.value)}
                placeholder="0"
                style={{
                  ...INPUT,
                  flex: 1,
                  borderRadius: categorie !== 'aleas' ? '0 8px 8px 0' : 8,
                }}
              />
            </div>
            {absValue !== '' && Number(absValue) > 0 && (
              <p style={{ fontSize: 11, color: 'var(--jga-beige)', marginTop: 4 }}>
                ≈ {euro(computedTtc)} TTC
              </p>
            )}
          </div>

          {/* Statut + Référence */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={LABEL}>Statut</label>
              <select value={statut} onChange={e => setStatut(e.target.value)} style={{ ...INPUT, height: 38 }}>
                {Object.entries(STATUT).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LABEL}>Référence</label>
              <input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="N° avenant, devis…"
                style={INPUT}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: 'none', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave || saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: '#639922', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: !canSave || saving ? 0.5 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Bandeau totaux ───────────────────────────────────────────────────────────

function StatCard({ label, valueEl, sub, subColor, alertBg }) {
  return (
    <div style={{ flex: 1, backgroundColor: alertBg ?? '#F5F2F0', borderRadius: 10, padding: '12px 14px', minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 500, color: '#9B8F85', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </p>
      {valueEl}
      {sub && <p style={{ fontSize: 11, color: subColor ?? '#9B8F85', marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

function Bandeau({ totaux, affaire }) {
  const { marches_base_ht, total_aleas_ht, total_adaptation_ht, total_mo_ht, total_general_ht, total_general_ttc, delta_pct, alea_budget_pct } = totaux
  const seuilPct = affaire?.seuil_aleas_pct ?? 5
  const aleaAlert = alea_budget_pct > seuilPct

  return (
    <div style={{ backgroundColor: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '14px 20px', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <StatCard
          label="Marchés base"
          valueEl={<p style={{ fontSize: 17, fontWeight: 500, color: '#1a1a1a' }}>{euro(marches_base_ht) ?? '—'} HT</p>}
        />
        <StatCard
          label="Aléas chantier"
          alertBg={aleaAlert ? '#FEF3C7' : undefined}
          valueEl={<p style={{ fontSize: 17, fontWeight: 500, color: aleaAlert ? '#92400E' : '#E05A1E' }}>{total_aleas_ht ? `+${euro(total_aleas_ht)} HT` : '—'}</p>}
          sub={marches_base_ht > 0 ? `${alea_budget_pct.toFixed(1)} % / ${seuilPct} % contractuels` : null}
          subColor={aleaAlert ? '#92400E' : undefined}
        />
        <StatCard
          label="Adapt. / Err. MOE"
          valueEl={<p style={{ fontSize: 17, fontWeight: 500, color: montantColor(total_adaptation_ht, 'adaptation_moe') }}>{total_adaptation_ht ? (total_adaptation_ht > 0 ? '+' : '') + euro(total_adaptation_ht) + ' HT' : '—'}</p>}
        />
        <StatCard
          label="Demandes MO"
          valueEl={<p style={{ fontSize: 17, fontWeight: 500, color: '#2563EB' }}>{total_mo_ht ? (total_mo_ht > 0 ? '+' : '') + euro(total_mo_ht) + ' HT' : '—'}</p>}
        />
        <StatCard
          label="Total chantier"
          valueEl={
            <>
              <p style={{ fontSize: 17, fontWeight: 500, color: colorDelta(delta_pct) }}>{euro(total_general_ht) ?? '—'} HT</p>
              <p style={{ fontSize: 12, color: '#9B8F85', marginTop: 1 }}>{euro(total_general_ttc)} TTC</p>
            </>
          }
          sub={marches_base_ht > 0 ? pct(delta_pct) : null}
          subColor={colorDelta(delta_pct)}
        />
      </div>
    </div>
  )
}

// ─── Table header ─────────────────────────────────────────────────────────────

const TH = { fontSize: 10, fontWeight: 500, color: '#9B8F85', letterSpacing: '0.06em', textTransform: 'uppercase' }

function TableHeader({ tva }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 14px', backgroundColor: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
      <div style={{ flex: C.des, ...TH }}>Lot / Désignation</div>
      <div style={{ flex: C.ent, ...TH }}>Entreprise</div>
      <div style={{ flex: C.ale, textAlign: 'right', ...TH }}>Aléas</div>
      <div style={{ flex: C.ada, textAlign: 'right', ...TH }}>Adapt. MOE</div>
      <div style={{ flex: C.mo,  textAlign: 'right', ...TH }}>Dem. MO</div>
      <div style={{ flex: C.ht,  textAlign: 'right', ...TH }}>Total HT</div>
      <div style={{ flex: C.pct, textAlign: 'right', ...TH }}>%</div>
      <div
        title={`TVA ${formatTvaPct(tva)} — modifiable dans les paramètres de l'affaire`}
        style={{ flex: C.ttc, textAlign: 'right', ...TH, cursor: 'help' }}
      >
        Total TTC
      </div>
      <div style={{ flex: C.act }} />
    </div>
  )
}

// ─── Lot section ──────────────────────────────────────────────────────────────

function LigneRow({ ligne, filter, onEdit, onDelete, onOpenFtm }) {
  const [hovered, setHovered] = useState(false)
  if (filter !== 'all' && ligne.statut !== filter) return null

  const isRefuse = ligne.statut === 'refuse'
  const st = STATUT[ligne.statut]
  const cat = ligne.categorie

  const montantInCol = (targetCat) =>
    cat === targetCat && ligne.montant_ht !== 0 ? (
      <span style={{ color: montantColor(ligne.montant_ht, cat), fontWeight: 500 }}>
        {ligne.montant_ht > 0 ? '+' : ''}{euro(ligne.montant_ht)}
      </span>
    ) : <span style={{ color: 'rgba(0,0,0,0.15)' }}>—</span>

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '6px 14px',
        backgroundColor: hovered ? '#FAFAFA' : '#FAFAF9',
        textDecoration: isRefuse ? 'line-through' : 'none',
        opacity: isRefuse ? 0.65 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flex: C.des, paddingLeft: 18, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {ligne.ftm_id && (
          <button
            onClick={() => onOpenFtm(ligne.ftm_id)}
            title={`Voir la FTM-${String(ligne.ftm_numero).padStart(3, '0')}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20,
              borderRadius: 5,
              border: '0.5px solid rgba(0,0,0,0.12)',
              background: '#FAF0EB',
              color: '#E05A1E',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#E05A1E'
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.borderColor = '#E05A1E'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#FAF0EB'
              e.currentTarget.style.color = '#E05A1E'
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'
            }}
          >
            <FilePen size={11} />
          </button>
        )}
        <span style={{ fontSize: 12, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ligne.intitule}
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, backgroundColor: st.bg, color: st.color, borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {st.label}
        </span>
      </div>
      <div style={{ flex: C.ent }} />
      <div style={{ flex: C.ale, textAlign: 'right', fontSize: 12 }}>{montantInCol('aleas')}</div>
      <div style={{ flex: C.ada, textAlign: 'right', fontSize: 12 }}>{montantInCol('adaptation_moe')}</div>
      <div style={{ flex: C.mo,  textAlign: 'right', fontSize: 12 }}>{montantInCol('demande_mo')}</div>
      <div style={{ flex: C.ht }} />
      <div style={{ flex: C.pct }} />
      <div style={{ flex: C.ttc }} />
      <div style={{ flex: C.act, display: 'flex', justifyContent: 'flex-end', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 0.1s' }}>
        <button onClick={() => onEdit(ligne)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jga-beige)', padding: 2, borderRadius: 4 }}>
          <Pencil size={12} />
        </button>
        <button onClick={() => onDelete(ligne.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 2, borderRadius: 4 }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function LotSection({ lot, filter, onAdd, onEdit, onDelete, onOpenFtm, affaireId, navigate }) {
  if (!lot.marche_base_ht) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', backgroundColor: 'white',
        marginBottom: 6, borderRadius: 6, opacity: 0.7,
      }}>
        <span style={{ flex: 1, fontSize: 12, color: '#9B8F85', fontStyle: 'italic' }}>
          Lot {lot.numero} — {lot.nom}
        </span>
        <button
          onClick={() => navigate(`/affaires/${affaireId}/lots-entreprises`)}
          style={{ fontSize: 11, color: '#639922', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Marché non renseigné — configurer dans Entreprises &amp; Lots →
        </button>
      </div>
    )
  }

  const hasVisibleLines = filter === 'all'
    ? lot.lignes.length > 0
    : lot.lignes.some(l => l.statut === filter)

  return (
    <div style={{ marginBottom: 8, backgroundColor: 'white', borderRadius: 8, overflow: 'hidden' }}>
      {/* Ligne marché de base */}
      <Row bg="#FAFDF7">
        <Cel flex={C.des} bold clip>Lot {lot.numero} — {lot.nom}</Cel>
        <Cel flex={C.ent} muted clip>{lot.entreprise?.raison_sociale ?? '—'}</Cel>
        <Cel flex={C.ale} right muted>—</Cel>
        <Cel flex={C.ada} right muted>—</Cel>
        <Cel flex={C.mo}  right muted>—</Cel>
        <Cel flex={C.ht}  right bold>{euro(lot.marche_base_ht)}</Cel>
        <Cel flex={C.pct} right muted>base</Cel>
        <Cel flex={C.ttc} right muted>{euro(lot.marche_base_ttc)}</Cel>
        <div style={{ flex: C.act, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onAdd(lot.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#639922', padding: 2, borderRadius: 4 }}
            title="Ajouter une ligne"
          >
            <Plus size={14} />
          </button>
        </div>
      </Row>

      {/* Lignes supplémentaires */}
      {lot.lignes.map(ligne => (
        <LigneRow key={ligne.id} ligne={ligne} filter={filter} onEdit={onEdit} onDelete={onDelete} onOpenFtm={onOpenFtm} />
      ))}

      {/* Sous-total */}
      {hasVisibleLines && (
        <Row bg="#EAF3DE" border>
          <Cel flex={C.des} indent color="#3B6D11" bold>Sous-total Lot {lot.numero}</Cel>
          <Cel flex={C.ent} />
          <Cel flex={C.ale} right bold color={lot.total_aleas_ht ? '#E05A1E' : 'var(--jga-beige)'}>
            {lot.total_aleas_ht ? `+${euro(lot.total_aleas_ht)}` : '—'}
          </Cel>
          <Cel flex={C.ada} right bold color={montantColor(lot.total_adaptation_ht, 'adaptation_moe')}>
            {lot.total_adaptation_ht ? (lot.total_adaptation_ht > 0 ? '+' : '') + euro(lot.total_adaptation_ht) : '—'}
          </Cel>
          <Cel flex={C.mo} right bold color="#2563EB">
            {lot.total_mo_ht ? (lot.total_mo_ht > 0 ? '+' : '') + euro(lot.total_mo_ht) : '—'}
          </Cel>
          <Cel flex={C.ht} right bold color="#639922">{euro(lot.total_lot_ht)}</Cel>
          <Cel flex={C.pct} right bold color={colorDelta(lot.delta_pct)}>
            {lot.delta_pct ? pct(lot.delta_pct) : '—'}
          </Cel>
          <Cel flex={C.ttc} right muted>{euro(lot.total_lot_ttc)}</Cel>
          <div style={{ flex: C.act }} />
        </Row>
      )}
    </div>
  )
}

// ─── Ligne totaux ─────────────────────────────────────────────────────────────

function TotalsRow({ totaux }) {
  const { marches_base_ht, total_aleas_ht, total_adaptation_ht, total_mo_ht, total_general_ht, total_general_ttc, delta_pct } = totaux
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '10px 14px',
      backgroundColor: 'white', borderTop: '1.5px solid rgba(0,0,0,0.1)',
      flexShrink: 0,
    }}>
      <div style={{ flex: C.des, fontSize: 12, fontWeight: 500, color: '#1a1a1a' }}>TOTAL GÉNÉRAL</div>
      <div style={{ flex: C.ent }} />
      <div style={{ flex: C.ale, textAlign: 'right', fontSize: 13, fontWeight: 500, color: '#E05A1E' }}>
        {total_aleas_ht ? `+${euro(total_aleas_ht)}` : '—'}
      </div>
      <div style={{ flex: C.ada, textAlign: 'right', fontSize: 13, fontWeight: 500, color: montantColor(total_adaptation_ht, 'adaptation_moe') }}>
        {total_adaptation_ht ? (total_adaptation_ht > 0 ? '+' : '') + euro(total_adaptation_ht) : '—'}
      </div>
      <div style={{ flex: C.mo, textAlign: 'right', fontSize: 13, fontWeight: 500, color: '#2563EB' }}>
        {total_mo_ht ? (total_mo_ht > 0 ? '+' : '') + euro(total_mo_ht) : '—'}
      </div>
      <div style={{ flex: C.ht, textAlign: 'right', fontSize: 14, fontWeight: 500, color: colorDelta(delta_pct) }}>
        {euro(total_general_ht) ?? '—'}
      </div>
      <div style={{ flex: C.pct, textAlign: 'right', fontSize: 13, fontWeight: 500, color: colorDelta(delta_pct) }}>
        {marches_base_ht > 0 ? pct(delta_pct) : '—'}
      </div>
      <div style={{ flex: C.ttc, textAlign: 'right', fontSize: 12, color: '#6b7280' }}>
        {euro(total_general_ttc)}
      </div>
      <div style={{ flex: C.act }} />
    </div>
  )
}

// ─── Module principal ─────────────────────────────────────────────────────────

export default function FinancierChantierModule() {
  const { affaireId } = useParams()
  const navigate = useNavigate()
  const { affaire, loading: affaireLoading } = useAffaire(affaireId)
  const { tableau, loading: tableauLoading, addLigne, updateLigne, deleteLigne, refetch: refetchFinancier } = useSuiviFinancier(affaireId, affaire)
  const { lots, totaux } = tableau
  const { ftms, updateFtm } = useFtm(affaireId)
  const loading = affaireLoading || tableauLoading

  const [filter, setFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLigne, setEditingLigne] = useState(null)
  const [defaultLotId, setDefaultLotId] = useState(null)
  const [editAffaireOpen, setEditAffaireOpen] = useState(false)
  const [ftmEditId, setFtmEditId] = useState(null)
  const ftmToEdit = ftms?.find(f => f.id === ftmEditId) ?? null

  const tva = affaire?.taux_tva ?? 1.20
  const seuilPct = affaire?.seuil_aleas_pct ?? 5

  const handleAdd = (lotId) => {
    setEditingLigne(null)
    setDefaultLotId(lotId ?? lots[0]?.id ?? null)
    setModalOpen(true)
  }

  const handleEdit = (ligne) => {
    setEditingLigne(ligne)
    setDefaultLotId(ligne.lot_id)
    setModalOpen(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette ligne ?')) return
    await deleteLigne(id)
  }

  const handleSave = async (data) => {
    if (editingLigne) await updateLigne(editingLigne.id, data)
    else await addLigne(data)
    setModalOpen(false)
  }

  const handlePrint = () => window.print()

  const handleSaveAffaire = async (data) => {
    await supabase.from('affaires').update(data).eq('id', affaireId)
    setEditAffaireOpen(false)
  }

  const handleOpenFtm = (ftmId) => setFtmEditId(ftmId)

  const handleSaveFtm = async (data) => {
    await updateFtm(ftmEditId, data)
    setFtmEditId(null)
    await refetchFinancier()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--jga-green-light)', borderTopColor: 'var(--jga-green)' }} />
      </div>
    )
  }

  const aleaAlert = (totaux.alea_budget_pct ?? 0) > seuilPct && (totaux.marches_base_ht ?? 0) > 0

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .financial-module, .financial-module * { visibility: visible; }
          .financial-module { position: absolute; left: 0; top: 0; width: 100%; height: auto; overflow: visible; }
          .no-print { display: none !important; }
          .print-header { display: block !important; }
        }
        .print-header { display: none; }
      `}</style>

      <div className="financial-module" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: '#F5F2F0' }}>

        {/* Print header */}
        <div className="print-header" style={{ padding: '0 0 12px', borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: '#9B8F85' }}>{affaire?.code_affaire}</p>
          <h1 style={{ fontSize: 16, fontWeight: 500 }}>Tableau des plus et moins-values — {affaire?.nom}</h1>
          <p style={{ fontSize: 11, color: '#9B8F85' }}>MO : {affaire?.moa_nom} · Exporté le {new Date().toLocaleDateString('fr-FR')}</p>
        </div>

        {/* Bandeau totaux */}
        <Bandeau totaux={totaux} affaire={affaire} />

        {/* Bandeau paramètres */}
        <div className="no-print" style={{
          backgroundColor: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: '#9B8F85' }}>Paramètres de l'affaire :</span>
          <span style={{ fontSize: 11, color: '#9B8F85' }}>TVA applicable :</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#1a1a1a' }}>{formatTvaPct(tva)}</span>
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.2)', margin: '0 4px' }}>·</span>
          <span style={{ fontSize: 11, color: '#9B8F85' }}>Seuil aléas contractuels :</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#1a1a1a' }}>{seuilPct} %</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setEditAffaireOpen(true)}
            style={{ fontSize: 11, color: 'var(--jga-orange)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Modifier →
          </button>
        </div>

        {/* Alerte aléas */}
        {aleaAlert && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px', backgroundColor: '#FEF3C7',
            borderBottom: '0.5px solid rgba(0,0,0,0.06)', flexShrink: 0,
          }}>
            <AlertTriangle size={14} style={{ color: '#92400E', flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: '#92400E' }}>
              Les aléas chantier dépassent le seuil contractuel de {seuilPct} % (actuellement {totaux.alea_budget_pct?.toFixed(1)} %). Un avenant au contrat peut être nécessaire.
            </p>
          </div>
        )}

        {/* Barre d'actions + filtres */}
        <div className="no-print" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', backgroundColor: '#F5F2F0', flexShrink: 0, gap: 12,
        }}>
          {/* Filtres */}
          <div style={{ display: 'flex', gap: 4 }}>
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  border: filter === f.id ? '1.5px solid #639922' : '0.5px solid rgba(0,0,0,0.12)',
                  backgroundColor: filter === f.id ? '#EAF3DE' : 'white',
                  color: filter === f.id ? '#3B6D11' : '#6b7280',
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 7,
                border: '0.5px solid rgba(0,0,0,0.12)', backgroundColor: 'white',
                color: '#6b7280', fontSize: 12, cursor: 'pointer',
              }}
            >
              <Printer size={13} /> Exporter
            </button>
            <button
              onClick={() => handleAdd(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: 7,
                border: 'none', backgroundColor: '#639922',
                color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Ajouter une ligne
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: '0 0 0 0' }}>
          <TableHeader tva={tva} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 6px' }}>
            {lots.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9B8F85' }}>
                <TrendingUp size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                <p style={{ fontSize: 13 }}>Aucun lot — configurez d'abord les lots dans Entreprises &amp; Lots</p>
              </div>
            ) : (
              lots.map(lot => (
                <LotSection
                  key={lot.id}
                  lot={lot}
                  filter={filter}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onOpenFtm={handleOpenFtm}
                  affaireId={affaireId}
                  navigate={navigate}
                />
              ))
            )}
          </div>
        </div>

        {/* Totaux sticky */}
        {lots.length > 0 && <TotalsRow totaux={totaux} />}
      </div>

      {modalOpen && (
        <LigneModal
          lots={lots}
          editingLigne={editingLigne}
          defaultLotId={defaultLotId}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          tva={tva}
        />
      )}

      {editAffaireOpen && affaire && (
        <AffaireFormModal
          affaire={affaire}
          onSave={handleSaveAffaire}
          onClose={() => setEditAffaireOpen(false)}
          scrollToSection="financier"
        />
      )}

      {ftmEditId && (
        <FtmFormModal
          open={!!ftmEditId}
          ftm={ftmToEdit}
          affaire={affaire}
          lots={lots}
          onClose={() => setFtmEditId(null)}
          onSave={handleSaveFtm}
          onSaveAndExport={handleSaveFtm}
        />
      )}
    </>
  )
}
