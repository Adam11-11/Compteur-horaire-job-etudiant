// ==========================================
// FORMULAIRE, SAISIE RAPIDE & CRUD SUPABASE
// ==========================================

// --- GÉNÉRATION DYNAMIQUE DES ANNÉES DU MOIS ANTÉRIEUR ---
function initLegacyYearSelect() {
  const select = document.getElementById('legacy-year');
  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(2026, currentYear + 1);
  select.innerHTML = '';
  for (let y = 2025; y <= maxYear; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === 2025) opt.selected = true;
    select.appendChild(opt);
  }
}

// --- SAISIE RAPIDE & LOCALSTORAGE ---
function getRecentPresets() {
  try {
    const raw = window.localStorage.getItem('pixelpay_recent_presets');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
    }
  } catch (e) {}
  return DEFAULT_PRESETS;
}

function saveRecentPreset(startStr, endStr) {
  if (!startStr || !endStr) return;
  const pair = `${startStr}-${endStr}`;
  try {
    const current = getRecentPresets().filter(p => p !== pair);
    current.unshift(pair);
    window.localStorage.setItem('pixelpay_recent_presets', JSON.stringify(current.slice(0, 3)));
  } catch (e) {}
  renderPresetPills();
}

function renderPresetPills() {
  const container = document.getElementById('preset-pills-container');
  if (!container) return;
  const presets = getRecentPresets();
  container.innerHTML = '';
  presets.forEach(pair => {
    const [s, e] = pair.split('-');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-pill';
    btn.textContent = `${s} - ${e}`;
    btn.setAttribute('aria-label', `Remplir horaires de ${s} à ${e}`);
    btn.onclick = () => {
      const startEl = document.getElementById('std-start');
      const endEl = document.getElementById('std-end');
      startEl.value = s;
      endEl.value = e;
      btn.classList.add('pill-active-flash');
      setTimeout(() => btn.classList.remove('pill-active-flash'), 260);
      if (typeof animateElementClass === 'function') {
        animateElementClass(startEl, 'input-pop-flash', 420);
        animateElementClass(endEl, 'input-pop-flash', 420);
      }
      calculateCurrentForm();
    };
    container.appendChild(btn);
  });
}

function setNowTime(inputId) {
  const now = new Date();
  let h = now.getHours();
  let m = Math.round(now.getMinutes() / 10) * 10;
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const input = document.getElementById(inputId);
  if (input) {
    input.value = `${hh}:${mm}`;
    if (typeof animateElementClass === 'function') {
      animateElementClass(input, 'input-pop-flash', 420);
    }
    calculateCurrentForm();
  }
}

function handleSwitchKey(e, callback) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    callback();
  }
}

function scrollToForm() {
  document.getElementById('section-form').scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth'
  });
}

function toggleLegacyForm() {
  const box = document.getElementById('legacy-container');
  box.classList.toggle('active');
}

// --- FORMULAIRE ET CALCUL EN DIRECT ---
function setDeliveryState(state) {
  hasDelivery = Boolean(state);
  const toggleEl = document.getElementById('del-toggle');
  const checkEl = document.getElementById('del-check-box');
  const extraBox = document.getElementById('del-extra-box');
  toggleEl.setAttribute('aria-checked', hasDelivery ? 'true' : 'false');
  if (hasDelivery) {
    toggleEl.classList.add('active');
    checkEl.textContent = '✓';
    extraBox.classList.add('visible');
  } else {
    toggleEl.classList.remove('active');
    checkEl.textContent = '';
    extraBox.classList.remove('visible');
    document.getElementById('del-start').value = '';
    document.getElementById('del-end').value = '';
    document.getElementById('del-duration-min').value = '';
    const vCheck = document.getElementById('del-vehicle-check');
    if (vCheck) vCheck.checked = false;
  }
  calculateCurrentForm();
}

function toggleDelivery() {
  setDeliveryState(!hasDelivery);
  playToggleSound(hasDelivery);
}

