// ==========================================
// UTILITAIRES : DATES, PÉRIODES DE PAIE, TOASTS & CSV
// ==========================================
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function toYMD(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}

function parseYMD(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function formatDateFR(dateStr) {
  if (!dateStr) return '';
  const dt = parseYMD(dateStr);
  const dayName = DAY_NAMES_SHORT[dt.getDay()];
  const dayNum = String(dt.getDate()).padStart(2, '0');
  const monthShort = (typeof MONTH_NAMES_SHORT !== 'undefined' && MONTH_NAMES_SHORT[dt.getMonth()]) || String(dt.getMonth() + 1).padStart(2, '0');
  return `${dayName} ${dayNum} ${monthShort}`;
}

function formatDateWithDayFR(dateStr) {
  return formatDateFR(dateStr);
}

function getMinutesBetween(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin < startMin) endMin += 24 * 60;
  return endMin - startMin;
}

function formatHoursMin(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
}

// --- CALCUL PÉRIODE DE PAIE ---
function getPenultimateSunday(year, monthIndex) {
  const sundays = [];
  const d = new Date(year, monthIndex, 1, 12, 0, 0);
  while (d.getMonth() === monthIndex) {
    if (d.getDay() === 0) sundays.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return sundays[sundays.length - 2];
}

function getPayPeriodBounds(year, monthIndex) {
  const prevMonthDate = new Date(year, monthIndex - 1, 1, 12, 0, 0);
  const prevPenult = getPenultimateSunday(prevMonthDate.getFullYear(), prevMonthDate.getMonth());
  const startObj = new Date(prevPenult.getFullYear(), prevPenult.getMonth(), prevPenult.getDate() + 1, 12, 0, 0);
  const endObj = getPenultimateSunday(year, monthIndex);
  return { startYMD: toYMD(startObj), endYMD: toYMD(endObj), startObj, endObj };
}

function getPayPeriodForDateStr(dateStr) {
  const dt = parseYMD(dateStr);
  const y = dt.getFullYear();
  const m = dt.getMonth();
  const penultSun = getPenultimateSunday(y, m);
  if (toYMD(dt) > toYMD(penultSun)) {
    const next = new Date(y, m + 1, 1, 12, 0, 0);
    return { year: next.getFullYear(), month: next.getMonth() };
  }
  return { year: y, month: m };
}

function initActivePeriodFromDate(dateObj) {
  const period = getPayPeriodForDateStr(toYMD(dateObj));
  activePayYear = period.year;
  activePayMonth = period.month;
}

// --- GROUPEMENT PAR SEMAINE ---
function getWeekInfo(dateStr) {
  const dt = parseYMD(dateStr);
  const day = dt.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + diffToMon, 12, 0, 0);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, 12, 0, 0);
  return {
    key: toYMD(mon),
    label: `SEMAINE DU ${formatDateFR(toYMD(mon)).toUpperCase()} AU ${formatDateFR(toYMD(sun)).toUpperCase()}`
  };
}

// --- PREUVE PHOTO, POURBOIRE & KM VÉHICULE PERSO ---
function itemHasProof(item) {
  return Boolean(item && item.proof_path);
}

function getItemTipPay(item) {
  if (!item || item.is_legacy) return 0;
  if (typeof item.tip_pay === 'number' && !isNaN(item.tip_pay) && item.tip_pay > 0) {
    return item.tip_pay;
  }
  const raw = String(item.proof_url || '');
  const match = raw.match(/(?:^|\|)tip:([0-9]+(?:\.[0-9]+)?)/);
  if (match) {
    const val = parseFloat(match[1]);
    return !isNaN(val) && val > 0 ? val : 0;
  }
  return 0;
}

function getItemDelKm(item) {
  if (!item || item.is_legacy) return 0;
  if (typeof item.del_km === 'number' && !isNaN(item.del_km) && item.del_km > 0) {
    return item.del_km;
  }
  const raw = String(item.proof_url || '');
  const match = raw.match(/(?:^|\|)km:([0-9]+(?:\.[0-9]+)?)/);
  if (match) {
    const val = parseFloat(match[1]);
    return !isNaN(val) && val > 0 ? val : 0;
  }
  return 0;
}

