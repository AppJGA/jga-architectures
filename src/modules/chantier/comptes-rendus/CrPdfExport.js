// Génération HTML/PDF pour un Compte Rendu de Chantier
// Pattern : window.open() → HTML → window.print()

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtDateShort(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtTime(t) {
  if (!t) return ''
  return t.slice(0, 5)
}

const PRESENCE_LABELS = { p: 'P', r: 'R', a: 'A', e: 'E', na: '—' }
const CATEGORIE_LABELS = {
  moa: "Maître d'ouvrage", moe: "Maître d'œuvre", be: "Bureau d'études",
  ct: 'Contrôle technique', csps: 'CSPS', administration: 'Administration', autre: 'Autre',
}

function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

function buildPresenceTable(rows, columns) {
  if (!rows.length) return ''
  const headerCells = columns.map(c => `<th>${escHtml(c.label)}</th>`).join('')
  const bodyRows = rows.map(row => {
    const cells = columns.map(c => `<td>${c.render(row)}</td>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `
    <table class="presence-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`
}

function buildPresencePill(presence) {
  const lbl = PRESENCE_LABELS[presence] ?? '—'
  const colors = { p: '#2A8A4E', r: '#E8602C', a: '#B8412C', e: '#5E5854', na: '#D1D5DB' }
  const bg = colors[presence] ?? '#D1D5DB'
  if (!presence || presence === 'na') return `<span class="presence-pill" style="background:#F3F4F6;color:#9CA3AF">—</span>`
  return `<span class="presence-pill" style="background:${bg};color:white">${lbl}</span>`
}

function buildRemarquesTable(remarques, lots, interlocuteurs) {
  if (!remarques.length) return '<p style="color:#9C9591;font-size:10pt;font-style:italic;padding:4px 0">Aucune remarque</p>'
  const rows = remarques.map(r => {
    let dateHtml = ''
    if (r.est_nouveau) dateHtml += '<span class="new-triangle">▶ </span>'
    dateHtml += `<span class="rem-date">${fmtDateShort(r.date_note)}</span>`
    if (r.pour) dateHtml += `<br><span class="rem-pour">${escHtml(r.pour)}</span>`

    // Attribution
    let attrHtml = ''
    if (r.lot_id && lots?.length) {
      const lot = lots.find(l => l.id === r.lot_id)
      if (lot) attrHtml = `<br><span style="font-size:8pt;color:#5E5854;font-style:italic">(${escHtml(lot.numero ? `Lot ${lot.numero} — ${lot.nom}` : lot.nom)})</span>`
    } else if (r.interlocuteur_id && interlocuteurs?.length) {
      const i = interlocuteurs.find(x => x.id === r.interlocuteur_id)
      if (i) {
        const name = [i.prenom, i.nom].filter(Boolean).join(' ') || i.organisation || '?'
        attrHtml = `<br><span style="font-size:8pt;color:#5E5854;font-style:italic">(${escHtml(name)})</span>`
      }
    }
    dateHtml += attrHtml

    let descStyle = ''
    if (r.est_clos) descStyle += 'text-decoration:line-through;color:#9CA3AF;'
    if (r.est_important) descStyle += 'font-weight:bold;color:#E8602C;'
    const descHtml = `<span style="${descStyle}">${escHtml(r.description)}</span>`

    const echeanceHtml = r.date_echeance ? fmtDateShort(r.date_echeance) : '—'
    const statutHtml = r.statut ? `<span class="rem-statut">${escHtml(r.statut)}</span>` : ''

    return `
      <tr class="${r.est_clos ? 'rem-clos' : ''}">
        <td class="td-date">${dateHtml}</td>
        <td class="td-desc">${descHtml}</td>
        <td class="td-echeance">${echeanceHtml}</td>
        <td class="td-statut">${statutHtml}</td>
      </tr>`
  }).join('')
  return `
    <table class="remarques-table">
      <thead>
        <tr>
          <th style="width:14%">Note du</th>
          <th style="width:55%">Description</th>
          <th style="width:15%">Pour le</th>
          <th style="width:16%">Statut</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

export function generateCrPdf(cr, sections, presences, affaire, { autoPrint = true, lots = [], interlocuteurs = [] } = {}) {
  const num = String(cr.numero).padStart(2, '0')
  const logoUrl = window.location.origin + '/Logo_JGA_Archi.jpg'

  const dateReunion = fmtDate(cr.date_reunion)
  const prochaine = cr.date_prochaine_reunion
    ? `${fmtDate(cr.date_prochaine_reunion)}${cr.heure_prochaine_reunion ? ' à ' + fmtTime(cr.heure_prochaine_reunion) : ''}`
    : 'À définir'

  // Séparation présences interlocuteurs / entreprises
  const interloPresences = presences
    .filter(p => p.affaire_interlocuteurs)
    .sort((a, b) => (a.affaire_interlocuteurs?.ordre ?? 99) - (b.affaire_interlocuteurs?.ordre ?? 99))

  const lotPresences = presences
    .filter(p => p.lot_entreprises)
    .sort((a, b) => (a.lot_entreprises?.lots?.numero ?? 99) - (b.lot_entreprises?.lots?.numero ?? 99))

  const interloColumns = [
    { label: 'Rôle', render: p => {
      const cat = p.affaire_interlocuteurs?.categorie ?? ''
      const lbl = p.affaire_interlocuteurs?.categorie_label || CATEGORIE_LABELS[cat] || cat
      return `<span style="font-size:9pt;color:#5E5854">${escHtml(lbl)}</span>`
    }},
    { label: 'Contact', render: p => {
      const i = p.affaire_interlocuteurs
      const name = [i?.prenom, i?.nom].filter(Boolean).join(' ')
      const org = i?.organisation
      return `<strong>${escHtml(name)}</strong>${org ? '<br><span style="color:#5E5854;font-size:9pt">' + escHtml(org) + '</span>' : ''}`
    }},
    { label: 'Adresse', render: p => escHtml(p.affaire_interlocuteurs?.adresse) },
    { label: 'Email / Tél', render: p => {
      const i = p.affaire_interlocuteurs
      return [
        i?.email ? `<a href="mailto:${escHtml(i.email)}" style="color:#1B3A5C">${escHtml(i.email)}</a>` : '',
        i?.telephone ? escHtml(i.telephone) : '',
      ].filter(Boolean).join('<br>')
    }},
    { label: 'Présence', render: p => buildPresencePill(p.presence) },
    { label: 'Convoqué', render: p => p.convoque ? `<strong style="color:#2A8A4E">✓</strong>${p.heure_convocation ? ' ' + fmtTime(p.heure_convocation) : ''}` : '—' },
  ]

  const lotColumns = [
    { label: 'Lot', render: p => {
      const le = p.lot_entreprises
      const lotLabel = le?.lots ? `Lot ${le.lots.numero ?? ''} — ${le.lots.nom ?? ''}` : '—'
      return escHtml(lotLabel)
    }},
    { label: 'Entreprise', render: p => {
      const le = p.lot_entreprises
      const name = le?.entreprises?.raison_sociale ?? '—'
      const contact = le?.interlocuteurs ? `${le.interlocuteurs.prenom ?? ''} ${le.interlocuteurs.nom ?? ''}`.trim() : ''
      return `<strong>${escHtml(name)}</strong>${contact ? '<br><span style="color:#5E5854;font-size:9pt">' + escHtml(contact) + '</span>' : ''}`
    }},
    { label: 'Email / Tél', render: p => {
      const le = p.lot_entreprises?.interlocuteurs
      return [
        le?.email ? `<a href="mailto:${escHtml(le.email)}" style="color:#1B3A5C">${escHtml(le.email)}</a>` : '',
        le?.telephone ? escHtml(le.telephone) : '',
      ].filter(Boolean).join('<br>')
    }},
    { label: 'Présence', render: p => buildPresencePill(p.presence) },
    { label: 'Convoqué', render: p => p.convoque ? `<strong style="color:#2A8A4E">✓</strong>${p.heure_convocation ? ' ' + fmtTime(p.heure_convocation) : ''}` : '—' },
  ]

  const printScript = autoPrint
    ? `<script>window.onload = function() { window.print(); }<\/script>`
    : ''

  const sectionsHtml = sections.map(section => {
    const sousSectionsHtml = section.sousSections.map(ss => `
      <div class="sous-section">
        <div class="ss-header">${escHtml(ss.code)} — ${escHtml(ss.titre)}</div>
        ${buildRemarquesTable(ss.remarques, lots, interlocuteurs)}
      </div>`).join('')
    return `
      <div class="section">
        <div class="section-header">
          <span class="section-numero">${escHtml(section.numero_romain)}</span>
          &nbsp;—&nbsp;${escHtml(section.titre)}
        </div>
        ${sousSectionsHtml || '<p style="color:#9C9591;font-style:italic;font-size:10pt">Aucune sous-section</p>'}
      </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>CR n°${num} — ${escHtml(affaire?.nom ?? '')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
      @bottom-left   { content: "JGA Architectes • 69 rue de la République, 69002 Lyon • contact@jga-architectes.fr"; font-size:8pt; color:#5E5854; }
      @bottom-right  { content: "Page " counter(page) " / " counter(pages); font-size:8pt; color:#5E5854; }
    }
    * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; margin:0; background:white; line-height:1.4; }

    /* EN-TÊTE */
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; padding-bottom:10px; border-bottom:2px solid #E8602C; }
    .header-logo img { height:48px; }
    .header-center { text-align:center; flex:1; }
    .header-title { font-size:22pt; font-weight:bold; color:#111; }
    .header-date  { font-size:14pt; color:#E8602C; font-weight:500; margin-top:4px; }
    .header-right { text-align:right; }

    /* BLOC INFO */
    .info-block { background:#F5F5F5; border-radius: 3px; padding:10px 14px; margin-bottom:10px; }
    .info-block-title { font-size:9pt; font-weight:bold; text-transform:uppercase; color:#E8602C; letter-spacing:0.08em; margin-bottom:6px; }
    .info-row { display:flex; gap:16px; flex-wrap:wrap; }
    .info-cell { flex:1; min-width:140px; }
    .info-label { font-size:8pt; color:#5E5854; text-transform:uppercase; letter-spacing:0.06em; }
    .info-value { font-size:10pt; font-weight:500; }

    /* PROCHAINE RÉUNION */
    .prochaine-bloc { background:rgba(232,96,44,0.10); border-radius: 3px; padding:8px 14px; margin-bottom:12px; display:flex; align-items:center; gap:12px; }
    .prochaine-label { font-size:9pt; color:#E8602C; font-weight:bold; text-transform:uppercase; }
    .prochaine-date  { font-size:10pt; font-weight:500; }

    /* LÉGENDE PRÉSENCE */
    .legende { display:flex; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
    .legende-item { display:flex; align-items:center; gap:4px; font-size:9pt; }

    /* TABLEAUX PRÉSENCE */
    .presence-table-title { font-size:10pt; font-weight:bold; color:#111; margin:10px 0 4px; }
    .presence-table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:9pt; }
    .presence-table th { background:#111; color:white; font-weight:600; padding:5px 8px; text-align:left; font-size:9pt; }
    .presence-table td { padding:5px 8px; border-bottom:0.5px solid #E5E7EB; vertical-align:top; }
    .presence-table tr:nth-child(even) td { background:#FAFAFA; }
    .presence-pill { display:inline-block; width:22px; height:22px; border-radius:50%; text-align:center; line-height:22px; font-size:9pt; font-weight:600; }

    /* SECTIONS REMARQUES */
    .section { margin-bottom:18px; page-break-inside:avoid; }
    .section-header { background:#FFF8F5; border-bottom:1.5px solid #E8602C; padding:6px 10px; font-size:11pt; font-weight:bold; text-transform:uppercase; color:#111; margin-bottom:8px; }
    .section-numero { color:#E8602C; }
    .sous-section { margin-bottom:10px; padding-left:4px; }
    .ss-header { font-size:10pt; font-weight:bold; border-bottom:0.5px solid #D1D5DB; padding-bottom:3px; margin-bottom:6px; }

    /* TABLEAU REMARQUES */
    .remarques-table { width:100%; border-collapse:collapse; font-size:9pt; margin-bottom:4px; }
    .remarques-table th { font-size:8.5pt; font-weight:600; color:#5E5854; text-transform:uppercase; letter-spacing:0.04em; padding:4px 6px; border-bottom:1px solid #D1D5DB; text-align:left; }
    .remarques-table td { padding:5px 6px; border-bottom:0.5px solid #F3F4F6; vertical-align:top; }
    .remarques-table tr.rem-clos td { color:#9CA3AF; }
    .rem-date  { font-size:8.5pt; color:#5E5854; }
    .rem-pour  { font-size:8pt; color:#E8602C; font-weight:500; }
    .rem-statut { font-size:8pt; color:#5E5854; }
    .new-triangle { color:#E8602C; font-size:8pt; }
    .td-date { width:12%; }
    .td-desc { width:56%; }
    .td-echeance { width:14%; font-size:9pt; color:#5E5854; }
    .td-statut { width:18%; }
  </style>
  ${printScript}
</head>
<body>

  <!-- EN-TÊTE -->
  <div class="page-header">
    <div class="header-logo"><img src="${logoUrl}" alt="JGA" onerror="this.style.display='none'"></div>
    <div class="header-center">
      <div class="header-title">Réunion n°${num}</div>
      <div class="header-date">${new Date((cr.date_reunion || '') + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
    <div class="header-right" style="font-size:9pt;color:#5E5854">
      ${cr.statut === 'emis' ? '<span style="color:#2A8A4E;font-weight:bold">✓ Émis</span>' : '<span style="color:#9C9591">Brouillon</span>'}
    </div>
  </div>

  <!-- INFORMATIONS PROJET -->
  <div class="info-block">
    <div class="info-block-title">Informations sur le projet</div>
    <div class="info-row">
      <div class="info-cell">
        <div class="info-label">Affaire</div>
        <div class="info-value">${escHtml(affaire?.nom ?? '—')}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Code</div>
        <div class="info-value">${escHtml(affaire?.code_affaire ?? '—')}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Adresse</div>
        <div class="info-value">${escHtml(affaire?.projet_adresse ?? '')} ${escHtml(affaire?.projet_commune ?? '')}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Maître d'ouvrage</div>
        <div class="info-value">${escHtml(affaire?.moa_nom ?? '—')}</div>
      </div>
    </div>
  </div>

  <!-- PROCHAINE RÉUNION -->
  <div class="prochaine-bloc">
    <span class="prochaine-label">Prochaine réunion :</span>
    <span class="prochaine-date">${escHtml(prochaine)}</span>
  </div>

  <!-- LÉGENDE -->
  <div class="legende">
    ${[['p','#2A8A4E','Présent'],['r','#E8602C','Retard'],['a','#B8412C','Absent'],['e','#5E5854','Excusé']].map(([k,col,lbl]) =>
      `<span class="legende-item"><span class="presence-pill" style="background:${col};color:white">${k.toUpperCase()}</span> ${lbl}</span>`
    ).join('')}
  </div>

  <!-- TABLEAU INTERLOCUTEURS -->
  ${interloPresences.length > 0 ? `
  <div class="presence-table-title">Personnes relatives au projet</div>
  ${buildPresenceTable(interloPresences, interloColumns)}
  ` : ''}

  <!-- TABLEAU ENTREPRISES -->
  ${lotPresences.length > 0 ? `
  <div class="presence-table-title">Entreprises</div>
  ${buildPresenceTable(lotPresences, lotColumns)}
  ` : ''}

  <!-- SECTIONS + REMARQUES -->
  ${sectionsHtml}

</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
}