function addQuickTip(amount) {
  const inp = document.getElementById('tip-amount');
  if (!inp) return;
  const current = Math.max(0, Number(inp.value) || 0);
  const next = current + Number(amount);
  inp.value = next.toFixed(2);
  if (typeof animateElementClass === 'function') {
    animateElementClass(inp, 'tip-input-flash', 440);
  }
  if (typeof spawnMicroPop === 'function') {
    spawnMicroPop(inp, `+${Number(amount)} €`, 'green');
  }
  playCoinTickSound(0.75);
  calculateCurrentForm();
}

function clearTipAmount() {
  const inp = document.getElementById('tip-amount');
  if (!inp) return;
  inp.value = '';
  playToggleSound(false);
  calculateCurrentForm();
}

function calculateCurrentForm() {
  const stdStart = document.getElementById('std-start').value;
  const stdEnd = document.getElementById('std-end').value;
  const stdBreak = Number(document.getElementById('std-break').value) || 0;

  let stdMinutes = getMinutesBetween(stdStart, stdEnd);
  if (stdMinutes > 0) {
    stdMinutes = Math.max(0, stdMinutes - stdBreak);
  }

  const rawStdPay = (stdMinutes / 60) * HOURLY_RATE;
  const stdPay = stdMinutes > 0 ? Math.max(STD_MIN_PAY, rawStdPay) : 0;

  let delMinutes = 0, delPay = 0, delLabel = 'Pas de livraison';
  if (hasDelivery) {
    const delStart = document.getElementById('del-start').value;
    const delEnd = document.getElementById('del-end').value;
    const delManualMin = Number(document.getElementById('del-duration-min').value) || 0;
    const timeRangeMin = getMinutesBetween(delStart, delEnd);
    delMinutes = timeRangeMin > 0 ? timeRangeMin : delManualMin;

    const hasPersonalVehicle = Boolean(document.getElementById('del-vehicle-check')?.checked);
    const vehicleBonus = hasPersonalVehicle ? DELIVERY_VEHICLE_BONUS : 0;
    const hourlyEquivalent = (delMinutes / 60) * HOURLY_RATE;
    delPay = Math.max(DELIVERY_DEFAULT_PAY, hourlyEquivalent) + vehicleBonus;
    const vehLabel = hasPersonalVehicle ? ' + 10€ véhicule' : '';

    if (delMinutes > 150) delLabel = `Livraison longue (${formatHoursMin(delMinutes)} x 12€${vehLabel} = ${delPay.toFixed(2)}€)`;
    else if (delMinutes > 0) delLabel = `Livraison (${formatHoursMin(delMinutes)} -> forfait ${delPay.toFixed(2)}€${vehLabel})`;
    else delLabel = `Livraison (forfait ${delPay.toFixed(2)}€${vehLabel})`;
  }

  const tipInputEl = document.getElementById('tip-amount');
  const tipPay = Math.max(0, Number(tipInputEl ? tipInputEl.value : 0) || 0);
  const tipLabel = tipPay > 0 ? ` | 💰 Pourboire +${tipPay.toFixed(2)}€ (hors paie)` : '';

  const totalPay = stdPay + delPay;
  const previewTotal = totalPay > 0 ? totalPay : tipPay;
  const stdLabelText = stdMinutes > 0 ? `${formatHoursMin(stdMinutes)} prestation (${stdPay.toFixed(2)}€${rawStdPay < STD_MIN_PAY ? ' min 60€' : ''})` : `0h00 prestation`;
  const liveDetailsEl = document.getElementById('live-details');
  if (liveDetailsEl) liveDetailsEl.textContent = `${stdLabelText} | ${delLabel}${tipLabel}`;
  const liveTotalEl = document.getElementById('live-total');
  const nextTotalText = `+ ${previewTotal.toFixed(2)} €`;
  if (liveTotalEl) {
    const changedTotal = liveTotalEl.textContent !== nextTotalText;
    liveTotalEl.textContent = nextTotalText;
    if (changedTotal && previewTotal > 0 && typeof animateElementClass === 'function') {
      animateElementClass(liveTotalEl, 'live-total-pop', 280);
    }
  }
  const submitBtn = document.getElementById('shift-submit-btn');
  if (submitBtn && !submitBtn.dataset.saving) {
    const wasDisabled = submitBtn.disabled;
    const willBeDisabled = previewTotal <= 0;
    submitBtn.disabled = willBeDisabled;
    if (wasDisabled && !willBeDisabled && typeof animateElementClass === 'function') {
      animateElementClass(submitBtn, 'btn-ready-pop', 360);
    }
  }
  return { stdMinutes, stdPay, hasDelivery, delMinutes, delPay, tipPay, totalPay, previewTotal };
}

