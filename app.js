let rawData;
let comparisonChart;

const els = {
  countrySelect: document.getElementById('countrySelect'),
  trackSelect: document.getElementById('trackSelect'),
  roleSelect: document.getElementById('roleSelect'),
  baseCountrySelect: document.getElementById('baseCountrySelect'),
  scenarioTableBody: document.querySelector('#scenarioTable tbody'),
  summaryCards: document.getElementById('summaryCards'),
  countrySnapshotTable: document.querySelector('#countrySnapshotTable tbody'),
  fallbackTable: document.querySelector('#fallbackTable tbody'),
  recommendationBuckets: document.getElementById('recommendationBuckets'),
  roleRationale: document.getElementById('roleRationale'),
};

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const rolePriority = [
  'Junior Artist', 'Artist', 'Senior Artist', 'Art Director', 'Senior Art Director',
  'Production Assistant', 'Production Coordinator (Account Manager)'
];

fetch('data.json')
  .then(r => r.json())
  .then(data => {
    rawData = data;
    setupControls();
    renderScenarioTable();
    bindEvents();
    renderAll();
  });

function setupControls() {
  const countries = unique(rawData.salaryData.map(d => d.country));
  const tracks = unique(rawData.salaryData.map(d => d.track));

  populateSelect(els.countrySelect, countries, 'Indonesia');
  populateSelect(els.baseCountrySelect, countries, 'Indonesia');
  populateSelect(els.trackSelect, tracks, 'Artist');
  refreshRoleOptions();
}

function bindEvents() {
  ['countrySelect','trackSelect','roleSelect','baseCountrySelect'].forEach(key => {
    els[key].addEventListener('change', () => {
      if (key === 'trackSelect') refreshRoleOptions();
      renderAll();
    });
  });
}

