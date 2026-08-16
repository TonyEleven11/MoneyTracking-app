/* ===========================================================
   Income & Expenditure — core data model + logic
   =========================================================== */
(function () {

const STORAGE_KEY = 'ie_entries_v1';

const CATEGORIES = {
  income: {
    label: 'Income',
    subcategories: ['TA', 'AI', 'Sold something', 'Misc']
  },
  expense: {
    label: 'Expense',
    sections: {
      business: {
        label: 'Business',
        color: 'var(--series-1)',
        subcategories: ['Stock', 'AdWords', 'Printing/Advertising', 'Tools', 'Vehicle', 'Fuel', 'Software', 'Misc']
      },
      living: {
        label: 'Living',
        color: 'var(--series-3)',
        subcategories: ['Accommodation', 'Food', 'Bills', 'Drinks', 'Groceries', 'Misc']
      },
      discretionary: {
        label: 'Discretionary',
        color: 'var(--series-2)',
        subcategories: ['Going out', 'Coffees', 'Hot chocolates', 'Tennis', 'Clothes', 'Bad food', 'Misc']
      }
    }
  }
};

// The four subcategories being tracked as "wasteful spending"
const WASTEFUL_SUBCATEGORIES = ['Coffees', 'Hot chocolates', 'Drinks', 'Bad food'];

const GOALS = [
  { name: 'UK ticket', amount: 2000 },
  { name: 'Ear surgery', amount: 4800 },
  { name: 'Hair transplant', amount: 5000 },
  { name: 'Teeth improved', amount: 2200 },
  { name: 'Singing lessons', amount: 400 },
  { name: 'Ultra-sharp outfit', amount: 620 }
];

/* ---------------- storage ---------------- */

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load entries', e);
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function addEntry(entry) {
  const entries = loadEntries();
  entry.id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  entry.createdAt = new Date().toISOString();
  entries.push(entry);
  saveEntries(entries);
  return entry;
}

function deleteEntry(id) {
  const entries = loadEntries().filter(e => e.id !== id);
  saveEntries(entries);
}

/* ---------------- date helpers ---------------- */

function todayStr() {
  return toDateStr(new Date());
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday-start week containing `d`
function weekStart(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1) - day; // days to subtract to reach Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isInCurrentWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const start = weekStart(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

/* ---------------- totals ---------------- */

function totalsFor(entries, predicate) {
  let income = 0, expense = 0;
  entries.filter(predicate).forEach(e => {
    if (e.type === 'income') income += e.amount;
    else expense += e.amount;
  });
  return { income, expense, net: income - expense };
}

function todayTotals(entries) {
  const t = todayStr();
  return totalsFor(entries, e => e.date === t);
}

function weekTotals(entries) {
  return totalsFor(entries, e => isInCurrentWeek(e.date));
}

/* ---------------- insights: wasteful spending ---------------- */

function weeklyAverageForSubcategory(entries, subcategory) {
  const matches = entries
    .filter(e => e.type === 'expense' && e.subcategory === subcategory)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (matches.length === 0) {
    return { weekly: 0, basis: 'no data yet' };
  }

  const today = new Date();
  const earliest = new Date(matches[0].date + 'T00:00:00');
  const daysElapsed = Math.max(1, Math.round((today - earliest) / 86400000) + 1);

  const cutoff28 = new Date(today);
  cutoff28.setDate(cutoff28.getDate() - 28);

  if (daysElapsed >= 28) {
    const recentTotal = matches
      .filter(e => new Date(e.date + 'T00:00:00') >= cutoff28)
      .reduce((s, e) => s + e.amount, 0);
    return { weekly: recentTotal / 4, basis: 'avg of last 4 weeks' };
  }

  const totalSpent = matches.reduce((s, e) => s + e.amount, 0);
  const weeksElapsed = Math.max(daysElapsed / 7, 1 / 7);
  const weekly = totalSpent / weeksElapsed;
  const basis = daysElapsed < 7
    ? `based on ${daysElapsed} day${daysElapsed === 1 ? '' : 's'} so far`
    : 'avg since you started tracking';
  return { weekly, basis };
}

function wastefulInsights(entries) {
  const rows = WASTEFUL_SUBCATEGORIES.map(sub => {
    const { weekly, basis } = weeklyAverageForSubcategory(entries, sub);
    return { subcategory: sub, weekly, annual: weekly * 52, basis };
  });
  const combinedWeekly = rows.reduce((s, r) => s + r.weekly, 0);
  const combinedAnnual = combinedWeekly * 52;
  return { rows, combinedWeekly, combinedAnnual };
}

function goalProgress(combinedAnnual) {
  return GOALS.map(g => ({
    ...g,
    percent: g.amount > 0 ? (combinedAnnual / g.amount) * 100 : 0
  }));
}

/* ---------------- formatting ---------------- */

function fmtMoney(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyShort(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ---------------- CSV export ---------------- */

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function entriesToCSV(entries) {
  const header = ['Date', 'Type', 'Section', 'Subcategory', 'Amount', 'Note'];
  const rows = entries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map(e => [
      e.date,
      e.type === 'income' ? 'Income' : 'Expense',
      e.section || '',
      e.subcategory,
      e.amount.toFixed(2),
      e.note || ''
    ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n');
}

function currentWeekEntries(entries) {
  return entries.filter(e => isInCurrentWeek(e.date));
}

/* export for use by ui.js */
window.IE = {
  CATEGORIES, WASTEFUL_SUBCATEGORIES, GOALS,
  loadEntries, saveEntries, addEntry, deleteEntry,
  todayStr, toDateStr, weekStart, isInCurrentWeek,
  todayTotals, weekTotals,
  wastefulInsights, goalProgress,
  fmtMoney, fmtMoneyShort,
  entriesToCSV, currentWeekEntries
};

})();