function initFormCalculationListeners() {
  ['std-start', 'std-end', 'std-break', 'del-start', 'del-end', 'del-duration-min', 'del-vehicle-check', 'tip-amount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', calculateCurrentForm);
      el.addEventListener('change', calculateCurrentForm);
    }
  });
}

function getPeriodStatsSnapshot(year, monthIndex) {
  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id));
  const bounds = getPayPeriodBounds(year, monthIndex);
  let stdPay = 0, delPay = 0, tipPay = 0;
  activeShifts.forEach(item => {
    if (item.date >= bounds.startYMD && item.date <= bounds.endYMD) {
      const isLegacy = item.is_legacy === true;
      const stdMin = item.std_minutes || 0;
      let sP = item.std_pay || 0;
      if (!isLegacy && stdMin > 0 && sP < STD_MIN_PAY) {
        sP = Math.max(STD_MIN_PAY, (stdMin / 60) * HOURLY_RATE);
      }
      const dP = item.del_pay || 0;
      const tP = getItemTipPay(item);
      if (isLegacy) {
        stdPay += Number(item.total_pay || sP);
      } else {
        stdPay += sP;
        delPay += dP;
        tipPay += tP;
      }
    }
  });
  return { stdPay, delPay, tipPay, totalPay: stdPay + delPay };
}