function renderScenarioTable() {
  els.scenarioTableBody.innerHTML = '';
  rawData.scenarioDefaults.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.country}</td>
      <td><input type="number" min="0" step="0.05" value="${row.relocationPremium}" data-country="${row.country}" data-field="relocationPremium"></td>
      <td><input type="number" min="0" step="0.05" value="${row.costOfLivingPremium}" data-country="${row.country}" data-field="costOfLivingPremium"></td>
      <td><input type="number" min="0.1" step="0.05" value="${row.qualityFitScore}" data-country="${row.country}" data-field="qualityFitScore"></td>
      <td class="multiplier-cell">${formatMultiplier(effectiveMultiplier(row))}</td>
    `;
    els.scenarioTableBody.appendChild(tr);
  });

  els.scenarioTableBody.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', e => {
      const country = e.target.dataset.country;
      const field = e.target.dataset.field;
      const record = rawData.scenarioDefaults.find(x => x.country === country);
      record[field] = Number(e.target.value);
      e.target.closest('tr').querySelector('.multiplier-cell').textContent = formatMultiplier(effectiveMultiplier(record));
      renderAll();
    });
  });
}

function refreshRoleOptions() {
  const track = els.trackSelect.value;
  const roles = unique(rawData.salaryData.filter(d => d.track === track).map(d => d.role))
    .sort((a,b) => rolePriority.indexOf(a) - rolePriority.indexOf(b));
  const current = els.roleSelect.value;
  populateSelect(els.roleSelect, roles, roles.includes(current) ? current : roles[0]);
}

function renderAll() {
  const selectedCountry = els.countrySelect.value;
  const selectedTrack = els.trackSelect.value;
  const selectedRole = els.roleSelect.value;
  const baseCountry = els.baseCountrySelect.value;

  const selectedRow = findRow(selectedCountry, selectedRole);
  const baseRow = findRow(baseCountry, selectedRole);
  const allForRole = rawData.salaryData.filter(d => d.role === selectedRole);
  const countrySnapshotRows = rawData.salaryData
    .filter(d => d.country === selectedCountry)
    .sort((a,b) => (a.trackRank - b.trackRank) || (a.roleRank - b.roleRank));

  renderSummaryCards(selectedRow, baseRow);
  renderCountrySnapshot(countrySnapshotRows);

  const ranking = allForRole.map(row => {
    const scenario = rawData.scenarioDefaults.find(s => s.country === row.country);
    const effectiveMid = row.usdMid * effectiveMultiplier(scenario);
    return {
      ...row,
      effectiveMid,
      deltaVsBase: baseRow ? effectiveMid - baseRow.usdMid * effectiveMultiplier(rawData.scenarioDefaults.find(s => s.country === baseCountry)) : 0,
      deltaVsSelected: selectedRow ? effectiveMid - selectedRow.usdMid * effectiveMultiplier(rawData.scenarioDefaults.find(s => s.country === selectedCountry)) : 0,
      scenario,
    };
  }).sort((a,b) => a.effectiveMid - b.effectiveMid);

  renderFallbackTable(ranking, selectedCountry, baseCountry);
  renderComparisonChart(ranking, selectedCountry);
  renderRecommendations(ranking, selectedCountry);
  els.roleRationale.textContent = selectedRow?.rationale || '';
}

function renderSummaryCards(selectedRow, baseRow) {
  const scenario = rawData.scenarioDefaults.find(s => s.country === selectedRow.country);
  const baseScenario = rawData.scenarioDefaults.find(s => s.country === baseRow.country);
  const selectedEffective = selectedRow.usdMid * effectiveMultiplier(scenario);
  const baseEffective = baseRow.usdMid * effectiveMultiplier(baseScenario);

  const cards = [
    { label: 'Selected country', value: selectedRow.country, sub: `${selectedRow.track} track` },
    { label: 'Role / seniority', value: selectedRow.role, sub: `${selectedRow.seniorityBand} · ${selectedRow.experience}` },
    { label: 'USD midpoint', value: fmtUSD.format(selectedRow.usdMid), sub: `Raw benchmark range ${fmtUSD.format(selectedRow.usdLow)}–${fmtUSD.format(selectedRow.usdHigh)}` },
    { label: 'Effective midpoint', value: fmtUSD.format(selectedEffective), sub: `Adjusted by scenario lens` },
    { label: 'Hiring band', value: selectedRow.suggestedHiringBand, sub: `Suggested local ${fmtNum.format(selectedRow.suggestedLocalLow)}–${fmtNum.format(selectedRow.suggestedLocalHigh)}` },
    { label: 'Δ vs base country', value: formatDelta(selectedEffective - baseEffective), sub: `${els.baseCountrySelect.value} comparison` },
  ];

  els.summaryCards.innerHTML = cards.map(card => `
    <div class="metric-card">
      <div class="label">${card.label}</div>
      <div class="value">${card.value}</div>
      <div class="sub">${card.sub}</div>
    </div>
  `).join('');
}

function renderCountrySnapshot(rows) {
  els.countrySnapshotTable.innerHTML = rows.map(r => `
    <tr>
      <td>${r.track}</td>
      <td>${r.role}</td>
      <td>${r.experience}</td>
      <td>${fmtUSD.format(r.usdMid)}</td>
      <td>${r.suggestedHiringBand}</td>
      <td>${fmtNum.format(r.suggestedLocalLow)}–${fmtNum.format(r.suggestedLocalHigh)}</td>
    </tr>
  `).join('');
}

function renderFallbackTable(ranking, selectedCountry, baseCountry) {
  els.fallbackTable.innerHTML = ranking.map(row => {
    const tier = recommendationTier(row, ranking, selectedCountry);
    return `
      <tr>
        <td>${row.country}${row.country === selectedCountry ? ' <span class="tag warn">selected</span>' : ''}${row.country === baseCountry ? ' <span class="tag good">base</span>' : ''}</td>
        <td>${fmtUSD.format(row.usdMid)}</td>
        <td>${fmtUSD.format(row.effectiveMid)}</td>
        <td class="${row.deltaVsBase >= 0 ? 'delta-pos':'delta-neg'}">${formatDelta(row.deltaVsBase)}</td>
        <td class="${row.deltaVsSelected >= 0 ? 'delta-pos':'delta-neg'}">${formatDelta(row.deltaVsSelected)}</td>
        <td>${row.suggestedHiringBand}</td>
        <td><span class="tag ${tier.className}">${tier.label}</span></td>
      </tr>
    `;
  }).join('');
}

function renderComparisonChart(ranking, selectedCountry) {
  const ctx = document.getElementById('comparisonChart');
  const labels = ranking.map(r => r.country);
  const values = ranking.map(r => Math.round(r.effectiveMid));
  const colors = ranking.map(r => r.country === selectedCountry ? 'rgba(56,189,248,0.9)' : 'rgba(148,163,184,0.65)');

  if (comparisonChart) comparisonChart.destroy();
  comparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Effective USD midpoint',
        data: values,
        backgroundColor: colors,
        borderRadius: 8,
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmtUSD.format(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#cbd5e1' },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: '#cbd5e1',
            callback: v => fmtUSD.format(v)
          },
          grid: { color: 'rgba(148,163,184,0.15)' }
        }
      }
    }
  });
}

function renderRecommendations(ranking, selectedCountry) {
  const others = ranking.filter(r => r.country !== selectedCountry);
  const low = others.filter(r => recommendationTier(r, ranking, selectedCountry).label === 'Low-cost fallback').slice(0,3);
  const mid = others.filter(r => recommendationTier(r, ranking, selectedCountry).label === 'Good-enough market').slice(0,3);
  const premium = others.filter(r => recommendationTier(r, ranking, selectedCountry).label === 'Premium / strategic').slice(0,3);

  const sections = [
    { title: 'Low-cost fallback', className: 'good', rows: low, description: 'Use when cost control matters most and the role can tolerate more fit-screening.' },
    { title: 'Good-enough market', className: 'warn', rows: mid, description: 'Use when you want balance between affordability and likely delivery readiness.' },
    { title: 'Premium / strategic', className: 'bad', rows: premium, description: 'Use only when the role needs stronger market maturity, client-facing credibility, or rare specialization.' },
  ];

  els.recommendationBuckets.innerHTML = sections.map(section => `
    <div class="bucket">
      <h3><span class="tag ${section.className}">${section.title}</span></h3>
      <p class="muted small">${section.description}</p>
      ${section.rows.length ? `
        <ul class="method-list">
          ${section.rows.map(r => `<li><strong>${r.country}</strong> · ${fmtUSD.format(r.effectiveMid)} effective midpoint · ${r.suggestedHiringBand}</li>`).join('')}
        </ul>
      ` : '<p class="muted small">No countries fall into this bucket for the current role.</p>'}
    </div>
  `).join('');
}

function recommendationTier(row, ranking, selectedCountry) {
  const min = ranking[0].effectiveMid;
  const max = ranking[ranking.length - 1].effectiveMid;
  const normalized = max === min ? 0.5 : (row.effectiveMid - min) / (max - min);
  if (row.country === selectedCountry) return { label: 'Selected market', className: 'warn' };
  if (normalized <= 0.33) return { label: 'Low-cost fallback', className: 'good' };
  if (normalized <= 0.66) return { label: 'Good-enough market', className: 'warn' };
  return { label: 'Premium / strategic', className: 'bad' };
}

function findRow(country, role) {
  return rawData.salaryData.find(d => d.country === country && d.role === role);
}

function populateSelect(select, options, selected) {
  select.innerHTML = options.map(option => `<option value="${escapeHtml(option)}" ${option === selected ? 'selected' : ''}>${option}</option>`).join('');
}

function unique(arr) { return [...new Set(arr)]; }

function effectiveMultiplier(scenario) {
  return (1 + Number(scenario.relocationPremium || 0) + Number(scenario.costOfLivingPremium || 0)) / Number(scenario.qualityFitScore || 1);
}

function formatMultiplier(value) { return `${value.toFixed(2)}×`; }

function formatDelta(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmtUSD.format(value)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
