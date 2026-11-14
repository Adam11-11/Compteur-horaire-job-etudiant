// ==========================================
// FONCTIONNALITÉS AVANCÉES :
// 1. Pointage direct 1-clic (Chronomètre persistant)
// 2. Mode Hors-Ligne (Cache local + File de synchro Supabase)
// 3. Sauvegarde & Restauration JSON
// 4. Installation PWA & Service Worker
// ==========================================

// ==========================================
// 1. POINTAGE DIRECT EN 1 CLIC (CHRONO SERVICE)
// ==========================================
const LIVE_SESSION_KEY = 'pixelpay_live_session';
let liveClockInterval = null;
let cancelLiveConfirm = false;
let cancelLiveTimer = null;

function getLiveSession() {
  try {
    const raw = window.localStorage.getItem(LIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.startedAtMs) return parsed;
  } catch (e) {}
  return null;
}

function saveLiveSession(session) {
  try {
    if (!session) {
      window.localStorage.removeItem(LIVE_SESSION_KEY);
    } else {
      window.localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(session));
    }
  } catch (e) {}
}

function formatHHMM(dateObj) {
  let h = dateObj.getHours();
  let m = Math.round(dateObj.getMinutes() / 10) * 10;
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDurationHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startLiveShift() {
  const now = new Date();
  const roundedStart = formatHHMM(now);
  const session = {
    startDate: toYMD(now),
    startTime: roundedStart,
    startedAtMs: now.getTime(),
    isPaused: false,
    pauseStartedAtMs: null,
    accumulatedPauseMs: 0
  };
  saveLiveSession(session);
  const startInp = document.getElementById('std-start');
  if (startInp && editingShiftId === null) {
    startInp.value = roundedStart;
  }
  playSaveSuccessSound();
  showToast(`Service démarré (arrondi à ${session.startTime}) ! Bon courage 💪`, { type: 'success', duration: 3000 });
  updateLiveClockUI();
}

function toggleLiveShiftPause() {
  const session = getLiveSession();
  if (!session) return;
  const nowMs = Date.now();
  if (session.isPaused) {
    session.accumulatedPauseMs = (session.accumulatedPauseMs || 0) + Math.max(0, nowMs - (session.pauseStartedAtMs || nowMs));
    session.isPaused = false;
    session.pauseStartedAtMs = null;
    playToggleSound(true);
    showToast('Service repris ▶', { type: 'info', duration: 2000 });
  } else {
    session.isPaused = true;
    session.pauseStartedAtMs = nowMs;
    playToggleSound(false);
    showToast('Pause démarrée ⏸', { type: 'warn', duration: 2000 });
  }
  saveLiveSession(session);
  updateLiveClockUI();
}

function resetCancelLiveConfirm() {
  cancelLiveConfirm = false;
  clearTimeout(cancelLiveTimer);
  const btn = document.getElementById('live-cancel-btn');
  if (btn) btn.textContent = '✕ ANNULER';
}

function cancelLiveShift() {
  const session = getLiveSession();
  if (!session) return;
  if (!cancelLiveConfirm) {
    cancelLiveConfirm = true;
    const btn = document.getElementById('live-cancel-btn');
    if (btn) btn.textContent = 'SÛR ? RE-CLIQUE';
    cancelLiveTimer = setTimeout(resetCancelLiveConfirm, 3500);
    return;
  }
  resetCancelLiveConfirm();
  saveLiveSession(null);
  playDeleteSound();
  updateLiveClockUI();
  showToast('Pointage en direct annulé.', { type: 'warn', duration: 2500 });
}

async function finishLiveShift(autoSave = false) {
  const session = getLiveSession();
  if (!session) return;
  const now = new Date();
  const nowMs = now.getTime();
  const totalPauseMs = (session.accumulatedPauseMs || 0) + (session.isPaused && session.pauseStartedAtMs ? Math.max(0, nowMs - session.pauseStartedAtMs) : 0);
  const pauseMin = Math.max(0, Math.round(totalPauseMs / 60000));

  let endHHMM = formatHHMM(now);
  // Si on arrête dans la même tranche de 10 min, avancer d'une déciminute (+10 min) pour un calcul valide
  if (endHHMM === session.startTime) {
    const plusTen = new Date(nowMs + 10 * 60000);
    endHHMM = formatHHMM(plusTen);
  }

  if (editingShiftId !== null || editingLegacyId !== null) {
    cancelEdit();
  }

  document.getElementById('shift-date').value = session.startDate || toYMD(now);
  document.getElementById('std-start').value = session.startTime;
  document.getElementById('std-end').value = endHHMM;
  document.getElementById('std-break').value = String(pauseMin);

  saveLiveSession(null);
  resetCancelLiveConfirm();
  updateLiveClockUI();
  calculateCurrentForm();

  if (autoSave) {
    await saveShift(null);
  } else {
    playSaveSuccessSound();
    showToast(`Fin de service (${session.startTime} → ${endHHMM}) remplie dans le formulaire !`, { type: 'success', duration: 4000 });
    const formEl = document.getElementById('shift-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
  }
}

function renderLiveClockTick() {
  const session = getLiveSession();
  const box = document.getElementById('live-clock-box');
  if (!box) return;

  if (!session) {
    box.classList.remove('is-running', 'is-paused');
    if (liveClockInterval) {
      clearInterval(liveClockInterval);
      liveClockInterval = null;
    }
    return;
  }

  const nowMs = Date.now();
  const currentPauseMs = session.isPaused && session.pauseStartedAtMs ? Math.max(0, nowMs - session.pauseStartedAtMs) : 0;
  const totalPauseMs = (session.accumulatedPauseMs || 0) + currentPauseMs;
  const elapsedWorkMs = Math.max(0, nowMs - session.startedAtMs - totalPauseMs);

  const workedMins = Math.max(1, Math.floor(elapsedWorkMs / 60000));
  const rawPay = (workedMins / 60) * HOURLY_RATE;
  const estPay = Math.max(STD_MIN_PAY, rawPay);
  const pauseMins = Math.round(totalPauseMs / 60000);

  const statusText = document.getElementById('live-clock-status-text');
  const elapsedEl = document.getElementById('live-clock-elapsed');
  const payEl = document.getElementById('live-clock-pay');
  const pauseEl = document.getElementById('live-clock-pause');
  const pauseBtn = document.getElementById('live-pause-btn');

  if (statusText) {
    statusText.textContent = session.isPaused
      ? `⏸ EN PAUSE (DÉBUT SERVICE À ${session.startTime})`
      : `EN SERVICE DEPUIS ${session.startTime} (${formatDateFR(session.startDate)})`;
  }
  if (elapsedEl) {
    elapsedEl.textContent = formatDurationHMS(elapsedWorkMs);
    if (!session.isPaused && typeof animateElementClass === 'function') {
      animateElementClass(elapsedEl, 'chrono-tick', 200);
    }
  }
  if (payEl) payEl.textContent = `${estPay.toFixed(2)} €`;
  if (pauseEl) pauseEl.textContent = `${pauseMins} min`;
  if (pauseBtn) pauseBtn.textContent = session.isPaused ? '▶ REPRENDRE' : '⏸ PAUSE';

  // Détection d'oubli du chrono (> 10 heures)
  const TEN_HOURS_MS = 10 * 3600 * 1000;
  const overtimeWarnEl = document.getElementById('live-overtime-warning');
  if (elapsedWorkMs >= TEN_HOURS_MS) {
    if (overtimeWarnEl) {
      overtimeWarnEl.classList.add('visible');
      overtimeWarnEl.textContent = `⚠ TON POINTAGE TOURNE DEPUIS ${formatHoursMin(workedMins)} (> 10H) ! T'as oublié d'arrêter ton chrono ?`;
    }
    if (!session.overtimeToastShown) {
      session.overtimeToastShown = true;
      saveLiveSession(session);
      showToast("⚠ Ton chrono tourne depuis plus de 10h ! N'as-tu pas oublié de l'arrêter ?", { type: 'warn', duration: 7000 });
    }
  } else if (overtimeWarnEl) {
    overtimeWarnEl.classList.remove('visible');
  }
}

function updateLiveClockUI() {
  const session = getLiveSession();
  const box = document.getElementById('live-clock-box');
  if (!box) return;

  if (!session) {
    box.classList.remove('is-running', 'is-paused');
    const overtimeWarnEl = document.getElementById('live-overtime-warning');
    if (overtimeWarnEl) overtimeWarnEl.classList.remove('visible');
    if (liveClockInterval) {
      clearInterval(liveClockInterval);
      liveClockInterval = null;
    }
    return;
  }

  box.classList.toggle('is-running', !session.isPaused);
  box.classList.toggle('is-paused', Boolean(session.isPaused));
  renderLiveClockTick();

  if (!liveClockInterval) {
    liveClockInterval = setInterval(renderLiveClockTick, 1000);
  }
}

// ==========================================
// 3. MODE HORS-LIGNE (CACHE LOCAL & FILE DE SYNCHRO)
// ==========================================
const LOCAL_SHIFTS_CACHE_KEY = 'pixelpay_cached_shifts_v1';
const OFFLINE_QUEUE_KEY = 'pixelpay_offline_queue_v1';
let isSyncingOfflineQueue = false;

function saveShiftsToLocalCache(shifts) {
  try {
    window.localStorage.setItem(LOCAL_SHIFTS_CACHE_KEY, JSON.stringify(shifts || []));
  } catch (e) {}
}

function loadShiftsFromLocalCache() {
  try {
    const raw = window.localStorage.getItem(LOCAL_SHIFTS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function getOfflineQueue() {
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveOfflineQueue(queue) {
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue || []));
  } catch (e) {}
  updateNetworkStatusUI();
}

function isNetworkOrOfflineError(err) {
  if (!navigator.onLine) return true;
  const msg = String((err && err.message) || err || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed') || msg.includes('fetch');
}

function enqueueOfflineAction(action) {
  const queue = getOfflineQueue();
  queue.push({
    ...action,
    queueId: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    queuedAt: new Date().toISOString()
  });
  saveOfflineQueue(queue);
}

function recordShiftOffline(payload, editingId = null) {
  if (editingId) {
    const idx = cachedShifts.findIndex(s => String(s.id) === String(editingId));
    if (idx !== -1) {
      cachedShifts[idx] = { ...cachedShifts[idx], ...payload, _offlinePending: true };
    }
    if (String(editingId).startsWith('offline_')) {
      const queue = getOfflineQueue();
      const qIdx = queue.findIndex(q => q.tempId === editingId);
      if (qIdx !== -1) {
        queue[qIdx].payload = payload;
        saveOfflineQueue(queue);
      }
    } else {
      enqueueOfflineAction({ type: 'update', targetId: editingId, payload });
    }
  } else {
    const tempId = 'offline_' + Date.now();
    const localShift = {
      id: tempId,
      created_at: new Date().toISOString(),
      ...payload,
      _offlinePending: true
    };
    cachedShifts.unshift(localShift);
    enqueueOfflineAction({ type: 'insert', tempId, payload });
  }
  saveShiftsToLocalCache(cachedShifts);
  renderApp();
}

async function syncOfflineQueue(manualClick = false) {
  const queue = getOfflineQueue();
  if (!navigator.onLine) {
    if (manualClick) {
      showToast('Appareil hors-ligne : la synchronisation se fera automatiquement dès le retour du réseau.', { type: 'warn' });
    }
    updateNetworkStatusUI();
    return;
  }

  if (queue.length === 0) {
    if (manualClick) {
      showToast('Synchronisation avec le cloud Supabase...', { type: 'info', duration: 1800 });
      await fetchShifts();
    }
    updateNetworkStatusUI();
    return;
  }

  if (isSyncingOfflineQueue) return;
  isSyncingOfflineQueue = true;
  updateNetworkStatusUI();

  const remaining = [];
  let syncedCount = 0;

  for (const item of queue) {
    try {
      if (item.type === 'insert') {
        const { error } = await supabaseClient.from('shifts').insert([item.payload]);
        if (error) throw error;
        syncedCount++;
      } else if (item.type === 'update') {
        const { error } = await supabaseClient.from('shifts').update(item.payload).eq('id', item.targetId);
        if (error) throw error;
        syncedCount++;
      } else if (item.type === 'delete') {
        const { error } = await supabaseClient.from('shifts').delete().eq('id', item.targetId);
        if (error) throw error;
        syncedCount++;
      }
    } catch (err) {
      remaining.push(item);
    }
  }

  isSyncingOfflineQueue = false;
  saveOfflineQueue(remaining);

  if (syncedCount > 0) {
    playSaveSuccessSound();
    showToast(`✓ ${syncedCount} entrée${syncedCount > 1 ? 's' : ''} hors-ligne synchronisée${syncedCount > 1 ? 's' : ''} avec le cloud !`, { type: 'success' });
    await fetchShifts();
  } else if (manualClick && remaining.length > 0) {
    showToast('Impossible de synchroniser pour le moment.', { type: 'error' });
  }
}

function updateNetworkStatusUI() {
  const pill = document.getElementById('network-status-pill');
  const label = document.getElementById('network-status-label');
  if (!pill || !label) return;

  const queueLen = getOfflineQueue().length;
  pill.classList.remove('online', 'offline', 'syncing');

  if (isSyncingOfflineQueue) {
    pill.classList.add('syncing');
    label.textContent = 'SYNCHRO...';
  } else if (!navigator.onLine) {
    pill.classList.add('offline');
    label.textContent = queueLen > 0
      ? `HORS-LIGNE (${queueLen})`
      : 'HORS-LIGNE';
  } else if (queueLen > 0) {
    pill.classList.add('syncing');
    label.textContent = `SYNCHRO (${queueLen})`;
  } else {
    pill.classList.add('online');
    label.textContent = 'SYNCHRO';
  }
}

// ==========================================
// 4. SAUVEGARDE & RESTAURATION JSON
// ==========================================
function exportJSON() {
  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id));
  const backupObj = {
    app: 'Compteur Paella',
    version: 2,
    exportedAt: new Date().toISOString(),
    presets: getRecentPresets(),
    shifts: activeShifts
  };

  const jsonStr = JSON.stringify(backupObj, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `compteur-paella-backup-${toYMD(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  playSaveSuccessSound();
  showToast(`Sauvegarde JSON téléchargée (${activeShifts.length} entrées) !`, { type: 'success' });
}

function triggerImportJSON() {
  const inp = document.getElementById('json-import-input');
  if (inp) {
    inp.value = '';
    inp.click();
  }
}

function makeShiftSignature(s) {
  return [
    s.date || '',
    s.std_start || '',
    s.std_end || '',
    Number(s.total_pay || 0).toFixed(2),
    Boolean(s.is_legacy) ? '1' : '0'
  ].join('|');
}

async function handleImportJSONFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incomingShifts = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.shifts) ? parsed.shifts : null);

    if (!incomingShifts) {
      showToast('Fichier JSON invalide : aucune liste de journées trouvée.', { type: 'error' });
      return;
    }

    if (Array.isArray(parsed.presets) && parsed.presets.length > 0) {
      try {
        window.localStorage.setItem('pixelpay_recent_presets', JSON.stringify(parsed.presets.slice(0, 3)));
        renderPresetPills();
      } catch (e) {}
    }

    const existingSignatures = new Set(cachedShifts.map(makeShiftSignature));
    const toInsert = [];

    incomingShifts.forEach(item => {
      if (!item || !item.date) return;
      const sig = makeShiftSignature(item);
      if (existingSignatures.has(sig)) return;
      existingSignatures.add(sig);

      toInsert.push({
        date: item.date,
        note: String(item.note || ''),
        std_start: String(item.std_start || ''),
        std_end: String(item.std_end || ''),
        std_break: Number(item.std_break) || 0,
        std_minutes: Number(item.std_minutes) || 0,
        std_pay: Number(item.std_pay) || 0,
        has_delivery: Boolean(item.has_delivery),
        del_minutes: Number(item.del_minutes) || 0,
        del_pay: Number(item.del_pay) || 0,
        total_pay: Number(item.total_pay) || 0,
        proof_path: item.proof_path || null,
        has_proof: Boolean(item.has_proof || item.proof_path),
        proof_url: item.proof_url || (item.proof_path ? 'true' : null),
        is_legacy: Boolean(item.is_legacy)
      });
    });

    if (toInsert.length === 0) {
      showToast('Toutes les journées du fichier sont déjà présentes !', { type: 'info' });
      return;
    }

    if (navigator.onLine) {
      const { error } = await supabaseClient.from('shifts').insert(toInsert);
      if (error) throw error;
      await fetchShifts();
    } else {
      toInsert.forEach(payload => recordShiftOffline(payload, null));
    }

    playSaveSuccessSound();
    showToast(`Restauration réussie : ${toInsert.length} journée${toInsert.length > 1 ? 's' : ''} importée${toInsert.length > 1 ? 's' : ''} !`, { type: 'success' });
  } catch (err) {
    playErrorSound();
    showToast(`Erreur restauration JSON : ${err.message || 'Fichier invalide'}`, { type: 'error' });
  }
}

// ==========================================
// 5. INSTALLATION PWA & SERVICE WORKER
// ==========================================
let deferredPwaPrompt = null;

function initPWA() {
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const installBtn = document.getElementById('pwa-install-btn');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  if (isIOS && !isStandalone && installBtn) {
    installBtn.classList.add('visible');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if (installBtn && !isStandalone) {
      installBtn.classList.add('visible');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPwaPrompt = null;
    if (installBtn) installBtn.classList.remove('visible');
    showToast('Application installée sur ton écran d\'accueil ! 🎉', { type: 'success' });
  });
}

async function promptPWAInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const { outcome } = await deferredPwaPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPwaPrompt = null;
      document.getElementById('pwa-install-btn')?.classList.remove('visible');
    }
    return;
  }
  showToast('Sur iPhone/Safari : appuie sur le bouton Partager [↑] puis "Sur l\'écran d\'accueil" !', {
    type: 'info',
    duration: 6000
  });
}

function initNewFeatures() {
  document.body.removeAttribute('data-theme');
  try { window.localStorage.removeItem('pixelpay_theme'); } catch (e) {}
  updateLiveClockUI();
  updateNetworkStatusUI();
  initPWA();

  window.addEventListener('online', () => {
    updateNetworkStatusUI();
    syncOfflineQueue(false);
  });
  window.addEventListener('offline', () => {
    updateNetworkStatusUI();
    showToast('Mode Hors-Ligne activé : tes saisies seront gardées en mémoire sur l\'appareil.', { type: 'warn', duration: 4000 });
  });

  const jsonInp = document.getElementById('json-import-input');
  if (jsonInp) {
    jsonInp.addEventListener('change', () => {
      if (jsonInp.files && jsonInp.files[0]) {
        handleImportJSONFile(jsonInp.files[0]);
      }
    });
  }

  const shiftDateInp = document.getElementById('shift-date');
  if (shiftDateInp) {
    shiftDateInp.addEventListener('change', checkFormDuplicateDate);
    shiftDateInp.addEventListener('input', checkFormDuplicateDate);
  }

  const payCheckInp = document.getElementById('paycheck-received-input');
  if (payCheckInp) {
    payCheckInp.addEventListener('input', runPayCheckComparison);
    payCheckInp.addEventListener('change', runPayCheckComparison);
  }

  initVehicleSettingsEvents();
  initSupabaseRealtime();
}

// ==========================================
// 6. FICHE DE PAIE IMPRIMABLE (PDF)
// ==========================================
function getCurrentPeriodShiftsDetailed() {
  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id));
  const bounds = getPayPeriodBounds(activePayYear, activePayMonth);
  const inPeriod = activeShifts
    .filter(s => s.date >= bounds.startYMD && s.date <= bounds.endYMD && !s.is_legacy)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const vehicle = typeof getPersonalVehicle === 'function' ? getPersonalVehicle() : null;
  let totalStdMin = 0, totalStdPay = 0, totalDelCount = 0, totalDelPay = 0, totalDelKm = 0, totalDelFuelEst = 0, totalTipPay = 0;
  const lines = inPeriod.map(item => {
    const stdMin = item.std_minutes || 0;
    let stdP = item.std_pay || 0;
    if (stdMin > 0 && stdP < STD_MIN_PAY) {
      stdP = Math.max(STD_MIN_PAY, (stdMin / 60) * HOURLY_RATE);
    }
    const delP = item.del_pay || 0;
    const isDel = Boolean(item.has_delivery || delP > 0);
    const delKm = isDel && typeof getItemDelKm === 'function' ? getItemDelKm(item) : 0;
    const delFuelEst = delKm > 0 && vehicle && typeof estimateFuelCost === 'function' ? estimateFuelCost(delKm, vehicle) : 0;
    const tipP = getItemTipPay(item);

    totalStdMin += stdMin;
    totalStdPay += stdP;
    if (isDel) totalDelCount++;
    totalDelPay += delP;
    totalDelKm += delKm;
    totalDelFuelEst += delFuelEst;
    totalTipPay += tipP;

    return {
      item,
      stdMin,
      stdP,
      isDel,
      delMin: item.del_minutes || 0,
      delP,
      delKm,
      delFuelEst,
      tipP,
      employerRowTotal: stdP + delP,
      fullRowTotal: stdP + delP + tipP
    };
  });

  const employerTotal = totalStdPay + totalDelPay;
  totalDelKm = Math.round(totalDelKm * 10) / 10;
  totalDelFuelEst = Math.round(totalDelFuelEst * 100) / 100;

  return {
    bounds,
    monthLabel: `${MONTH_NAMES[activePayMonth]} ${activePayYear}`,
    vehicle,
    lines,
    totalStdMin,
    totalStdPay,
    totalDelCount,
    totalDelPay,
    totalDelKm,
    totalDelFuelEst,
    totalTipPay,
    employerTotal,
    advance: 0,
    remainingEmployer: employerTotal
  };
}

function openPrintablePaySheet() {
  const recap = getCurrentPeriodShiftsDetailed();
  if (recap.lines.length === 0) {
    showToast('Aucune journée sur cette période pour générer la fiche PDF.', { type: 'warn' });
    return;
  }

  const rowsHtml = recap.lines.map(r => `
    <tr>
      <td><strong>${escapeHtml(formatDateWithDayFR(r.item.date))}</strong></td>
      <td>${escapeHtml(r.item.note || '—')}</td>
      <td>${r.stdMin > 0 ? `${escapeHtml(r.item.std_start)} - ${escapeHtml(r.item.std_end)} (${formatHoursMin(r.stdMin)})` : '—'}</td>
      <td style="text-align:right">${r.stdP.toFixed(2)} €</td>
      <td style="text-align:right">${r.isDel ? `${r.delP.toFixed(2)} €${r.delKm > 0 ? ` <small style="color:#666">(${formatKm(r.delKm)}${r.delFuelEst > 0 ? ` • ~${r.delFuelEst.toFixed(2)}€ ess.` : ''})</small>` : ''}` : '—'}</td>
      <td style="text-align:right"><strong>${r.employerRowTotal.toFixed(2)} €</strong></td>
      <td style="text-align:center">${itemHasProof(r.item) ? '✓ Oui' : '—'}</td>
    </tr>
  `).join('');

  const delSummaryExtras = [];
  if (recap.totalDelKm > 0) delSummaryExtras.push(formatKm(recap.totalDelKm));
  if (recap.totalDelFuelEst > 0) delSummaryExtras.push(`ess. ~${recap.totalDelFuelEst.toFixed(2)} €`);
  const delSummarySuffix = delSummaryExtras.length > 0 ? ` • ${delSummaryExtras.join(' • ')}` : '';
  const fuelFootnoteHtml = recap.vehicle && recap.totalDelKm > 0
    ? `<div class="sub" style="margin-top:12px;">⛽ <strong>Estimation essence stricte</strong> (${escapeHtml(recap.vehicle.name)}, ${recap.vehicle.consumption.toFixed(1)} L/100km à ${recap.vehicle.fuelPrice.toFixed(2)} €/L) : <strong>~${recap.totalDelFuelEst.toFixed(2)} €</strong> pour ${formatKm(recap.totalDelKm)} aller-retour.</div>`
    : '';

  const sheetInnerHtml = `
    <h1>FICHE RÉCAPITULATIVE — PAIE DE ${escapeHtml(recap.monthLabel)}</h1>
    <div class="sub">Période du <strong>${formatDateWithDayFR(recap.bounds.startYMD)}</strong> au <strong>${formatDateWithDayFR(recap.bounds.endYMD)}</strong> • ${recap.lines.length} journée(s) travaillée(s)</div>

    <div class="summary-grid">
      <div class="box"><span>Heures Prestations (${formatHoursMin(recap.totalStdMin)})</span><strong>${recap.totalStdPay.toFixed(2)} €</strong></div>
      <div class="box"><span>Livraisons (${recap.totalDelCount}${delSummarySuffix})</span><strong>${recap.totalDelPay.toFixed(2)} €</strong></div>
      <div class="box"><span>Total Paie Période</span><strong>${recap.employerTotal.toFixed(2)} €</strong></div>
      <div class="box"><span>${recap.advance > 0 ? `Reste à payer (Acompte -${recap.advance.toFixed(0)}€)` : 'Net à percevoir'}</span><strong>${recap.remainingEmployer.toFixed(2)} €</strong></div>
    </div>

    <div class="pay-sheet-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Note / Détail</th>
            <th>Horaires Prestation</th>
            <th style="text-align:right">Gain Prestation</th>
            <th style="text-align:right">Livraison</th>
            <th style="text-align:right">Total Jour</th>
            <th style="text-align:center">Preuve Photo</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
    ${fuelFootnoteHtml}
  `;

  const overlay = document.getElementById('pay-sheet-overlay');
  const paper = document.getElementById('pay-sheet-paper');
  if (!overlay || !paper) return;

  paper.innerHTML = sheetInnerHtml;
  overlay.style.display = 'flex';
  overlay.scrollTop = 0;
  document.body.classList.add('pay-sheet-open');
  if (typeof playClickSound === 'function') playClickSound();

  try {
    if (!window.history.state || !window.history.state.paySheetOpen) {
      window.history.pushState({ paySheetOpen: true }, '');
    }
  } catch (e) {}
}

function closePrintablePaySheet(fromPopState = false) {
  const overlay = document.getElementById('pay-sheet-overlay');
  if (!overlay || overlay.style.display === 'none') return;

  overlay.style.display = 'none';
  document.body.classList.remove('pay-sheet-open');
  if (typeof playClickSound === 'function' && !fromPopState) playClickSound();

  if (!fromPopState) {
    try {
      if (window.history.state && window.history.state.paySheetOpen) {
        window.history.back();
      }
    } catch (e) {}
  }
}

function printPrintablePaySheet() {
  window.print();
}

// ==========================================
// 8. DÉTECTEUR D'INCOHÉRENCES / DOUBLONS & COMPARATEUR DE PAIE
// ==========================================
function checkFormDuplicateDate() {
  const dateInp = document.getElementById('shift-date');
  const warnEl = document.getElementById('form-duplicate-warning');
  if (!dateInp || !warnEl) return [];

  const ymd = dateInp.value;
  if (!ymd) {
    warnEl.classList.remove('visible');
    return [];
  }

  const curView = document.body.getAttribute('data-view') || 'prestations';
  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id) && !s.is_legacy);
  const duplicates = activeShifts.filter(s => {
    if (s.date !== ymd || String(s.id) === String(editingShiftId)) return false;
    if (curView === 'prestations') return (s.std_minutes || 0) > 0 || (s.std_pay || 0) > 0;
    if (curView === 'livraisons') return Boolean(s.has_delivery || (s.del_pay || 0) > 0);
    if (curView === 'pourboires') return getItemTipPay(s) > 0;
    return true;
  });

  if (duplicates.length > 0) {
    const summary = duplicates.map(d => {
      const parts = [];
      if (d.std_minutes > 0) parts.push(`${d.std_start}-${d.std_end}`);
      if (d.has_delivery || d.del_pay > 0) parts.push('Livraison');
      const tp = getItemTipPay(d);
      if (tp > 0) parts.push(`Pourboire +${tp.toFixed(2)}€`);
      return parts.join(' + ') || `${Number(d.total_pay || 0).toFixed(2)}€`;
    }).join(', ');
    warnEl.innerHTML = `⚠ <strong>Attention doublon :</strong> tu as déjà une entrée dans cette catégorie le <strong>${escapeHtml(formatDateWithDayFR(ymd))}</strong> (${escapeHtml(summary)}).`;
    warnEl.classList.add('visible');
  } else {
    warnEl.classList.remove('visible');
  }
  return duplicates;
}

function renderPeriodAnomalies() {
  const container = document.getElementById('period-anomalies-box');
  if (!container) return;

  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id) && !s.is_legacy);
  const bounds = getPayPeriodBounds(activePayYear, activePayMonth);
  const inPeriod = activeShifts.filter(s => s.date >= bounds.startYMD && s.date <= bounds.endYMD);

  const prestByDate = new Map();
  const delByDate = new Map();
  const longShifts = [];

  inPeriod.forEach(s => {
    if ((s.std_minutes || 0) > 0 || (s.std_pay || 0) > 0) {
      if (!prestByDate.has(s.date)) prestByDate.set(s.date, []);
      prestByDate.get(s.date).push(s);
    }
    if (s.has_delivery || (s.del_pay || 0) > 0) {
      if (!delByDate.has(s.date)) delByDate.set(s.date, []);
      delByDate.get(s.date).push(s);
    }
    if ((s.std_minutes || 0) > 12 * 60) {
      longShifts.push(s);
    }
  });

  const alertsHtml = [];

  prestByDate.forEach((list, dateStr) => {
    if (list.length > 1) {
      alertsHtml.push(`
        <div class="anomaly-alert-item">
          <span>⚠ <strong>DOUBLON PRESTATION :</strong> ${list.length} prestations enregistrées le <strong>${escapeHtml(formatDateWithDayFR(dateStr))}</strong></span>
        </div>
      `);
    }
  });

  delByDate.forEach((list, dateStr) => {
    if (list.length > 1) {
      alertsHtml.push(`
        <div class="anomaly-alert-item">
          <span>⚠ <strong>DOUBLON LIVRAISON :</strong> ${list.length} livraisons enregistrées le <strong>${escapeHtml(formatDateWithDayFR(dateStr))}</strong></span>
        </div>
      `);
    }
  });

  longShifts.forEach(s => {
    alertsHtml.push(`
      <div class="anomaly-alert-item">
        <span>⚠ <strong>DURÉE > 12H :</strong> ${formatHoursMin(s.std_minutes)} le <strong>${escapeHtml(formatDateWithDayFR(s.date))}</strong> (${escapeHtml(s.std_start)} → ${escapeHtml(s.std_end)}) — vérifie qu'il n'y a pas d'erreur d'heure.</span>
      </div>
    `);
  });

  if (alertsHtml.length > 0) {
    container.innerHTML = alertsHtml.join('');
    container.classList.add('has-anomalies');
  } else {
    container.innerHTML = '';
    container.classList.remove('has-anomalies');
  }

  checkFormDuplicateDate();
}

function togglePayCheckPanel() {
  const panel = document.getElementById('paycheck-compare-panel');
  const goalPanel = document.getElementById('goal-edit-panel');
  const advPanel = document.getElementById('advance-edit-panel');
  if (!panel) return;
  if (goalPanel) goalPanel.classList.remove('open');
  if (advPanel) advPanel.classList.remove('open');

  const isOpen = panel.classList.toggle('open');
  if (isOpen) {
    const inp = document.getElementById('paycheck-received-input');
    if (inp) {
      inp.focus();
      runPayCheckComparison();
    }
  }
}

function findMissingPayClues(missingAmount, recap) {
  const clues = [];
  const eps = 0.05;

  // 1. Multiple exact de livraisons forfait (30 €)
  const delCountEq = Math.round(missingAmount / DELIVERY_DEFAULT_PAY);
  if (delCountEq >= 1 && delCountEq <= 10 && Math.abs(missingAmount - delCountEq * DELIVERY_DEFAULT_PAY) < eps) {
    clues.push(`Équivalent exact à <strong>${delCountEq} livraison${delCountEq > 1 ? 's' : ''} forfait (${(delCountEq * DELIVERY_DEFAULT_PAY).toFixed(2)} €)</strong> oubliée${delCountEq > 1 ? 's' : ''}.`);
  }

  // 2. Multiple du minimum garanti (60 €)
  const minShiftEq = Math.round(missingAmount / STD_MIN_PAY);
  if (minShiftEq >= 1 && minShiftEq <= 5 && Math.abs(missingAmount - minShiftEq * STD_MIN_PAY) < eps) {
    clues.push(`Équivalent à <strong>${minShiftEq} journée${minShiftEq > 1 ? 's' : ''} au forfait minimum garanti (${(minShiftEq * STD_MIN_PAY).toFixed(2)} €)</strong>.`);
  }

  // 3. Correspondance exacte avec une journée enregistrée sur la période
  recap.lines.forEach(r => {
    if (Math.abs(r.employerRowTotal - missingAmount) < eps) {
      clues.push(`Correspond pile au total de ta journée du <strong>${escapeHtml(formatDateWithDayFR(r.item.date))} (${r.employerRowTotal.toFixed(2)} €)</strong> !`);
    } else if (r.stdP > 0 && Math.abs(r.stdP - missingAmount) < eps && r.stdP !== STD_MIN_PAY) {
      clues.push(`Correspond aux heures de prestation du <strong>${escapeHtml(formatDateWithDayFR(r.item.date))} (${r.stdP.toFixed(2)} €)</strong>.`);
    }
  });

  // 4. Vérifier si le patron a payé les services courts (< 5h) au taux réel 12€/h au lieu du minimum garanti 60€
  let shortShiftsDiff = 0;
  let shortShiftsCount = 0;
  recap.lines.forEach(r => {
    if (r.stdMin > 0) {
      const rawPay = (r.stdMin / 60) * HOURLY_RATE;
      if (rawPay < STD_MIN_PAY) {
        shortShiftsDiff += (STD_MIN_PAY - rawPay);
        shortShiftsCount++;
      }
    }
  });
  if (shortShiftsCount > 0 && Math.abs(missingAmount - shortShiftsDiff) < 0.5) {
    clues.push(`⚠ Correspond à l'écart du <strong>minimum garanti 60 €</strong> sur tes ${shortShiftsCount} service(s) de moins de 5h (${shortShiftsDiff.toFixed(2)} €) : ton patron a calculé à l'heure réelle au lieu du forfait 60 € min !`);
  }

  // 5. Équivalent en heures de prestation à 12€/h
  const hoursEq = missingAmount / HOURLY_RATE;
  const minsEq = Math.round(hoursEq * 60);
  if (minsEq >= 15 && minsEq % 15 === 0) {
    clues.push(`Équivalent en temps de travail : <strong>${formatHoursMin(minsEq)} de prestation à ${HOURLY_RATE} €/h</strong>.`);
  }

  return clues;
}

function runPayCheckComparison() {
  const inp = document.getElementById('paycheck-received-input');
  const resBox = document.getElementById('paycheck-result-box');
  if (!inp || !resBox) return;

  const rawVal = inp.value.trim();
  if (rawVal === '') {
    resBox.classList.remove('visible', 'match-ok', 'match-short', 'match-bonus');
    resBox.innerHTML = '';
    return;
  }

  const received = parseFloat(rawVal);
  if (isNaN(received) || received < 0) return;

  const recap = getCurrentPeriodShiftsDetailed();
  const expected = recap.remainingEmployer;
  const diff = received - expected;

  resBox.classList.remove('match-ok', 'match-short', 'match-bonus');
  resBox.classList.add('visible');

  if (Math.abs(diff) < 0.01) {
    resBox.classList.add('match-ok');
    resBox.innerHTML = `
      <div class="paycheck-verdict-title" style="color: var(--green-soft);">✅ COMPTE 100% BON !</div>
      <div>Le montant reçu (<strong>${received.toFixed(2)} €</strong>) correspond au centime près à ton compteur.</div>
    `;
  } else if (diff < 0) {
    const missing = Math.abs(diff);
    const clues = findMissingPayClues(missing, recap);
    resBox.classList.add('match-short');
    const cluesHtml = clues.length > 0
      ? `<ul class="paycheck-clues-list">${clues.map(c => `<li>${c}</li>`).join('')}</ul>`
      : `<div style="margin-top:6px;">Vérifie le détail jour par jour avec le bouton <strong>🖨 Fiche de paie PDF</strong>.</div>`;

    resBox.innerHTML = `
      <div class="paycheck-verdict-title" style="color: var(--red-light);">⚠ IL MANQUE ${missing.toFixed(2)} € !</div>
      <div>Attendu : <strong>${expected.toFixed(2)} €</strong> • Reçu : <strong>${received.toFixed(2)} €</strong></div>
      ${cluesHtml}
    `;
  } else {
    resBox.classList.add('match-bonus');
    resBox.innerHTML = `
      <div class="paycheck-verdict-title" style="color: var(--gold-soft);">🎉 +${diff.toFixed(2)} € EN PLUS !</div>
      <div>Tu as reçu <strong>${received.toFixed(2)} €</strong> pour <strong>${expected.toFixed(2)} €</strong> attendus (prime, pourboire ou arrondi).</div>
    `;
  }
}

// ==========================================
// 11. SYNCHRONISATION TEMPS RÉEL (SUPABASE REALTIME)
// ==========================================
let realtimeDebounceTimer = null;
let isLocalSaveInFlight = false;

function initSupabaseRealtime() {
  if (!supabaseClient || typeof supabaseClient.channel !== 'function') return;

  try {
    supabaseClient
      .channel('shifts-live-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        (payload) => {
          if (isLocalSaveInFlight) return;
          clearTimeout(realtimeDebounceTimer);
          realtimeDebounceTimer = setTimeout(async () => {
            const oldStats = getPeriodStatsSnapshot(activePayYear, activePayMonth);
            const newRecordId = payload && payload.new && payload.new.id ? payload.new.id : null;
            if (newRecordId) {
              highlightedShiftId = newRecordId;
              setTimeout(() => { highlightedShiftId = null; }, 2200);
            }

            await fetchShifts();
            const newStats = { ...latestRenderedPeriodStats };
            const delta = newStats.totalPay - oldStats.totalPay;

            if (Math.abs(delta) > 0.005) {
              playSaveSuccessSound();
              showToast('⚡ Synchronisé en direct depuis un autre appareil !', { type: 'info', duration: 3500 });
              await runPostSaveSequence(oldStats, newStats, Math.max(0, delta));
            } else {
              playClickSound();
              showToast('⚡ Mis à jour en direct !', { type: 'info', duration: 2500 });
            }
          }, 300);
        }
      )
      .subscribe();
  } catch (e) {}
}

// ==========================================
// 10. ONGLETS SPÉCIALISÉS : PRESTATIONS / LIVRAISONS / POURBOIRES
// ==========================================
let categoryScopeMode = 'period'; // 'period' | 'all'

function syncFormForCategoryView(viewName) {
  const titleEl = document.getElementById('form-section-title');
  const startInp = document.getElementById('std-start');
  const endInp = document.getElementById('std-end');
  const breakInp = document.getElementById('std-break');
  const tipInp = document.getElementById('tip-amount');
  const legacyBox = document.getElementById('legacy-container');

  if (viewName === 'livraisons') {
    if (titleEl) titleEl.textContent = 'ENREGISTRER UNE LIVRAISON';
    if (legacyBox) legacyBox.classList.remove('active');
    if (startInp) startInp.value = '';
    if (endInp) endInp.value = '';
    if (breakInp) breakInp.value = '0';
    if (tipInp) tipInp.value = '';
    setDeliveryState(true);
  } else if (viewName === 'pourboires') {
    if (titleEl) titleEl.textContent = 'ENREGISTRER UN POURBOIRE';
    if (legacyBox) legacyBox.classList.remove('active');
    if (startInp) startInp.value = '';
    if (endInp) endInp.value = '';
    if (breakInp) breakInp.value = '0';
    setDeliveryState(false);
  } else {
    if (titleEl) titleEl.textContent = 'ENREGISTRER UNE PRESTATION';
    if (tipInp) tipInp.value = '';
    setDeliveryState(false);
  }
  calculateCurrentForm();
  checkFormDuplicateDate();
}

function setCategoryScope(mode) {
  categoryScopeMode = mode === 'all' ? 'all' : 'period';
  if (typeof playClickSound === 'function') playClickSound();
  renderCategoryViews();
}

function editFromCategory(id) {
  startEditShift(id);
}

function buildCategoryHeaderAndNav(titleText, accentClass, summaryMetricsHtml, extraFooterHtml = '') {
  return `
    <div class="cat-summary-strip ${accentClass}">
      <div class="cat-strip-top">
        <div class="cat-strip-period">
          <button type="button" class="nav-btn compact-nav-btn" onclick="changePeriod(-1)" aria-label="Mois précédent">◀</button>
          <span class="cat-strip-month-label">PAIE DE ${MONTH_NAMES[activePayMonth]} ${activePayYear}</span>
          <button type="button" class="nav-btn compact-nav-btn" onclick="changePeriod(1)" aria-label="Mois suivant">▶</button>
        </div>
        <div class="cat-strip-scope">
          <button type="button" class="tab-btn compact-scope-btn ${categoryScopeMode === 'period' ? 'active' : ''}" onclick="setCategoryScope('period')">MOIS</button>
          <button type="button" class="tab-btn compact-scope-btn ${categoryScopeMode === 'all' ? 'active' : ''}" onclick="setCategoryScope('all')">TOUT</button>
          <button type="button" class="nav-btn compact-nav-btn compact-today-btn" onclick="resetToCurrentPeriod()" title="Revenir à aujourd'hui">AUJ.</button>
        </div>
      </div>
      <div class="cat-strip-metrics">
        ${summaryMetricsHtml}
      </div>
      ${extraFooterHtml}
    </div>
  `;
}

function buildCategoryCardHtml(item, badgeHtml, amountValue, idx = 0) {
  const hasProof = itemHasProof(item);
  const photoBtnHtml = hasProof
    ? `<button type="button" class="compact-icon-btn has-photo" data-kind="compact-view" data-photo-act="view" data-photo-id="${item.id}" title="Voir la photo jointe">${CAM_SVG}<span>✓</span></button>`
    : `<button type="button" class="compact-icon-btn missing-photo" data-kind="compact-add" data-photo-act="add" data-photo-id="${item.id}" title="Ajouter une photo">${CAM_SVG}<span>+</span></button>`;

  const safeIdAttr = typeof item.id === 'number' ? item.id : `'${escapeHtml(item.id)}'`;
  const noteSpan = item.note ? `<span class="compact-note">— ${escapeHtml(item.note)}</span>` : '';
  return `
    <div class="log-item compact-row in-current-period" data-shift-id="${escapeHtml(String(item.id))}" style="--item-index: ${Math.min(idx, 10)};">
      <div class="compact-row-left">
        <span class="compact-date">${formatDateWithDayFR(item.date)}</span>
        ${noteSpan}
        <span class="compact-pills">${badgeHtml}</span>
      </div>
      <div class="compact-row-right">
        <span class="compact-row-pay">+${amountValue.toFixed(2)} €</span>
        <div class="compact-row-btns">
          ${photoBtnHtml}
          <button type="button" class="compact-icon-btn edit-btn" onclick="editFromCategory(${safeIdAttr})" title="Modifier">✎</button>
          <button type="button" class="compact-icon-btn del" onclick="deleteShift(${safeIdAttr})" title="Supprimer">✕</button>
        </div>
      </div>
    </div>
  `;
}

function renderCategoryViews() {
  const activeShifts = cachedShifts.filter(s => !pendingDeletes.has(s.id) && !s.is_legacy);
  const bounds = getPayPeriodBounds(activePayYear, activePayMonth);

  // --- 1. ONGLET PRESTATIONS (HEURES DE TAF) ---
  const prestContainer = document.getElementById('prestations-view-content');
  if (prestContainer) {
    let monthCount = 0, monthMin = 0, monthPay = 0;
    let allCount = 0, allMin = 0, allPay = 0;
    const monthPrestDates = new Set();
    const rows = [];

    activeShifts.forEach(item => {
      const stdMin = item.std_minutes || 0;
      let stdP = item.std_pay || 0;
      if (stdMin > 0 && stdP < STD_MIN_PAY) {
        stdP = Math.max(STD_MIN_PAY, (stdMin / 60) * HOURLY_RATE);
      }
      if (stdMin <= 0 && stdP <= 0) return;

      const inPeriod = item.date >= bounds.startYMD && item.date <= bounds.endYMD;

      allCount++;
      allMin += stdMin;
      allPay += stdP;

      if (inPeriod) {
        monthCount++;
        monthMin += stdMin;
        monthPay += stdP;
        if (item.date) monthPrestDates.add(item.date);
      }

      if (categoryScopeMode === 'all' || inPeriod) {
        rows.push({ item, stdMin, stdP });
      }
    });

    const monthPrestDays = monthPrestDates.size;
    const avgMin = monthPrestDays > 0 ? Math.round(monthMin / monthPrestDays) : 0;
    const cardsHtml = rows.length === 0
      ? `<div class="empty-state">Aucune prestation sur cette sélection.</div>`
      : `<div class="log-list">${rows.map(({ item, stdMin, stdP }, idx) => {
          const pillHtml = `
            <span class="shift-pill pill-standard">${escapeHtml(item.std_start)} - ${escapeHtml(item.std_end)} (${formatHoursMin(stdMin)})</span>
            ${item.std_break > 0 ? `<span class="shift-pill pill-standard">Pause ${Number(item.std_break)}m</span>` : ''}
          `;
          return buildCategoryCardHtml(item, pillHtml, stdP, idx);
        }).join('')}</div>`;

    const metricsHtml = `
      <div class="cat-metric-chip"><span class="cat-metric-label">MOIS (${monthCount} j)</span><strong class="cat-metric-val">${monthPay.toFixed(2)} €</strong></div>
      <div class="cat-metric-chip"><span class="cat-metric-label">HEURES (moy. ${formatHoursMin(avgMin)})</span><strong class="cat-metric-val">${formatHoursMin(monthMin)}</strong></div>
    `;

    prestContainer.innerHTML = `${buildCategoryHeaderAndNav('PRESTATIONS', 'red-accent', metricsHtml)}${cardsHtml}`;
  }

  // --- 2. ONGLET LIVRAISONS ---
  const delContainer = document.getElementById('livraisons-view-content');
  if (delContainer) {
    const vehicle = typeof getPersonalVehicle === 'function' ? getPersonalVehicle() : null;
    let monthCount = 0, monthPay = 0, monthFlatCount = 0, monthLongCount = 0, monthKm = 0, monthFuelEst = 0;
    let allCount = 0, allPay = 0;
    const rows = [];

    activeShifts.forEach(item => {
      const delP = item.del_pay || 0;
      const isDel = Boolean(item.has_delivery || delP > 0);
      if (!isDel) return;

      const delMin = item.del_minutes || 0;
      const delKm = typeof getItemDelKm === 'function' ? getItemDelKm(item) : 0;
      const delFuelEst = delKm > 0 && vehicle && typeof estimateFuelCost === 'function'
        ? estimateFuelCost(delKm, vehicle)
        : 0;
      const inPeriod = item.date >= bounds.startYMD && item.date <= bounds.endYMD;

      allCount++;
      allPay += delP;

      if (inPeriod) {
        monthCount++;
        monthPay += delP;
        monthKm += delKm;
        monthFuelEst += delFuelEst;
        if (delMin > 150) monthLongCount++;
        else monthFlatCount++;
      }

      if (categoryScopeMode === 'all' || inPeriod) {
        rows.push({ item, delMin, delP, delKm, delFuelEst });
      }
    });

    monthKm = Math.round(monthKm * 10) / 10;
    monthFuelEst = Math.round(monthFuelEst * 100) / 100;
    const cardsHtml = rows.length === 0
      ? `<div class="empty-state">Aucune livraison sur cette sélection.</div>`
      : `<div class="log-list">${rows.map(({ item, delMin, delP, delKm, delFuelEst }, idx) => {
          const durText = delMin > 150 ? `Longue ${formatHoursMin(delMin)}` : (delMin > 0 ? `${formatHoursMin(delMin)}` : 'Forfait 30€');
          const fuelPart = delFuelEst > 0 ? ` • ~${delFuelEst.toFixed(2)}€ ess.` : '';
          const kmPart = delKm > 0 ? ` • ${formatKm(delKm)}${fuelPart}` : '';
          const pillHtml = `<span class="shift-pill pill-delivery">${PX_ICO.crate} ${durText}${kmPart}</span>`;
          return buildCategoryCardHtml(item, pillHtml, delP, idx);
        }).join('')}</div>`;

    const kmChipHtml = monthKm > 0
      ? `<div class="cat-metric-chip"><span class="cat-metric-label">KM A/R MOIS</span><strong class="cat-metric-val">${formatKm(monthKm)}</strong></div>`
      : '';
    const fuelChipHtml = vehicle && monthKm > 0
      ? `<div class="cat-metric-chip"><span class="cat-metric-label">ESSENCE ESTIMÉE</span><strong class="cat-metric-val">~${monthFuelEst.toFixed(2)} €</strong></div>`
      : '';
    const vehBarHtml = vehicle
      ? `<div class="cat-veh-bar"><span>⛽ ${escapeHtml(vehicle.name)} (${vehicle.consumption.toFixed(1)} L/100 × ${vehicle.fuelPrice.toFixed(2)} €/L = ~${getVehicleCostPerKm(vehicle).toFixed(3)} €/km)</span><button type="button" class="cat-veh-config-btn" onclick="openVehicleSettingsModal()">⚙ Modifier véhicule</button></div>`
      : `<div class="cat-veh-bar"><span>Estime le remboursement essence de tes livraisons :</span><button type="button" class="cat-veh-config-btn" onclick="openVehicleSettingsModal()">⚙ Ajouter mon véhicule</button></div>`;
    const metricsHtml = `
      <div class="cat-metric-chip"><span class="cat-metric-label">MOIS (${monthCount} livr.)</span><strong class="cat-metric-val">${monthPay.toFixed(2)} €</strong></div>
      <div class="cat-metric-chip"><span class="cat-metric-label">DÉTAIL</span><strong class="cat-metric-val">${monthFlatCount} forf. / ${monthLongCount} &gt;2h30</strong></div>
      ${kmChipHtml}
      ${fuelChipHtml}
    `;

    delContainer.innerHTML = `${buildCategoryHeaderAndNav('LIVRAISONS', 'blue-accent', metricsHtml, vehBarHtml)}${cardsHtml}`;
  }

  // --- 3. ONGLET POURBOIRES (TIPS) ---
  const tipContainer = document.getElementById('pourboires-view-content');
  if (tipContainer) {
    let monthCount = 0, monthPay = 0, monthMaxTip = 0;
    let allCount = 0, allPay = 0;
    const rows = [];

    activeShifts.forEach(item => {
      const tipP = getItemTipPay(item);
      if (tipP <= 0) return;

      const inPeriod = item.date >= bounds.startYMD && item.date <= bounds.endYMD;

      allCount++;
      allPay += tipP;

      if (inPeriod) {
        monthCount++;
        monthPay += tipP;
        if (tipP > monthMaxTip) monthMaxTip = tipP;
      }

      if (categoryScopeMode === 'all' || inPeriod) {
        rows.push({ item, tipP });
      }
    });

    const avgTip = monthCount > 0 ? (monthPay / monthCount) : 0;
    const cardsHtml = rows.length === 0
      ? `<div class="empty-state">Aucun pourboire sur cette sélection.</div>`
      : `<div class="log-list">${rows.map(({ item, tipP }, idx) => {
          const pillHtml = `<span class="shift-pill pill-tip">${PX_ICO.gem} Pourboire</span>`;
          return buildCategoryCardHtml(item, pillHtml, tipP, idx);
        }).join('')}</div>`;

    const metricsHtml = `
      <div class="cat-metric-chip"><span class="cat-metric-label">MOIS (${monthCount} tips)</span><strong class="cat-metric-val">${monthPay.toFixed(2)} €</strong></div>
      <div class="cat-metric-chip"><span class="cat-metric-label">MOY. / MAX</span><strong class="cat-metric-val">${avgTip.toFixed(1)}€ / +${monthMaxTip.toFixed(0)}€</strong></div>
    `;

    tipContainer.innerHTML = `${buildCategoryHeaderAndNav('POURBOIRES', 'green-accent', metricsHtml)}${cardsHtml}`;
  }
}

// ==========================================
// 11. PARAMÈTRES VÉHICULE PERSONNEL (ESSENCE STRICT)
// ==========================================
let vehPriceManuallyEdited = false;

function updateVehicleSettingsUI() {
  const statusEl = document.getElementById('settings-vehicle-status');
  const vehicle = typeof getPersonalVehicle === 'function' ? getPersonalVehicle() : null;
  if (statusEl) {
    statusEl.textContent = vehicle
      ? `${vehicle.name} (${vehicle.consumption.toFixed(1)}L • ${vehicle.fuelPrice.toFixed(2)}€)`
      : 'Non configuré';
  }
  if (typeof calculateCurrentForm === 'function' && document.getElementById('live-details')) {
    calculateCurrentForm();
  }
  if (typeof renderApp === 'function' && typeof activePayYear === 'number' && typeof activePayMonth === 'number' && document.getElementById('log-list')) {
    renderApp();
  }
}

function updateVehicleModalPreview() {
  const previewEl = document.getElementById('veh-live-preview');
  if (!previewEl) return;
  const conso = Math.round((Number(document.getElementById('veh-conso-input')?.value) || 0) * 10) / 10;
  const price = Math.round((Number(document.getElementById('veh-price-input')?.value) || 0) * 100) / 100;

  if (!(conso > 0) || !(price > 0)) {
    previewEl.innerHTML = `<span class="veh-prev-warn">Indique ta consommation (L/100km) et le prix au litre pour voir l'estimation instantanée.</span>`;
    return;
  }

  const perKm = (conso / 100) * price;
  const ex30 = Math.round(30 * perKm * 100) / 100;
  const ex60 = Math.round(60 * perKm * 100) / 100;

  previewEl.innerHTML = `
    <div>Coût essence strict : <strong>${perKm.toFixed(3)} €/km</strong></div>
    <div>Exemple 30 km A/R : <strong>~${ex30.toFixed(2)} €</strong> • 60 km A/R : <strong>~${ex60.toFixed(2)} €</strong></div>
  `;
}

function onVehicleFuelTypeChange() {
  const selectEl = document.getElementById('veh-fuel-select');
  const priceEl = document.getElementById('veh-price-input');
  if (!selectEl || !priceEl) return;
  const cfg = typeof FUEL_TYPES_CONFIG !== 'undefined' ? FUEL_TYPES_CONFIG[selectEl.value] : null;
  if (cfg && selectEl.value !== 'custom' && !vehPriceManuallyEdited) {
    priceEl.value = cfg.defaultPrice.toFixed(2);
  }
  updateVehicleModalPreview();
}

function openVehicleSettingsModal() {
  if (typeof toggleHeaderSettingsMenu === 'function') {
    toggleHeaderSettingsMenu(false);
  }
  if (typeof playClickSound === 'function') playClickSound();

  const modal = document.getElementById('vehicle-settings-modal');
  if (!modal) return;

  const existing = typeof getPersonalVehicle === 'function' ? getPersonalVehicle() : null;
  const nameEl = document.getElementById('veh-name-input');
  const fuelEl = document.getElementById('veh-fuel-select');
  const priceEl = document.getElementById('veh-price-input');
  const consoEl = document.getElementById('veh-conso-input');
  const delBtn = document.getElementById('veh-delete-btn');

  if (existing) {
    if (nameEl) nameEl.value = existing.name === 'Mon véhicule' ? '' : existing.name;
    if (fuelEl) fuelEl.value = existing.fuelType || 'sp95e10';
    if (priceEl) priceEl.value = existing.fuelPrice.toFixed(2);
    if (consoEl) consoEl.value = existing.consumption.toFixed(1);
    vehPriceManuallyEdited = true;
    if (delBtn) delBtn.style.display = '';
  } else {
    if (nameEl) nameEl.value = '';
    if (fuelEl) fuelEl.value = 'sp95e10';
    if (priceEl) priceEl.value = FUEL_TYPES_CONFIG.sp95e10.defaultPrice.toFixed(2);
    if (consoEl) consoEl.value = '';
    vehPriceManuallyEdited = false;
    if (delBtn) delBtn.style.display = 'none';
  }

  updateVehicleModalPreview();
  modal.style.display = 'flex';

  setTimeout(() => {
    const focusTarget = existing ? nameEl : consoEl;
    if (focusTarget) focusTarget.focus();
  }, 40);
}

function closeVehicleSettingsModal() {
  const modal = document.getElementById('vehicle-settings-modal');
  if (modal) modal.style.display = 'none';
}

function saveVehicleSettingsFromModal(e) {
  if (e) e.preventDefault();
  const raw = {
    name: document.getElementById('veh-name-input')?.value || '',
    fuelType: document.getElementById('veh-fuel-select')?.value || 'sp95e10',
    fuelPrice: document.getElementById('veh-price-input')?.value,
    consumption: document.getElementById('veh-conso-input')?.value
  };
  const clean = typeof sanitizeVehicleData === 'function' ? sanitizeVehicleData(raw) : null;
  if (!clean) {
    showToast('Renseigne une consommation (L/100km) et un prix (€/L) valides.', { type: 'warn' });
    return;
  }

  persistPersonalVehicleLocal(clean);
  syncVehicleToSupabase(clean);
  if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();
  closeVehicleSettingsModal();
  updateVehicleSettingsUI();
  showToast(`Véhicule enregistré : ${clean.name} (~${getVehicleCostPerKm(clean).toFixed(3)} €/km)`, { type: 'success' });
}

function deleteVehicleSettingsFromModal() {
  persistPersonalVehicleLocal(null);
  syncVehicleToSupabase(null);
  if (typeof playClickSound === 'function') playClickSound();
  closeVehicleSettingsModal();
  updateVehicleSettingsUI();
  showToast('Véhicule supprimé des paramètres.', { type: 'info' });
}

function initVehicleSettingsEvents() {
  const priceEl = document.getElementById('veh-price-input');
  const consoEl = document.getElementById('veh-conso-input');
  if (priceEl) {
    priceEl.addEventListener('input', () => {
      vehPriceManuallyEdited = true;
      updateVehicleModalPreview();
    });
  }
  if (consoEl) {
    consoEl.addEventListener('input', updateVehicleModalPreview);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const sheetOverlay = document.getElementById('pay-sheet-overlay');
      if (sheetOverlay && sheetOverlay.style.display !== 'none') {
        closePrintablePaySheet();
        return;
      }
      const modal = document.getElementById('vehicle-settings-modal');
      if (modal && modal.style.display === 'flex') {
        closeVehicleSettingsModal();
      }
    }
  });
  window.addEventListener('popstate', () => {
    const sheetOverlay = document.getElementById('pay-sheet-overlay');
    if (sheetOverlay && sheetOverlay.style.display !== 'none') {
      closePrintablePaySheet(true);
    }
  });
  updateVehicleSettingsUI();
}