// --- ÉDITION / ANNULATION D'UNE ENTRÉE ---
function startEditShift(id) {
  const item = cachedShifts.find(s => String(s.id) === String(id));
  if (!item) return;

  if (item.is_legacy) {
    if (typeof window.setView === 'function' && document.body.getAttribute('data-view') !== 'prestations') {
      window.setView('prestations', true);
    }
    editingLegacyId = item.id;
    editingShiftId = null;
    const [y, m] = String(item.date).split('-').map(Number);
    document.getElementById('legacy-container').classList.add('active');
    document.getElementById('legacy-month').value = String((m || 1) - 1);
    document.getElementById('legacy-year').value = String(y || 2025);
    document.getElementById('legacy-total-pay').value = Number(item.total_pay || item.std_pay || 0).toFixed(2);
    const cleanedNote = String(item.note || '').replace(/^Mois antérieur\s*(—\s*|\([^)]*\))?/, '').trim();
    document.getElementById('legacy-note').value = cleanedNote;
    document.getElementById('legacy-form-title').textContent = 'MODIFIER CE MOIS ANTÉRIEUR';
    document.getElementById('legacy-submit-btn').textContent = 'METTRE À JOUR CE MOIS';
    document.getElementById('legacy-cancel-btn').style.display = 'inline-flex';
    document.getElementById('legacy-container').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    return;
  }

  const curView = document.body.getAttribute('data-view') || 'counter';
  let targetView = curView;
  if (curView === 'counter' || curView === 'calendar') {
    if ((item.std_minutes || 0) > 0 || (item.std_pay || 0) > 0) {
      targetView = 'prestations';
    } else if (item.has_delivery || (item.del_pay || 0) > 0) {
      targetView = 'livraisons';
    } else if (getItemTipPay(item) > 0) {
      targetView = 'pourboires';
    } else {
      targetView = 'prestations';
    }
    if (typeof window.setView === 'function') {
      window.setView(targetView, true);
    }
  }

  editingShiftId = item.id;
  editingLegacyId = null;
  const editTitleMap = {
    prestations: 'MODIFIER LA PRESTATION',
    livraisons: 'MODIFIER LA LIVRAISON',
    pourboires: 'MODIFIER LE POURBOIRE'
  };
  document.getElementById('form-section-title').textContent = editTitleMap[targetView] || 'MODIFIER LA JOURNÉE';
  document.getElementById('shift-submit-btn').textContent = 'METTRE À JOUR';
  document.getElementById('shift-cancel-btn').style.display = 'inline-flex';

  document.getElementById('shift-date').value = item.date || toYMD(new Date());
  document.getElementById('shift-note').value = item.note || '';
  document.getElementById('std-start').value = item.std_start || '';
  document.getElementById('std-end').value = item.std_end || '';
  document.getElementById('std-break').value = String(item.std_break || 0);

  setDeliveryState(Boolean(item.has_delivery || (item.del_pay && item.del_pay > 0)));
  if (hasDelivery) {
    document.getElementById('del-duration-min').value = item.del_minutes ? String(item.del_minutes) : '';
    const baseDelPay = Math.max(DELIVERY_DEFAULT_PAY, ((item.del_minutes || 0) / 60) * HOURLY_RATE);
    const vCheck = document.getElementById('del-vehicle-check');
    if (vCheck) vCheck.checked = Number(item.del_pay || 0) >= baseDelPay + DELIVERY_VEHICLE_BONUS - 0.01;
  }

  const tipEl = document.getElementById('tip-amount');
  const existingTip = getItemTipPay(item);
  if (tipEl) {
    tipEl.value = existingTip > 0 ? existingTip.toFixed(2) : '';
  }

  // État photo existante de la journée
  if (formPhotoPreviewUrl) {
    URL.revokeObjectURL(formPhotoPreviewUrl);
    formPhotoPreviewUrl = null;
  }
  formSelectedPhotoFile = null;
  existingFormProofPath = item.proof_path || null;
  removeExistingFormPhoto = false;
  updateFormPhotoUI();

  calculateCurrentForm();
  if (typeof checkFormDuplicateDate === 'function') checkFormDuplicateDate();
  scrollToForm();
}

function cancelEdit() {
  editingShiftId = null;
  editingLegacyId = null;
  document.getElementById('shift-submit-btn').textContent = 'ENREGISTRER';
  document.getElementById('shift-cancel-btn').style.display = 'none';

  document.getElementById('legacy-form-title').textContent = 'IMPORT MOIS PASSÉ (DEPUIS AVRIL 2025)';
  document.getElementById('legacy-submit-btn').textContent = 'VALIDER CE MOIS ANTÉRIEUR';
  document.getElementById('legacy-cancel-btn').style.display = 'none';

  document.getElementById('shift-date').value = toYMD(new Date());
  document.getElementById('shift-note').value = '';
  document.getElementById('std-start').value = '';
  document.getElementById('std-end').value = '';
  document.getElementById('std-break').value = '0';
  const tipEl = document.getElementById('tip-amount');
  if (tipEl) tipEl.value = '';
  setDeliveryState(false);

  existingFormProofPath = null;
  removeExistingFormPhoto = false;
  clearFormPhoto(true);
  const aiBanner = document.getElementById('ai-scan-result-banner');
  if (aiBanner) aiBanner.style.display = 'none';
  if (typeof syncFormForCategoryView === 'function') {
    syncFormForCategoryView(document.body.getAttribute('data-view') || 'prestations');
  } else {
    document.getElementById('form-section-title').textContent = 'ENREGISTRER UNE PRESTATION';
    calculateCurrentForm();
  }
  if (typeof checkFormDuplicateDate === 'function') checkFormDuplicateDate();
}

