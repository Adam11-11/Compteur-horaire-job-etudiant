// ==========================================
// ONGLET AGENDA / CALENDRIER & NAVIGATION BASSE
// ==========================================
function initCalendarAndNavigation() {
  let calY, calM, calSel = null, view = 'counter';
  function pad(n) { return String(n).padStart(2, '0'); }

  function calc(it) {
    let std = it.std_minutes || 0, sp = it.std_pay || 0;
    if (std > 0 && sp < STD_MIN_PAY) sp = Math.max(STD_MIN_PAY, (std / 60) * HOURLY_RATE);
    const dp = it.del_pay || 0;
    const tp = getItemTipPay(it);
    return { std: std, sp: sp, dp: dp, tp: tp, total: sp + dp, del: !!(it.has_delivery || dp > 0) };
  }

  function dataByDate() {
    const map = {}, legacy = {};
    cachedShifts.forEach(it => {
      if (pendingDeletes.has(it.id) || !it.date) return;
      if (it.is_legacy === true) {
        const k = String(it.date).slice(0, 7);
        legacy[k] = (legacy[k] || 0) + Number(it.total_pay || it.std_pay || 0);
        return;
      }
      (map[it.date] = map[it.date] || []).push(it);
    });
    return { map: map, legacy: legacy };
  }

  function stat(l, v, c) {
    return '<div class="cal-stat ' + (c || '') + '"><span>' + l + '</span><b>' + v + '</b></div>';
  }
  function pill(cls, txt) {
    return '<span class="shift-pill ' + cls + '">' + txt + '</span>';
  }

  function entryHtml(it, idx) {
    const c = calc(it);
    let h = '<div class="cal-entry">';
    if (idx || it.note) h += '<div class="cal-entry-head">' + (idx ? '<b>ENTRÉE ' + idx + '</b>' : '') + escapeHtml(it.note || '') + '</div>';
    if (c.std > 0) h += pill('pill-standard', 'Prestation : ' + escapeHtml(it.std_start) + ' - ' + escapeHtml(it.std_end) + ' (' + formatHoursMin(c.std) + ') = ' + c.sp.toFixed(2) + '€');
    if (it.std_break > 0) h += pill('pill-standard', 'Pause non payée : ' + Number(it.std_break) + ' min');
    if (c.del) {
      const dm = it.del_minutes || 0;
      const dKm = typeof getItemDelKm === 'function' ? getItemDelKm(it) : 0;
      const fuelEst = dKm > 0 && typeof estimateFuelCost === 'function' ? estimateFuelCost(dKm) : 0;
      const fuelTxt = fuelEst > 0 ? ' (~' + fuelEst.toFixed(2) + '€ ess.)' : '';
      const kmSuffix = dKm > 0 ? ' • ' + formatKm(dKm) + fuelTxt : '';
      h += pill('pill-delivery', 'Livraison' + (dm > 150 ? ' (' + formatHoursMin(dm) + ' > 2h30)' : dm > 0 ? ' (' + formatHoursMin(dm) + ')' : ' (Forfait)') + kmSuffix + ' = ' + c.dp.toFixed(2) + '€');
    }
    if (c.tp > 0) {
      h += pill('pill-tip', '💰 Pourboire = +' + c.tp.toFixed(2) + '€');
    }
    if (it.proof_path) {
      h += '<button type="button" class="photo-badge" data-kind="badge" data-photo-act="view" data-photo-id="' + it.id + '" aria-label="Voir la photo jointe">' + CAM_SVG + '<span>✓ VOIR PHOTO</span></button>';
    } else {
      h += '<button type="button" class="photo-badge photo-missing-btn" data-kind="add-box" data-photo-act="add" data-photo-id="' + it.id + '" aria-label="Ajouter une photo">' + CAM_SVG + '<span>+ AJOUTER PHOTO</span></button>';
    }
    const safeCalId = typeof it.id === 'number' ? it.id : "'" + escapeHtml(it.id) + "'";
    h += '<div class="cal-entry-foot">' + (idx ? '<span class="cal-entry-total">+' + c.total.toFixed(2) + ' €</span>' : '<span></span>') +
         '<button type="button" class="pixel-btn btn-edit" onclick="calEdit(' + safeCalId + ')">MODIFIER</button></div></div>';
    return h;
  }

  function renderDetail(d) {
    const el = document.getElementById('cal-detail');
    if (!el) return;
    if (!calSel) {
      el.innerHTML = '<p class="cal-hint">Clique sur un jour pour voir le détail ou ajouter une journée.</p>';
      return;
    }
    const list = d.map[calSel] || [];
    const p = getPayPeriodForDateStr(calSel);
    let h = '<h3 class="cal-detail-title pixel-font">' + escapeHtml(formatDateWithDayFR(calSel)) + '</h3><div class="cal-period">PAIE DE ' + MONTH_NAMES[p.month] + ' ' + p.year + '</div>';
    if (!list.length) {
      h += '<p class="cal-hint">Aucune journée enregistrée.</p><button type="button" class="pixel-btn" onclick="calAdd(\'' + calSel + '\')">+ AJOUTER CE JOUR</button>';
    } else {
      let tot = 0;
      list.forEach(it => { tot += calc(it).total; });
      h += '<div class="cal-day-total">+' + tot.toFixed(2) + ' €</div>';
      list.forEach((it, i) => { h += entryHtml(it, list.length > 1 ? i + 1 : 0); });
    }
    el.innerHTML = h;
    if (typeof animateElementClass === 'function') {
      animateElementClass(el, 'cal-detail-pop', 260);
    }
  }

  function renderCalendar(dir) {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    const today = toYMD(new Date());
    if (calY === undefined) {
      const n0 = new Date();
      calY = n0.getFullYear();
      calM = n0.getMonth();
      calSel = today;
    }
    const d = dataByDate();
    const ym = calY + '-' + pad(calM + 1);
    document.getElementById('cal-title').textContent = MONTH_NAMES[calM] + ' ' + calY;
    const lead = (new Date(calY, calM, 1, 12).getDay() + 6) % 7;
    const days = new Date(calY, calM + 1, 0).getDate();
    const cells = [];
    let nDays = 0, mins = 0, dels = 0;
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell out" aria-hidden="true"></div>');
    for (let n = 1; n <= days; n++) {
      const ymd = ym + '-' + pad(n);
      const list = d.map[ymd] || [];
      let cls = 'cal-cell', amt = '', dots = '', tot = 0;
      if (list.length) {
        let hasStd = false, hasDel = false, hasTip = false, miss = false, hasPhoto = false;
        list.forEach(it => {
          const c = calc(it);
          tot += c.total;
          mins += c.std;
          if (c.std > 0) hasStd = true;
          if (c.del) { hasDel = true; dels++; }
          if (c.tp > 0) hasTip = true;
          if (!itemHasProof(it)) miss = true;
          if (it.proof_path) hasPhoto = true;
        });
        nDays++;
        cls += ' worked' + (miss ? ' noproof' : '');
        dots = (hasStd ? '<i class="d"></i>' : '') + (hasDel ? '<i class="d l"></i>' : '') + (hasTip ? '<i class="d t"></i>' : '') + (hasPhoto ? '<i class="d p"></i>' : '');
        amt = '<span class="cal-amt">' + Math.round(tot) + '€</span>';
      }
      if (ymd === today) cls += ' today';
      if (ymd === calSel) cls += ' sel';
      cells.push('<button type="button" class="' + cls + '" data-date="' + ymd + '" aria-pressed="' + (ymd === calSel) + '" aria-label="' +
        formatDateWithDayFR(ymd) + (list.length ? ', ' + tot.toFixed(2) + ' euros' : ', aucune journée') + '"><span class="cal-top"><span>' + n +
        '</span><span class="cal-dots">' + dots + '</span></span>' + amt + '</button>');
    }
    while (cells.length % 7) cells.push('<div class="cal-cell out" aria-hidden="true"></div>');
    grid.innerHTML = cells.join('');
    const lg = d.legacy[ym];
    document.getElementById('cal-stats').innerHTML = stat('JOURS', nDays) + stat('HEURES', formatHoursMin(mins)) + stat('LIVRAISONS', dels) + (lg ? '<p class="cal-note">Mois importé : +' + lg.toFixed(2) + ' € (sans détail par jour)</p>' : '');
    if (dir) {
      grid.classList.remove('period-transition-next', 'period-transition-prev');
      void grid.offsetWidth;
      grid.classList.add(dir > 0 ? 'period-transition-next' : 'period-transition-prev');
      if (!prefersReducedMotion()) {
        grid.querySelectorAll('.cal-cell.worked').forEach((cell, idx) => {
          cell.style.setProperty('--cal-stagger', `${Math.min(idx, 12) * 28}ms`);
          cell.classList.add('cal-cell-pop');
        });
      }
    }
    renderDetail(d);
  }

  window.renderCalendarView = renderCalendar;
  window.calChange = function (delta) {
    const dt = new Date(calY, calM + delta, 1, 12);
    calY = dt.getFullYear();
    calM = dt.getMonth();
    calSel = null;
    renderCalendar(delta);
  };
  window.calToday = function () {
    const n = new Date();
    calY = n.getFullYear();
    calM = n.getMonth();
    calSel = toYMD(n);
    renderCalendar();
  };
  window.calEdit = function (id) {
    startEditShift(id);
  };
  window.calAdd = function (ymd) {
    window.setView('prestations');
    if (editingShiftId !== null || editingLegacyId !== null) cancelEdit();
    document.getElementById('shift-date').value = ymd;
    if (typeof checkFormDuplicateDate === 'function') checkFormDuplicateDate();
    scrollToForm();
  };
  window.setView = function (v, preserveEdit) {
    const changed = view !== v;
    view = v;
    document.body.setAttribute('data-view', v);
    document.querySelectorAll('[data-view-btn]').forEach(b => {
      const on = b.getAttribute('data-view-btn') === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (v === 'calendar') renderCalendar(1);
    if (v === 'counter' || v === 'prestations' || v === 'livraisons' || v === 'pourboires') {
      if (!preserveEdit && editingShiftId === null && editingLegacyId === null && typeof syncFormForCategoryView === 'function') {
        syncFormForCategoryView(v);
      }
      if (v !== 'counter' && typeof renderCategoryViews === 'function') renderCategoryViews();
    }
    if (changed) {
      window.scrollTo(0, 0);
      if (typeof triggerViewEntrance === 'function') triggerViewEntrance(v);
    }
    window.dispatchEvent(new Event('viewchange'));
    document.querySelectorAll('.view-tab.active, .bottom-nav a.is-active').forEach(el => {
      if (typeof animateElementClass === 'function') animateElementClass(el, 'nav-pop', 280);
    });
  };

  const calGridEl = document.getElementById('cal-grid');
  if (calGridEl) {
    calGridEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-date]');
      if (!b) return;
      calSel = b.getAttribute('data-date');
      if (typeof playClickSound === 'function') playClickSound();
      renderCalendar();
      const nb = document.querySelector('#cal-grid [data-date="' + calSel + '"]');
      if (nb) nb.focus({ preventScroll: true });
      if (window.innerWidth < 1024) {
        document.getElementById('cal-detail').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      }
    });
  }

  // --- NAVIGATION BASSE (Mobile / Tablette) ---
  const links = Array.from(document.querySelectorAll('.bottom-nav a'));
  function setActive() {
    const curView = document.body.getAttribute('data-view') || 'counter';
    links.forEach(a => {
      const targetView = a.getAttribute('data-bottom-view') || 'counter';
      const isCur = targetView === curView;
      a.classList.toggle('is-active', isCur);
      if (isCur) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('viewchange', setActive);
  links.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const targetView = a.getAttribute('data-bottom-view') || 'counter';
      window.setView(targetView);
    });
  });
  setActive();
}