function formatKm(kmVal) {
  const num = Number(kmVal) || 0;
  if (num <= 0) return '';
  const rounded = Math.round(num * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} km`;
}

function encodeExtraMetaInProofUrl(tipPay, delKm, hasPhoto) {
  const parts = [];
  if (Number(tipPay) > 0) {
    parts.push(`tip:${Number(tipPay).toFixed(2)}`);
  }
  if (Number(delKm) > 0) {
    const cleanKm = Math.round(Number(delKm) * 10) / 10;
    parts.push(`km:${Number.isInteger(cleanKm) ? cleanKm : cleanKm.toFixed(1)}`);
  }
  if (parts.length > 0) return parts.join('|');
  return hasPhoto ? 'true' : null;
}

// --- TOASTS PIXEL ART ---
function dismissToast(toast) {
  if (!toast || !toast.parentNode || toast.classList.contains('toast-leaving')) return;
  if (prefersReducedMotion()) {
    toast.remove();
    return;
  }
  toast.classList.add('toast-leaving');
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 180);
}

function showToast(message, options = {}) {
  const { type = 'info', duration = 4000, actionText = null, onAction = null } = options;
  if (type === 'error') playErrorSound();

  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `pixel-toast toast-${type}`;

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (actionText && typeof onAction === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-btn';
    btn.textContent = actionText;
    btn.onclick = () => {
      onAction();
      dismissToast(toast);
    };
    toast.appendChild(btn);
  }

  container.appendChild(toast);
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(toast);
    }, duration);
  }
  return toast;
}

// --- EXPORT CSV UTF-8 AVEC BOM ---
function exportCSV() {
  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id));
  if (activeShifts.length === 0) {
    showToast('Aucune donnée à exporter.', { type: 'warn' });
    return;
  }

  const headers = [
    'Date', 'Jour', 'Note', 'Arrivee Prestation', 'Depart Prestation', 'Pause (min)',
    'Minutes Prestation', 'Gain Prestation (EUR)', 'Livraison', 'Minutes Livraison',
    'Km Aller-Retour', 'Gain Livraison (EUR)', 'Pourboire (EUR)', 'Gain Total Paie (EUR)', 'Photo sur le site', 'Mois Anterieur'
  ];

  const rows = activeShifts.map(item => {
    const isLegacy = item.is_legacy === true;
    const stdMin = item.std_minutes || 0;
    let stdP = item.std_pay || 0;
    if (!isLegacy && stdMin > 0 && stdP < STD_MIN_PAY) {
      stdP = Math.max(STD_MIN_PAY, (stdMin / 60) * HOURLY_RATE);
    }
    const delP = item.del_pay || 0;
    const delKm = getItemDelKm(item);
    const tipP = getItemTipPay(item);
    const totalP = isLegacy ? (item.total_pay || stdP) : (stdP + delP);
    const dt = parseYMD(item.date);
    const dayLabel = DAY_NAMES_SHORT[dt.getDay()];

    const cols = [
      item.date || '',
      dayLabel,
      String(item.note ?? '').replace(/"/g, '""'),
      item.std_start || '',
      item.std_end || '',
      item.std_break || 0,
      stdMin,
      stdP.toFixed(2),
      (item.has_delivery || delP > 0) ? 'Oui' : 'Non',
      item.del_minutes || 0,
      delKm > 0 ? delKm : 0,
      delP.toFixed(2),
      tipP.toFixed(2),
      totalP.toFixed(2),
      itemHasProof(item) ? 'Oui' : 'Non',
      isLegacy ? 'Oui' : 'Non'
    ];
    return cols.map(c => `"${c}"`).join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `compteur-paella-export-${toYMD(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Export CSV téléchargé !', { type: 'success' });
}