// --- SAUVEGARDE / MISE À JOUR D'UNE JOURNÉE AVEC PHOTO SUR LE SITE ---
async function saveShift(e) {
  if (e) e.preventDefault();
  const calc = calculateCurrentForm();
  if (calc.stdMinutes === 0 && !calc.hasDelivery && calc.tipPay === 0) {
    showToast('Renseigne tes horaires, une livraison ou un pourboire !', { type: 'warn' });
    playErrorSound();
    return;
  }

  const submitBtn = document.getElementById('shift-submit-btn');
  const wasEditingId = editingShiftId;
  const originalText = wasEditingId ? 'METTRE À JOUR' : 'SAUVEGARDER DANS LE CLOUD';
  submitBtn.disabled = true;
  submitBtn.textContent = formSelectedPhotoFile ? 'ENVOI PHOTO...' : 'ENVOI...';

  const savedDateStr = document.getElementById('shift-date').value;
  const stdStartVal = document.getElementById('std-start').value;
  const stdEndVal = document.getElementById('std-end').value;

  const targetPeriod = getPayPeriodForDateStr(savedDateStr);
  const oldPeriodStats = getPeriodStatsSnapshot(targetPeriod.year, targetPeriod.month);
  const previousShiftIds = new Set(cachedShifts.map(s => s.id));

  let finalProofPath = existingFormProofPath || null;
  let newlyUploadedPath = null;
  const oldPathToCleanup = (existingFormProofPath && (formSelectedPhotoFile || removeExistingFormPhoto))
    ? existingFormProofPath
    : null;

  const encodeTipOrProofUrl = (hasPhoto) => {
    if (calc.tipPay > 0) return `tip:${calc.tipPay.toFixed(2)}`;
    return hasPhoto ? 'true' : null;
  };

  const payload = {
    date: savedDateStr,
    note: document.getElementById('shift-note').value.trim(),
    std_start: stdStartVal,
    std_end: stdEndVal,
    std_break: Number(document.getElementById('std-break').value) || 0,
    std_minutes: calc.stdMinutes,
    std_pay: calc.stdPay,
    has_delivery: calc.hasDelivery,
    del_minutes: calc.delMinutes,
    del_pay: calc.delPay,
    total_pay: calc.totalPay,
    proof_path: finalProofPath,
    has_proof: Boolean(finalProofPath),
    proof_url: encodeTipOrProofUrl(Boolean(finalProofPath)),
    is_legacy: false
  };

  try {
    if (typeof isLocalSaveInFlight !== 'undefined') isLocalSaveInFlight = true;
    if (!navigator.onLine) {
      throw new Error('Failed to fetch (offline)');
    }

    if (formSelectedPhotoFile) {
      const upRes = await uploadPhotoToSupabase(formSelectedPhotoFile);
      newlyUploadedPath = upRes.path;
      finalProofPath = newlyUploadedPath;
    } else if (removeExistingFormPhoto) {
      finalProofPath = null;
    }

    const hasPhotoNow = Boolean(finalProofPath);
    payload.proof_path = finalProofPath;
    payload.has_proof = hasPhotoNow;
    payload.proof_url = encodeTipOrProofUrl(hasPhotoNow);

    let queryError = null;
    if (editingShiftId && !String(editingShiftId).startsWith('offline_')) {
      const { error } = await supabaseClient.from('shifts').update(payload).eq('id', editingShiftId);
      queryError = error;
    } else {
      const { error } = await supabaseClient.from('shifts').insert([payload]);
      queryError = error;
    }

    if (queryError) {
      if (newlyUploadedPath) {
        supabaseClient.storage.from(PHOTO_BUCKET).remove([newlyUploadedPath]);
      }
      throw queryError;
    }

    if (oldPathToCleanup) {
      supabaseClient.storage.from(PHOTO_BUCKET).remove([oldPathToCleanup]);
    }

    if (stdStartVal && stdEndVal) {
      saveRecentPreset(stdStartVal, stdEndVal);
    }

    playSaveSuccessSound();
    showToast(wasEditingId ? 'Journée mise à jour !' : 'Journée sauvegardée !', { type: 'success' });
    initActivePeriodFromDate(parseYMD(savedDateStr));
    cancelEdit();

    // Basculer automatiquement vers le Compteur & Bilan pour voir le compteur s'augmenter en direct
    if (typeof window.setView === 'function') {
      window.setView('counter');
    }

    if (!prefersReducedMotion()) {
      holdCounterDisplayValues = oldPeriodStats;
    }

    await fetchShifts();
    holdCounterDisplayValues = null;

    if (wasEditingId) {
      highlightedShiftId = wasEditingId;
    } else {
      const newlyAdded = cachedShifts.find(s => !previousShiftIds.has(s.id));
      if (newlyAdded) highlightedShiftId = newlyAdded.id;
    }
    if (highlightedShiftId) {
      const rowEl = document.querySelector(`.log-item[data-shift-id="${highlightedShiftId}"]`);
      if (rowEl) rowEl.classList.add('just-added-flash');
      setTimeout(() => { highlightedShiftId = null; }, 2000);
    }

    const newPeriodStats = { ...latestRenderedPeriodStats };
    const totalChanged = Math.abs(newPeriodStats.totalPay - oldPeriodStats.totalPay) > 0.005 ||
      Math.abs((newPeriodStats.tipPay || 0) - (oldPeriodStats.tipPay || 0)) > 0.005;
    const addedGainForBadge = calc.totalPay > 0 ? calc.totalPay : calc.tipPay;

    if (!wasEditingId || totalChanged) {
      await runPostSaveSequence(oldPeriodStats, newPeriodStats, addedGainForBadge);
    } else {
      document.getElementById('month-std-pay').textContent = `${newPeriodStats.stdPay.toFixed(2)} €`;
      document.getElementById('month-del-pay').textContent = `${newPeriodStats.delPay.toFixed(2)} €`;
      const tipCardVal = document.getElementById('month-tip-pay');
      if (tipCardVal) tipCardVal.textContent = `${(newPeriodStats.tipPay || 0).toFixed(2)} €`;
      document.getElementById('month-total-pay').textContent = `${newPeriodStats.totalPay.toFixed(2)} €`;
    }
  } catch (err) {
    holdCounterDisplayValues = null;
    if (typeof isNetworkOrOfflineError === 'function' && isNetworkOrOfflineError(err)) {
      if (stdStartVal && stdEndVal) {
        saveRecentPreset(stdStartVal, stdEndVal);
      }
      if (!prefersReducedMotion()) {
        holdCounterDisplayValues = oldPeriodStats;
      }
      recordShiftOffline(payload, wasEditingId);
      holdCounterDisplayValues = null;
      playSaveSuccessSound();
      initActivePeriodFromDate(parseYMD(savedDateStr));
      cancelEdit();
      if (typeof window.setView === 'function') {
        window.setView('counter');
      }
      const newPeriodStats = { ...latestRenderedPeriodStats };
      const addedGainForBadge = calc.totalPay > 0 ? calc.totalPay : calc.tipPay;
      runPostSaveSequence(oldPeriodStats, newPeriodStats, addedGainForBadge);
      showToast('Mode Hors-Ligne : journée enregistrée sur l\'appareil ! Elle sera synchronisée dès le retour du réseau.', {
        type: 'warn',
        duration: 5500
      });
    } else {
      showToast(`Erreur : ${err.message || 'Impossible de sauvegarder'}`, {
        type: 'error',
        duration: 6000,
        actionText: 'RÉESSAYER',
        onAction: () => saveShift(null)
      });
    }
  } finally {
    setTimeout(() => {
      if (typeof isLocalSaveInFlight !== 'undefined') isLocalSaveInFlight = false;
    }, 600);
    submitBtn.disabled = false;
    submitBtn.textContent = editingShiftId ? 'METTRE À JOUR' : originalText;
  }
}

