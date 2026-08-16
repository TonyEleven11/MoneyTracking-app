/* ===========================================================
   Income & Expenditure — UI rendering + interaction
   =========================================================== */
(function () {

const { CATEGORIES, WASTEFUL_SUBCATEGORIES, GOALS,
  loadEntries, addEntry, deleteEntry,
  todayStr, isInCurrentWeek,
  todayTotals, weekTotals,
  wastefulInsights, goalProgress,
  fmtMoney, fmtMoneyShort,
  entriesToCSV, currentWeekEntries } = window.IE;

const state = {
  tab: 'home',
  type: 'expense',      // 'expense' | 'income' — app always OPENS on expense per spec
  section: null,        // business | living | discretionary (expense only)
  subcategory: null,
  date: todayStr(),
  note: ''
};

/* ---------------- tab switching ---------------- */

function switchTab(tab) {
  state.tab = tab;
  document.getElementById('view-home').hidden = tab !== 'home';
  document.getElementById('view-insights').hidden = tab !== 'insights';
  document.querySelectorAll('.tab-bar button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (tab === 'insights') renderInsights();
}

/* ---------------- Home tab: entry form ---------------- */

function resetSelection(keepType) {
  state.section = null;
  state.subcategory = null;
  state.note = '';
  if (!keepType) state.type = 'expense';
}

function renderTypeToggle() {
  const el = document.getElementById('type-toggle');
  el.innerHTML = `
    <button class="seg ${state.type === 'expense' ? 'active' : ''}" data-type="expense">Expense</button>
    <button class="seg ${state.type === 'income' ? 'active' : ''}" data-type="income">Income</button>
  `;
  el.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.type = btn.dataset.type;
      state.section = null;
      state.subcategory = null;
      renderTypeToggle();
      renderPicker();
    });
  });
}

function renderPicker() {
  const wrap = document.getElementById('picker');
  wrap.innerHTML = '';

  if (state.type === 'income') {
    wrap.appendChild(renderChipGroup(
      'Category',
      CATEGORIES.income.subcategories,
      state.subcategory,
      (sub) => { state.subcategory = sub; renderPicker(); focusAmount(); }
    ));
    updateSaveButton();
    return;
  }

  // expense: choose section first
  const sectionKeys = Object.keys(CATEGORIES.expense.sections);
  const sectionGroup = document.createElement('div');
  sectionGroup.className = 'chip-group';
  const label = document.createElement('div');
  label.className = 'picker-label';
  label.textContent = 'Section';
  sectionGroup.appendChild(label);
  const chips = document.createElement('div');
  chips.className = 'chips';
  sectionKeys.forEach(key => {
    const sec = CATEGORIES.expense.sections[key];
    const chip = document.createElement('button');
    chip.className = 'chip section-chip' + (state.section === key ? ' active' : '');
    chip.style.setProperty('--chip-color', sec.color);
    chip.textContent = sec.label;
    chip.addEventListener('click', () => {
      state.section = key;
      state.subcategory = null;
      renderPicker();
    });
    chips.appendChild(chip);
  });
  sectionGroup.appendChild(chips);
  wrap.appendChild(sectionGroup);

  if (state.section) {
    const sec = CATEGORIES.expense.sections[state.section];
    wrap.appendChild(renderChipGroup(
      'Category',
      sec.subcategories,
      state.subcategory,
      (sub) => { state.subcategory = sub; renderPicker(); focusAmount(); }
    ));
  }

  updateSaveButton();
}

function renderChipGroup(labelText, options, selected, onSelect) {
  const group = document.createElement('div');
  group.className = 'chip-group';
  const label = document.createElement('div');
  label.className = 'picker-label';
  label.textContent = labelText;
  group.appendChild(label);
  const chips = document.createElement('div');
  chips.className = 'chips';
  options.forEach(opt => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (selected === opt ? ' active' : '');
    chip.textContent = opt;
    chip.addEventListener('click', () => onSelect(opt));
    chips.appendChild(chip);
  });
  group.appendChild(chips);
  return group;
}

function focusAmount() {
  requestAnimationFrame(() => {
    const el = document.getElementById('amount-input');
    if (el) el.focus();
  });
}

function canSave() {
  const amount = parseFloat(document.getElementById('amount-input').value);
  if (!state.subcategory) return false;
  if (state.type === 'expense' && !state.section) return false;
  if (!(amount > 0)) return false;
  return true;
}

function updateSaveButton() {
  document.getElementById('save-btn').disabled = !canSave();
}

function handleSave() {
  const amountInput = document.getElementById('amount-input');
  const noteInput = document.getElementById('note-input');
  const dateInput = document.getElementById('date-input');
  const amount = parseFloat(amountInput.value);
  if (!canSave()) return;

  addEntry({
    type: state.type,
    section: state.type === 'expense' ? state.section : null,
    subcategory: state.subcategory,
    amount: Math.round(amount * 100) / 100,
    date: dateInput.value || todayStr(),
    note: noteInput.value.trim()
  });

  // Reset for fast repeat entry — stay on same type/section (sticky),
  // but clear the picked subcategory/amount/note.
  state.subcategory = null;
  amountInput.value = '';
  noteInput.value = '';
  dateInput.value = todayStr();

  renderPicker();
  renderTotals();
  renderRecent();
  updateSaveButton();
}

