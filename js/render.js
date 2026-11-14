// ==========================================
// RENDU DE L'APPLICATION, FILTRES & GRAPHIQUE MENSUEL
// ==========================================
function changePeriod(delta) {
  const d = new Date(activePayYear, activePayMonth + delta, 1, 12, 0, 0);
  activePayYear = d.getFullYear();
  activePayMonth = d.getMonth();
  triggerPeriodTransition(delta);
  renderApp();
}

function resetToCurrentPeriod() {
  initActivePeriodFromDate(new Date());
  triggerPeriodTransition(1);
  renderApp();
}

function setLogFilter(mode, scrollToItem = false) {
  logFilterMode = mode;
  document.getElementById('tab-period')?.classList.toggle('active', mode === 'period');
  document.getElementById('tab-noproof')?.classList.toggle('active', mode === 'noproof');
  document.getElementById('tab-all')?.classList.toggle('active', mode === 'all');
  const histBody = document.getElementById('history-collapsible-body');
  const histBtn = document.getElementById('history-collapse-btn');
  const histIcon = document.getElementById('history-collapse-icon');
  if (histBody && !histBody.classList.contains('open')) {
    histBody.classList.add('open');
    if (histBtn) histBtn.setAttribute('aria-expanded', 'true');
    if (histIcon) histIcon.textContent = '▲ REPLIER';
  }
  renderApp();

  if (scrollToItem) {
    setTimeout(() => {
      const activeMissingCard =
        document.querySelector('#log-list .in-current-period .photo-miss')?.closest('.log-item') ||
        document.querySelector('#log-list .photo-miss')?.closest('.log-item') ||
        document.querySelector('#log-list .log-item');

      if (activeMissingCard) {
        activeMissingCard.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center'
        });

        activeMissingCard.classList.remove('just-added-flash');
        void activeMissingCard.offsetWidth;
        activeMissingCard.classList.add('just-added-flash');

        const photoBtn = activeMissingCard.querySelector('.photo-miss, [data-photo-act="add"]');
        if (photoBtn) {
          photoBtn.classList.add('photo-miss-pulse');
          setTimeout(() => photoBtn.classList.remove('photo-miss-pulse'), 3500);
          photoBtn.focus({ preventScroll: true });
        }

        showToast("Voici l'entrée sans photo — clique sur [+] pour l'ajouter !", {
          type: 'info',
          duration: 4000
        });
      } else {
        const histSec = document.getElementById('section-history');
        if (histSec) {
          histSec.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
        }
      }
    }, 100);
  }
}

function goToMissingProof() {
  if (typeof playClickSound === 'function') playClickSound();

  if (typeof window.setView === 'function' && document.body.getAttribute('data-view') !== 'counter') {
    window.setView('counter');
  }

  setLogFilter('noproof', true);
}
window.goToMissingProof = goToMissingProof;

function toggleHistorySection() {
  const body = document.getElementById('history-collapsible-body');
  const btn = document.getElementById('history-collapse-btn');
  const icon = document.getElementById('history-collapse-icon');
  if (!body || !btn || !icon) return;
  const isOpen = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  icon.textContent = isOpen ? '▲ REPLIER' : '▼ DÉPLIER';
  if (isOpen && !prefersReducedMotion()) {
    body.querySelectorAll('.log-item').forEach(item => {
      item.style.animation = 'none';
      void item.offsetWidth;
      item.style.animation = '';
    });
  }
}

function toggleGlobalSection() {
  const body = document.getElementById('global-collapsible-body');
  const btn = document.getElementById('global-collapse-btn');
  const icon = document.getElementById('global-collapse-icon');
  const isOpen = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  icon.textContent = isOpen ? '▲ REPLIER' : '▼ DÉPLIER';
  if (isOpen) {
    animateMonthlyBars();
    const allPayEl = document.getElementById('all-total-pay');
    if (allPayEl && typeof animateValueCounter === 'function' && !prefersReducedMotion()) {
      const targetVal = parseFloat(String(allPayEl.textContent).replace(',', '.')) || 0;
      if (targetVal > 0) {
        animateValueCounter('all-total-pay', 0, targetVal, 620, false);
      }
    }
  }
}