// --- SAUVEGARDE / MISE À JOUR MOIS ANTÉRIEUR ---
async function saveLegacyMonth(e) {
  if (e) e.preventDefault();
  const mIndex = Number(document.getElementById('legacy-month').value);
  const year = Number(document.getElementById('legacy-year').value);
  const totalPay = Number(document.getElementById('legacy-total-pay').value) || 0;
  const note = document.getElementById('legacy-note').value.trim();

  const submitBtn = document.getElementById('legacy-submit-btn');
  const originalText = editingLegacyId ? 'METTRE À JOUR CE MOIS' : 'VALIDER CE MOIS ANTÉRIEUR';
  submitBtn.disabled = true;
  submitBtn.textContent = 'ENVOI...';

  const pseudoDate = `${year}-${String(mIndex + 1).padStart(2, '0')}-15`;
  const payload = {
    date: pseudoDate,
    note: note ? `Mois antérieur — ${note}` : `Mois antérieur (${MONTH_NAMES[mIndex]} ${year})`,
    std_start: '',
    std_end: '',
    std_break: 0,
    std_minutes: 0,
    std_pay: totalPay,
    has_delivery: false,
    del_minutes: 0,
    del_pay: 0,
    total_pay: totalPay,
    proof_path: null,
    has_proof: false,
    proof_url: null,
    is_legacy: true
  };

  try {
    if (typeof isLocalSaveInFlight !== 'undefined') isLocalSaveInFlight = true;
    if (!navigator.onLine) {
      throw new Error('Failed to fetch (offline)');
    }
    let queryError = null;
    if (editingLegacyId && !String(editingLegacyId).startsWith('offline_')) {
      const { error } = await supabaseClient.from('shifts').update(payload).eq('id', editingLegacyId);
      queryError = error;
    } else {
      const { error } = await supabaseClient.from('shifts').insert([payload]);
      queryError = error;
    }

    if (queryError) throw queryError;

    activePayYear = year;
    activePayMonth = mIndex;

    playSaveSuccessSound();
    showToast(`Mois de ${MONTH_NAMES[mIndex]} ${year} enregistré !`, { type: 'success' });
    document.getElementById('legacy-total-pay').value = '';
    document.getElementById('legacy-note').value = '';
    document.getElementById('legacy-container').classList.remove('active');
    cancelEdit();
    await fetchShifts();
  } catch (err) {
    if (typeof isNetworkOrOfflineError === 'function' && isNetworkOrOfflineError(err)) {
      activePayYear = year;
      activePayMonth = mIndex;
      recordShiftOffline(payload, editingLegacyId);
      playSaveSuccessSound();
      document.getElementById('legacy-total-pay').value = '';
      document.getElementById('legacy-note').value = '';
      document.getElementById('legacy-container').classList.remove('active');
      cancelEdit();
      showToast(`Mois de ${MONTH_NAMES[mIndex]} ${year} gardé hors-ligne !`, { type: 'warn' });
    } else {
      showToast(`Erreur sauvegarde mois : ${err.message || 'Échec réseau'}`, {
        type: 'error',
        duration: 6000,
        actionText: 'RÉESSAYER',
        onAction: () => saveLegacyMonth(null)
      });
    }
  } finally {
    setTimeout(() => {
      if (typeof isLocalSaveInFlight !== 'undefined') isLocalSaveInFlight = false;
    }, 600);
    submitBtn.disabled = false;
    submitBtn.textContent = editingLegacyId ? 'METTRE À JOUR CE MOIS' : originalText;
  }
}

