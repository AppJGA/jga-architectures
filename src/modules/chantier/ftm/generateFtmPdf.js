function fmtDate(d) {
  if (!d) return '___/___/______'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtMontant(v) {
  if (v == null) return '—'
  const n = Number(v)
  const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))
  return `${n < 0 ? '−' : n > 0 ? '+' : ''}${formatted} € HT`
}

function cb(checked) {
  return checked ? '&#9745;' : '&#9744;'
}

function buildFtmHtml(ftm, affaire, { autoPrint = true } = {}) {
  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'
  const ref = `FTM-${String(ftm.numero).padStart(3, '0')}`

  const incidenceDelai = (ftm.incidence_delai_valeur && Number(ftm.incidence_delai_valeur) !== 0)
    ? `${ftm.incidence_delai_valeur} ${ftm.incidence_delai_unite ?? 'jours'}`
    : 'Sans incidence'

  const printScript = autoPrint
    ? `<script>window.onload = function() { window.print(); }<\/script>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${ref} — ${affaire?.nom ?? ''}</title>
  <style>
    @page { size: A4 portrait; margin: 20mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; margin: 0; background: white; line-height: 1.4; }
    h1 { font-size: 17pt; font-weight: bold; margin: 14px 0 18px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    h2 { font-size: 12pt; font-weight: bold; margin: 16px 0 8px; }
    hr { border: none; border-top: 1px solid #000; margin: 12px 0; }
    .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 10px; }
    .field { margin-bottom: 4px; }
    .field-label { font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }
    .field-value { font-size: 11pt; font-weight: 500; border-bottom: 1px solid #999; padding-bottom: 2px; min-height: 18px; }
    .cb-line { margin: 5px 0; font-size: 11pt; line-height: 1.5; }
    .description-block { border: 1px solid #ccc; padding: 8px 10px; min-height: 60px; margin-top: 6px; font-size: 11pt; }
    ul.analysis { padding-left: 18px; margin: 6px 0; }
    ul.analysis li { margin: 5px 0; }
    ul.sub { list-style: circle; padding-left: 20px; margin: 4px 0; }
    .signature-section { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .sig-block .sig-label { font-size: 9pt; color: #555; margin-bottom: 4px; }
    .sig-line { border-bottom: 1px solid #000; height: 28px; }
    .ref-badge { font-size: 9pt; color: #555; text-align: right; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="ref-badge">${ref}</div>

  <img src="${logoUrl}" alt="JGA Architectures"
    style="height:56px;width:auto;margin-bottom:14px;display:block;" />

  <h1>Formulaire de demande de modification en phase chantier</h1>

  <div class="header-grid">
    <div class="field">
      <div class="field-label">Projet</div>
      <div class="field-value">${affaire?.nom ?? ''}</div>
    </div>
    <div class="field">
      <div class="field-label">Maître d'Ouvrage</div>
      <div class="field-value">${affaire?.moa_nom ?? ''}</div>
    </div>
    <div class="field">
      <div class="field-label">Date d'émission</div>
      <div class="field-value">${fmtDate(ftm.date_emission)}</div>
    </div>
    <div class="field">
      <div class="field-label">Référence chantier</div>
      <div class="field-value">${ftm.reference_chantier ?? ref}</div>
    </div>
  </div>
  <hr />

  <h2>1. Description de la demande</h2>
  <div class="cb-line">${cb(ftm.type_demande === 'ajout')} &nbsp;Ajout</div>
  <div class="cb-line">${cb(ftm.type_demande === 'suppression')} &nbsp;Suppression</div>
  <div class="cb-line">${cb(ftm.type_demande === 'modification')} &nbsp;Modification</div>
  <p style="font-weight:bold;margin:10px 0 4px;">Description précise de la demande :</p>
  <div class="description-block">${ftm.description ? ftm.description.replace(/\n/g, '<br>') : ''}</div>
  <hr />

  <h2>2. Motivation de la demande</h2>
  <div class="cb-line">${cb(ftm.motivation === 'confort_usage')} &nbsp;Confort / usage</div>
  <div class="cb-line">${cb(ftm.motivation === 'esthetique')} &nbsp;Esthétique</div>
  <div class="cb-line">${cb(ftm.motivation === 'technique')} &nbsp;Technique</div>
  <div class="cb-line">${cb(ftm.motivation === 'autre')} &nbsp;Autre${ftm.motivation === 'autre' && ftm.motivation_autre ? ` : ${ftm.motivation_autre}` : ''}</div>
  <hr />

  <h2>3. Analyse par le Maître d'Œuvre</h2>
  <ul class="analysis">
    <li>Faisabilité technique : <strong>${ftm.faisabilite_technique === true ? 'Oui' : ftm.faisabilite_technique === false ? 'Non' : 'Non renseignée'}</strong></li>
    <li>Impact réglementaire : <strong>${ftm.impact_reglementaire === true ? 'Oui' : ftm.impact_reglementaire === false ? 'Non' : 'Non renseigné'}</strong></li>
    <li>Incidence sur le délai : <strong>${incidenceDelai}</strong></li>
    <li>Incidence financière estimée :
      <ul class="sub">
        <li>Travaux supplémentaires : <strong>${fmtMontant(ftm.montant_travaux_ht)}</strong></li>
        <li>Honoraires MOE supplémentaires : <strong>${fmtMontant(ftm.montant_honoraires_ht)}</strong></li>
      </ul>
    </li>
  </ul>
  <hr />

  <h2>4. Décision du Maître d'Ouvrage</h2>
  <div class="cb-line">${cb(ftm.decision === 'accepte')} &nbsp;Je confirme la demande et accepte le surcoût et le délai supplémentaire.</div>
  <div class="cb-line">${cb(ftm.decision === 'renonce')} &nbsp;Je renonce à cette demande après information des conséquences.</div>

  <div class="signature-section">
    <div class="sig-block">
      <div class="sig-label">Signature du Maître d'Ouvrage</div>
      <div class="sig-line"></div>
    </div>
    <div class="sig-block">
      <div class="sig-label">Date</div>
      <div style="font-size:11pt;padding-top:6px;">_____ / _____ / ___________</div>
    </div>
  </div>

  ${printScript}
</body>
</html>`
}

export function generateFtmPdf(ftm, affaire, { autoPrint = true } = {}) {
  const win = window.open('', '_blank')
  if (!win) {
    alert('Autorisez les pop-ups pour exporter en PDF.')
    return
  }
  win.document.write(buildFtmHtml(ftm, affaire, { autoPrint }))
  win.document.close()
}