// --- RENDU PRINCIPAL ---
function renderApp() {
  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id));
  const bounds = getPayPeriodBounds(activePayYear, activePayMonth);

  document.getElementById('period-title').textContent = `PAIE DE ${MONTH_NAMES[activePayMonth]} ${activePayYear}`;
  document.getElementById('period-range-text').innerHTML = `Du <strong>${formatDateWithDayFR(bounds.startYMD)}</strong> au <strong>${formatDateWithDayFR(bounds.endYMD)}</strong>`;

  const todayStr = toYMD(new Date());
  const todayObj = parseYMD(todayStr);
  const diffDays = Math.round((bounds.endObj - todayObj) / (1000 * 60 * 60 * 24));
  const remBadge = document.getElementById('period-remaining-badge');
  if (todayStr > bounds.endYMD) {
    remBadge.textContent = `Clôturée le ${formatDateWithDayFR(bounds.endYMD)}`;
  } else if (todayStr < bounds.startYMD) {
    remBadge.textContent = `Fin prévue le ${formatDateWithDayFR(bounds.endYMD)}`;
  } else if (diffDays === 0) {
    remBadge.textContent = `Dernier jour ! (Fin ${formatDateFR(bounds.endYMD)})`;
  } else {
    remBadge.textContent = `J-${diffDays} avant fin (${formatDateWithDayFR(bounds.endYMD)})`;
  }

  let allTotalPay = 0, allLegacyCount = 0;
  let monthStdMin = 0, monthStdPay = 0, monthDelCount = 0, monthDelPay = 0;
  let monthTipCount = 0, monthTipPay = 0;
  let monthLegacyCount = 0, monthMissingProofs = 0;
  const allWorkedDatesSet = new Set();
  const monthWorkedDatesSet = new Set();
  const monthStdDatesSet = new Set();

  const displayedShifts = [];
  const periodBuckets = new Map();

  activeShifts.forEach(item => {
    const isLegacy = item.is_legacy === true;
    const stdMin = item.std_minutes || 0;
    let stdP = item.std_pay || 0;
    if (!isLegacy && stdMin > 0 && stdP < STD_MIN_PAY) {
      stdP = Math.max(STD_MIN_PAY, (stdMin / 60) * HOURLY_RATE);
    }

    const delP = item.del_pay || 0;
    const isDel = item.has_delivery || delP > 0;
    const tipP = getItemTipPay(item);
    // Les pourboires (tipP) ne sont PAS comptés dans la paie du mois ni dans le cumul global
    const employerPay = isLegacy ? Number(item.total_pay || stdP) : (stdP + delP);
    const itemTotal = employerPay > 0 ? employerPay : tipP;
    const hasWork = isLegacy || stdMin > 0 || stdP > 0 || isDel;
    const hasProof = itemHasProof(item);

    allTotalPay += employerPay;
    if (isLegacy) allLegacyCount++;
    else if (item.date && hasWork) allWorkedDatesSet.add(item.date);

    const pInfo = getPayPeriodForDateStr(item.date);
    const pKey = `${pInfo.year}-${String(pInfo.month + 1).padStart(2, '0')}`;
    if (!periodBuckets.has(pKey)) {
      periodBuckets.set(pKey, { year: pInfo.year, month: pInfo.month, total: 0, workedDates: new Set(), workedDays: 0, legacyCount: 0 });
    }
    const bucket = periodBuckets.get(pKey);
    bucket.total += employerPay;
    if (isLegacy) bucket.legacyCount++;
    else if (item.date && hasWork) {
      bucket.workedDates.add(item.date);
      bucket.workedDays = bucket.workedDates.size;
    }

    const inPeriod = item.date >= bounds.startYMD && item.date <= bounds.endYMD;
    if (inPeriod) {
      monthStdMin += stdMin;
      if (isLegacy) {
        monthStdPay += employerPay;
        monthLegacyCount++;
      } else {
        monthStdPay += stdP;
        if ((stdMin > 0 || stdP > 0) && item.date) monthStdDatesSet.add(item.date);
        if (isDel) monthDelCount++;
        monthDelPay += delP;
        if (tipP > 0) {
          monthTipCount++;
          monthTipPay += tipP;
        }
        if (item.date && hasWork) monthWorkedDatesSet.add(item.date);
        if (!hasProof && hasWork) monthMissingProofs++;
      }
    }

    const matchesFilter =
      logFilterMode === 'all' ||
      (logFilterMode === 'period' && inPeriod) ||
      (logFilterMode === 'noproof' && !isLegacy && hasWork && !hasProof);

    if (matchesFilter) {
      displayedShifts.push({ item, inPeriod, computedStdPay: stdP, tipP, isLegacy, hasProof, itemTotal, employerPay });
    }
  });

  const allWorkedDays = allWorkedDatesSet.size;
  const monthWorkedDays = monthWorkedDatesSet.size;
  // La paie du mois = Prestations + Livraisons uniquement (hors pourboires)
  const currentMonthTotalPay = monthStdPay + monthDelPay;
  latestRenderedPeriodStats = {
    stdPay: monthStdPay,
    delPay: monthDelPay,
    tipPay: monthTipPay,
    totalPay: currentMonthTotalPay
  };

  const proofAlertBtn = document.getElementById('period-missing-proof-badge');
  if (monthMissingProofs > 0) {
    proofAlertBtn.innerHTML = `${PX_ICO.warn} ${monthMissingProofs} sans photo`;
    proofAlertBtn.classList.remove('all-ok');
    proofAlertBtn.style.display = 'inline-flex';
  } else {
    proofAlertBtn.style.display = 'none';
  }

  const histInlineCountEl = document.getElementById('history-inline-count');
  if (histInlineCountEl) {
    histInlineCountEl.textContent = `${displayedShifts.length} entrée${displayedShifts.length > 1 ? 's' : ''}`;
  }

  const listEl = document.getElementById('log-list');
  if (displayedShifts.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Aucune entrée pour ce filtre.</div>`;
  } else {
    listEl.innerHTML = '';
    const groups = [];
    const groupMap = new Map();

    displayedShifts.forEach(entry => {
      const wInfo = entry.isLegacy
        ? { key: `legacy-${entry.item.date.slice(0, 7)}`, label: `MOIS ANTÉRIEUR IMPORTÉ` }
        : getWeekInfo(entry.item.date);

      if (!groupMap.has(wInfo.key)) {
        const newGroup = { key: wInfo.key, label: wInfo.label, subtotal: 0, workedCount: 0, entries: [] };
        groupMap.set(wInfo.key, newGroup);
        groups.push(newGroup);
      }
      const g = groupMap.get(wInfo.key);
      g.entries.push(entry);
      g.subtotal += entry.employerPay !== undefined ? entry.employerPay : entry.itemTotal;
      if (!entry.isLegacy && (entry.employerPay || 0) > 0) g.workedCount++;
    });

    let cascadeIndex = 0;
    groups.forEach(group => {
      const groupWrapper = document.createElement('div');
      groupWrapper.className = 'week-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'week-header';
      const countLabel = group.workedCount > 0 ? ` (${group.workedCount} j)` : '';
      headerEl.innerHTML = `
        <span>${escapeHtml(group.label)}</span>
        <strong>Sous-total : +${group.subtotal.toFixed(2)} €${countLabel}</strong>
      `;
      groupWrapper.appendChild(headerEl);

      const groupList = document.createElement('div');
      groupList.className = 'log-list';

      group.entries.forEach(({ item, inPeriod, computedStdPay, tipP = 0, isLegacy, hasProof, itemTotal }) => {
        const stdP = computedStdPay;
        const delP = item.del_pay || 0;

        const card = document.createElement('div');
        const isJustAdded = highlightedShiftId && item.id === highlightedShiftId;
        const kindClass = isLegacy
          ? ' legacy-item'
          : (stdP > 0 ? ' kind-prest' : ((item.has_delivery || delP > 0) ? ' kind-delivery' : (tipP > 0 ? ' kind-tip' : '')));
        card.className = 'log-item compact-row'
          + (isLegacy ? '' : (inPeriod ? ' in-current-period' : ''))
          + kindClass
          + (isJustAdded ? ' just-added-flash' : '');
        card.setAttribute('data-shift-id', String(item.id));
        card.style.setProperty('--item-index', String(Math.min(cascadeIndex, 10)));
        cascadeIndex++;

        let photoBtnHtml = '';
        if (!isLegacy) {
          photoBtnHtml = hasProof
            ? `<button type="button" class="compact-icon-btn photo-ok" data-kind="compact-view" data-photo-act="view" data-photo-id="${item.id}" title="Photo jointe — cliquer pour voir ou remplacer" aria-label="Voir la photo jointe">${CAM_SVG}<span>✓</span></button>`
            : `<button type="button" class="compact-icon-btn photo-miss missing-photo" data-kind="compact-add" data-photo-act="add" data-photo-id="${item.id}" title="Ajouter une photo de preuve" aria-label="Ajouter une photo de preuve">${CAM_SVG}<span>+</span></button>`;
        }

        const offlineBadge = item._offlinePending || String(item.id).startsWith('offline_')
          ? `<span class="shift-pill pill-offline-sync">${PX_ICO.hourglass} HORS-LIGNE</span>`
          : '';

        let mainLineHtml = '';
        if (isLegacy) {
          mainLineHtml = `
            <span class="compact-date">${escapeHtml(item.note)}</span>
            <span class="shift-pill pill-legacy">Importé</span>${offlineBadge}
          `;
        } else {
          const stdMin = item.std_minutes || 0;
          const startSafe = escapeHtml(item.std_start);
          const endSafe = escapeHtml(item.std_end);
          const stdText = stdMin > 0 ? `<span class="shift-pill pill-standard">${PX_ICO.prest} Prest. ${startSafe} - ${endSafe} (${formatHoursMin(stdMin)})</span>` : '';
          let delText = '';
          if (item.has_delivery || delP > 0) {
            const delMin = item.del_minutes || 0;
            const detailDur = delMin > 150 ? ` ${formatHoursMin(delMin)}` : '';
            const delKm = typeof getItemDelKm === 'function' ? getItemDelKm(item) : 0;
            const kmInfo = delKm > 0 ? ` • ${formatKm(delKm)}` : '';
            delText = `<span class="shift-pill pill-delivery">${PX_ICO.crate} Livr.${detailDur}${kmInfo} (${delP.toFixed(0)}€)</span>`;
          }
          const tipText = tipP > 0 ? `<span class="shift-pill pill-tip">${PX_ICO.gem} +${tipP.toFixed(2)}€</span>` : '';
          const noteSpan = item.note ? `<span class="compact-note">— ${escapeHtml(item.note)}</span>` : '';
          mainLineHtml = `
            <span class="compact-date">${formatDateWithDayFR(item.date)}</span>
            ${noteSpan}
            <span class="compact-pills">${stdText}${delText}${tipText}${offlineBadge}</span>
          `;
        }

        const safeIdAttr = typeof item.id === 'number' ? item.id : `'${escapeHtml(item.id)}'`;
        card.innerHTML = `
          <div class="compact-row-left">${mainLineHtml}</div>
          <div class="compact-row-right">
            <span class="compact-row-pay">+${itemTotal.toFixed(2)} €</span>
            <div class="compact-row-btns">
              ${photoBtnHtml}
              <button type="button" class="compact-icon-btn edit-btn" onclick="startEditShift(${safeIdAttr})" title="Modifier" aria-label="Modifier cette entrée">✎</button>
              <button type="button" class="compact-icon-btn del-btn" onclick="deleteShift(${safeIdAttr})" title="Supprimer" aria-label="Supprimer cette entrée">✕</button>
            </div>
          </div>
        `;
        groupList.appendChild(card);
      });

      groupWrapper.appendChild(groupList);
      listEl.appendChild(groupWrapper);
    });
  }

  const monthStdDays = monthStdDatesSet.size;
  const avgStdMin = monthStdDays > 0 ? Math.round(monthStdMin / monthStdDays) : 0;
  const displayStdPay = holdCounterDisplayValues ? holdCounterDisplayValues.stdPay : monthStdPay;
  const displayDelPay = holdCounterDisplayValues ? holdCounterDisplayValues.delPay : monthDelPay;
  const displayTipPay = holdCounterDisplayValues ? (holdCounterDisplayValues.tipPay || 0) : monthTipPay;
  const displayTotalPay = holdCounterDisplayValues ? holdCounterDisplayValues.totalPay : currentMonthTotalPay;

  if (holdCounterDisplayValues || typeof animateStatIfChanged !== 'function') {
    document.getElementById('month-std-pay').textContent = `${displayStdPay.toFixed(2)} €`;
    document.getElementById('month-del-pay').textContent = `${displayDelPay.toFixed(2)} €`;
    const tipPayEl = document.getElementById('month-tip-pay');
    if (tipPayEl) tipPayEl.textContent = `${displayTipPay.toFixed(2)} €`;
    document.getElementById('month-total-pay').textContent = `${displayTotalPay.toFixed(2)} €`;
    if (typeof lastAnimatedStatValues !== 'undefined') {
      lastAnimatedStatValues.set('month-std-pay', displayStdPay);
      lastAnimatedStatValues.set('month-del-pay', displayDelPay);
      lastAnimatedStatValues.set('month-tip-pay', displayTipPay);
      lastAnimatedStatValues.set('month-total-pay', displayTotalPay);
    }
  } else {
    animateStatIfChanged('month-std-pay', displayStdPay, 380);
    animateStatIfChanged('month-del-pay', displayDelPay, 380);
    animateStatIfChanged('month-tip-pay', displayTipPay, 380);
    animateStatIfChanged('month-total-pay', displayTotalPay, 440);
  }
  document.getElementById('month-std-hours').textContent = `${formatHoursMin(monthStdMin)} • Moy. ${formatHoursMin(avgStdMin)}/j`;
  document.getElementById('month-del-count').textContent = `${monthDelCount} livraison${monthDelCount > 1 ? 's' : ''}`;
  const tipCountEl = document.getElementById('month-tip-count');
  if (tipCountEl) tipCountEl.textContent = `${monthTipCount} pourboire${monthTipCount > 1 ? 's' : ''}`;

  let periodDaysLabel = `${monthWorkedDays} journée${monthWorkedDays > 1 ? 's' : ''} travaillée${monthWorkedDays > 1 ? 's' : ''}`;
  if (monthLegacyCount > 0) {
    periodDaysLabel += ` (+ ${monthLegacyCount} mois importé${monthLegacyCount > 1 ? 's' : ''})`;
  }
  document.getElementById('month-total-days').textContent = periodDaysLabel;

  document.getElementById('all-total-pay').textContent = `${allTotalPay.toFixed(2)} €`;
  document.getElementById('global-inline-summary').textContent = `${allTotalPay.toFixed(2)} €`;
  let globalDaysLabel = `${allWorkedDays} journée${allWorkedDays > 1 ? 's' : ''} travaillée${allWorkedDays > 1 ? 's' : ''}`;
  if (allLegacyCount > 0) {
    globalDaysLabel += ` • ${allLegacyCount} mois antérieur${allLegacyCount > 1 ? 's' : ''} importé${allLegacyCount > 1 ? 's' : ''}`;
  }
  document.getElementById('all-total-days').textContent = globalDaysLabel;

  renderMonthlyChart(periodBuckets);
  if (typeof renderPeriodAnomalies === 'function') {
    renderPeriodAnomalies();
  }
  if (typeof runPayCheckComparison === 'function') {
    runPayCheckComparison();
  }
  if (typeof window.renderCalendarView === 'function') {
    window.renderCalendarView();
  }
  if (typeof renderCategoryViews === 'function') {
    renderCategoryViews();
  }
}

function renderMonthlyChart(periodBuckets) {
  const container = document.getElementById('monthly-summary-list');
  if (!container) return;
  const sortedKeys = Array.from(periodBuckets.keys()).sort().reverse();
  if (sortedKeys.length === 0) {
    container.innerHTML = `<div class="empty-state">Aucun historique mensuel disponible.</div>`;
    return;
  }

  let maxTotal = 0;
  sortedKeys.forEach(k => {
    const b = periodBuckets.get(k);
    if (b.total > maxTotal) maxTotal = b.total;
  });

  const isGlobalOpen = document.getElementById('global-collapsible-body')?.classList.contains('open');
  container.innerHTML = '';

  sortedKeys.forEach((k, idx) => {
    const b = periodBuckets.get(k);
    const widthPct = maxTotal > 0 ? Math.max(4, Math.round((b.total / maxTotal) * 100)) : 0;
    const details = [];
    if (b.workedDays > 0) details.push(`${b.workedDays} j`);
    if (b.legacyCount > 0) details.push(`importé`);

    const row = document.createElement('div');
    row.className = 'month-bar-item';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Voir la paie de ${MONTH_NAMES[b.month]} ${b.year} : ${b.total.toFixed(2)} euros`);
    row.onclick = () => {
      activePayYear = b.year;
      activePayMonth = b.month;
      triggerPeriodTransition(1);
      renderApp();
      document.getElementById('section-period').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    };
    row.onkeydown = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        row.click();
      }
    };

    const legacyBadge = b.legacyCount > 0 ? `<span class="month-legacy-badge">import</span>` : '';
    const daysBadge = b.workedDays > 0 ? `<span class="month-days-meta">${b.workedDays} j</span>` : '';

    const fillClass = isGlobalOpen ? 'month-bar-fill bar-filled' : 'month-bar-fill';
    row.innerHTML = `
      <div class="month-bar-top">
        <span class="month-bar-label">${MONTH_NAMES[b.month]} ${b.year} ${daysBadge}${legacyBadge}</span>
        <strong class="month-bar-amount">${b.total.toFixed(2)} €</strong>
      </div>
      <div class="month-bar-track">
        <div class="${fillClass}" style="width: ${widthPct}%; --bar-index: ${Math.min(idx, 8)};"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