// --- RÉCUPÉRATION AVEC TRI DATE DESC PUIS CREATED_AT DESC + CACHE HORS-LIGNE ---
async function fetchShifts() {
  isLoadingShifts = true;
  const listEl = document.getElementById('log-list');
  if (cachedShifts.length === 0) {
    const localBackup = typeof loadShiftsFromLocalCache === 'function' ? loadShiftsFromLocalCache() : [];
    if (localBackup.length > 0) {
      cachedShifts = localBackup;
      renderApp();
    } else {
      listEl.innerHTML = `<div class="empty-state">⏳ Synchronisation avec le cloud Supabase...</div>`;
    }
  }

  if (!navigator.onLine) {
    isLoadingShifts = false;
    if (typeof updateNetworkStatusUI === 'function') updateNetworkStatusUI();
    renderApp();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('shifts')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    isLoadingShifts = false;
    if (!error) {
      const serverShifts = data || [];
      // Conserver les entrées locales non encore synchronisées en tête
      const unsyncedLocals = cachedShifts.filter(s => String(s.id).startsWith('offline_'));
      cachedShifts = [...unsyncedLocals, ...serverShifts];
      if (typeof saveShiftsToLocalCache === 'function') {
        saveShiftsToLocalCache(cachedShifts);
      }
      if (typeof updateNetworkStatusUI === 'function') updateNetworkStatusUI();
      renderApp();
    } else {
      throw error;
    }
  } catch (err) {
    isLoadingShifts = false;
    if (cachedShifts.length > 0) {
      renderApp();
      if (typeof updateNetworkStatusUI === 'function') updateNetworkStatusUI();
    } else {
      listEl.innerHTML = `<div class="empty-state">Mode hors-ligne ou erreur Supabase : ${escapeHtml(err.message || 'Réseau indisponible')}</div>`;
    }
  }
}