function renderTotals() {
  const entries = loadEntries();
  const t = todayTotals(entries);
  const w = weekTotals(entries);
  document.getElementById('totals-row').innerHTML = `
    <div class="stat-tile">
      <div class="stat-label">Today</div>
      <div class="stat-value">${fmtMoney(t.net)}</div>
      <div class="stat-sub">+${fmtMoney(t.income)} in / -${fmtMoney(t.expense)} out</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">This week</div>
      <div class="stat-value">${fmtMoney(w.net)}</div>
      <div class="stat-sub">+${fmtMoney(w.income)} in / -${fmtMoney(w.expense)} out</div>
    </div>
  `;
}

function renderRecent() {
  const entries = loadEntries();
  const today = todayStr();
  const todays = entries.filter(e => e.date === today)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const list = document.getElementById('recent-list');
  if (todays.length === 0) {
    list.innerHTML = '<div class="empty-msg">No entries yet today.</div>';
    return;
  }
  list.innerHTML = todays.map(e => `
    <div class="recent-row" data-id="${e.id}">
      <div class="recent-main">
        <span class="recent-cat">${e.subcategory}${e.section ? ' · ' + CATEGORIES.expense.sections[e.section].label : ''}</span>
        ${e.note ? `<span class="recent-note">${escapeHtml(e.note)}</span>` : ''}
      </div>
      <div class="recent-amount ${e.type === 'income' ? 'income' : 'expense'}">
        ${e.type === 'income' ? '+' : '-'}${fmtMoney(e.amount)}
      </div>
      <button class="recent-del" aria-label="Delete entry" data-id="${e.id}">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.recent-del').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteEntry(btn.dataset.id);
      renderTotals();
      renderRecent();
      if (state.tab === 'insights') renderInsights();
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* ---------------- Insights tab ---------------- */

function renderInsights() {
  const entries = loadEntries();
  const { rows, combinedWeekly, combinedAnnual } = wastefulInsights(entries);
  const goals = goalProgress(combinedAnnual);

  const grid = document.getElementById('waste-grid');
  grid.innerHTML = rows.map(r => `
    <div class="waste-tile">
      <div class="waste-name">${r.subcategory}</div>
      <div class="waste-weekly">${fmtMoneyShort(r.weekly)}<span class="unit">/wk</span></div>
      <div class="waste-annual">${fmtMoney(r.annual)}<span class="unit">/yr</span></div>
      <div class="waste-basis">${r.basis}</div>
    </div>
  `).join('');

  document.getElementById('waste-combined').innerHTML = `
    <div class="combined-label">Combined wasteful spend</div>
    <div class="combined-weekly">${fmtMoneyShort(combinedWeekly)}<span class="unit">/wk</span></div>
    <div class="combined-annual">${fmtMoney(combinedAnnual)} <span class="unit">per year</span></div>
  `;

  const goalsEl = document.getElementById('goals-list');
  goalsEl.innerHTML = goals.map(g => {
    const pct = g.percent;
    const pctDisplay = pct >= 100 ? Math.round(pct) : pct.toFixed(0);
    const complete = pct >= 100;
    return `
      <div class="goal-row ${complete ? 'complete' : ''}">
        <div class="goal-top">
          <span class="goal-name">${g.name}</span>
          <span class="goal-amount">${fmtMoneyShort(g.amount)}</span>
        </div>
        <div class="meter">
          <div class="meter-track">
            <div class="meter-fill" style="width:${Math.min(pct, 100)}%"></div>
          </div>
          <div class="meter-pct">${complete ? '✓ ' : ''}${pctDisplay}%</div>
        </div>
      </div>
    `;
  }).join('');
}

/* ---------------- export (weekly CSV + share sheet) ---------------- */

async function handleExport() {
  const entries = loadEntries();
  const weekEntries = currentWeekEntries(entries);
  if (weekEntries.length === 0) {
    alert('No entries logged for this week yet.');
    return;
  }
  const csv = entriesToCSV(weekEntries);
  const filename = `income-expenditure-week-${todayStr()}.csv`;
  const file = new File([csv], filename, { type: 'text/csv' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      console.warn('Share failed, falling back to download', err);
    }
  }

  // fallback: trigger a download
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- init ---------------- */

function init() {
  resetSelection(false); // always opens on Expense tab/mode
  renderTypeToggle();
  renderPicker();
  renderTotals();
  renderRecent();

  document.getElementById('date-input').value = todayStr();
  document.getElementById('amount-input').addEventListener('input', updateSaveButton);
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('export-btn').addEventListener('click', handleExport);

  document.querySelectorAll('.tab-bar button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  switchTab('home');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  }
}

document.addEventListener('DOMContentLoaded', init);

})();
