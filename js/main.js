// ==========================================
// POINT D'ENTRÉE & INITIALISATION DE L'APPLICATION
// ==========================================
function bootMainApp() {
  initFormCalculationListeners();
  initFormPhotoEvents();
  initCalendarAndNavigation();
  initPhotoViewer();
  initNewFeatures();
  if (typeof initAmbientEffects === 'function') initAmbientEffects();
  if (typeof initAiAssistant === 'function') initAiAssistant();

  document.getElementById('shift-date').value = toYMD(new Date());
  initLegacyYearSelect();
  renderPresetPills();
  initActivePeriodFromDate(new Date());
  calculateCurrentForm();
  updateFormPhotoUI();
  renderApp();
  fetchShifts().then(() => {
    if (navigator.onLine && typeof syncOfflineQueue === 'function') {
      syncOfflineQueue(false);
    }
  });
}

function disableMobileZoom() {
  const preventMultiTouch = (e) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    } else if (typeof e.scale === 'number' && e.scale !== 1) {
      e.preventDefault();
    }
  };
  const preventGesture = (e) => e.preventDefault();

  document.addEventListener('touchstart', preventMultiTouch, { passive: false });
  document.addEventListener('touchmove', preventMultiTouch, { passive: false });
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
}

function toggleHeaderSettingsMenu(forceState) {
  const menu = document.getElementById('header-settings-menu');
  const btn = document.getElementById('settings-toggle-btn');
  if (!menu || !btn) return;
  const next = typeof forceState === 'boolean' ? forceState : !menu.classList.contains('open');
  menu.classList.toggle('open', next);
  btn.setAttribute('aria-expanded', next ? 'true' : 'false');
}

function confirmLogout() {
  toggleHeaderSettingsMenu(false);
  if (window.confirm('Se déconnecter de Compteur Paella ?')) {
    if (typeof handleLogout === 'function') handleLogout();
  }
}

function toggleExportMenu(forceState) {
  const menu = document.getElementById('export-dropdown');
  const btn = document.getElementById('export-menu-btn');
  if (!menu || !btn) return;
  const next = typeof forceState === 'boolean' ? forceState : !menu.classList.contains('open');
  menu.classList.toggle('open', next);
  btn.setAttribute('aria-expanded', next ? 'true' : 'false');
}

function initKeyboardVisibilityObserver() {
  const isTextField = (el) => el && /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName) && !['checkbox', 'radio', 'file', 'button', 'submit'].includes(el.type);
  const update = () => {
    const vv = window.visualViewport;
    const vvShrunk = vv ? (window.innerHeight - vv.height > 140) : false;
    const activeInput = isTextField(document.activeElement);
    document.body.classList.toggle('keyboard-open', Boolean(vvShrunk || activeInput));
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
  }
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => setTimeout(update, 120));
}

(function initApp() {
  initKeyboardVisibilityObserver();
  document.addEventListener('click', (e) => {
    const settingsWrap = document.getElementById('header-settings-wrap');
    if (settingsWrap && !settingsWrap.contains(e.target)) toggleHeaderSettingsMenu(false);
    const exportWrap = document.getElementById('export-menu-wrap');
    if (exportWrap && !exportWrap.contains(e.target)) toggleExportMenu(false);
  });
  const versionBadge = document.getElementById('app-version-badge');
  if (versionBadge && typeof APP_VERSION !== 'undefined') {
    versionBadge.textContent = APP_VERSION;
  }
  loadSoundPreference();
  if (typeof initAmbientEffects === 'function') initAmbientEffects();
  initAuthGate();
})();