// --- SUPPRESSION AVEC UNDO 5 SECONDES (SUPPORT HORS-LIGNE) ---
function deleteShift(id) {
  if (pendingDeletes.has(id)) return;
  playDeleteSound();

  const itemToDelete = cachedShifts.find(s => String(s.id) === String(id));
  const photoPathToRemove = itemToDelete && itemToDelete.proof_path ? itemToDelete.proof_path : null;

  const timeoutId = setTimeout(async () => {
    pendingDeletes.delete(id);

    // Si c'est une entrée créée hors-ligne pas encore envoyée
    if (String(id).startsWith('offline_')) {
      const q = getOfflineQueue().filter(item => item.tempId !== id);
      saveOfflineQueue(q);
      cachedShifts = cachedShifts.filter(s => String(s.id) !== String(id));
      saveShiftsToLocalCache(cachedShifts);
      renderApp();
      return;
    }

    if (!navigator.onLine) {
      enqueueOfflineAction({ type: 'delete', targetId: id });
      cachedShifts = cachedShifts.filter(s => String(s.id) !== String(id));
      saveShiftsToLocalCache(cachedShifts);
      renderApp();
      return;
    }

    const { error } = await supabaseClient.from('shifts').delete().eq('id', id);
    if (error) {
      if (typeof isNetworkOrOfflineError === 'function' && isNetworkOrOfflineError(error)) {
        enqueueOfflineAction({ type: 'delete', targetId: id });
        cachedShifts = cachedShifts.filter(s => String(s.id) !== String(id));
        saveShiftsToLocalCache(cachedShifts);
        renderApp();
      } else {
        showToast(`Erreur suppression : ${error.message}`, { type: 'error' });
        fetchShifts();
      }
    } else {
      if (photoPathToRemove) {
        supabaseClient.storage.from(PHOTO_BUCKET).remove([photoPathToRemove]);
      }
      cachedShifts = cachedShifts.filter(s => String(s.id) !== String(id));
      if (typeof saveShiftsToLocalCache === 'function') saveShiftsToLocalCache(cachedShifts);
      renderApp();
    }
  }, 5000);

  pendingDeletes.set(id, timeoutId);
  renderApp();

  showToast('Entrée supprimée (5s)', {
    type: 'warn',
    duration: 5000,
    actionText: 'ANNULER',
    onAction: () => {
      clearTimeout(timeoutId);
      pendingDeletes.delete(id);
      renderApp();
      showToast('Suppression annulée !', { type: 'info', duration: 2200 });
    }
  });
}

