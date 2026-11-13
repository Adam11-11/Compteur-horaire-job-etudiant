// ==========================================
// POINT D'ENTRÉE & INITIALISATION DE L'APPLICATION
// ==========================================
function bootMainApp() {
  initFormCalculationListeners();
  initFormPhotoEvents();
  initCalendarAndNavigation();
  initPhotoViewer();
  initNewFeatures();
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

(function initApp() {
  disableMobileZoom();
  const versionBadge = document.getElementById('app-version-badge');
  if (versionBadge && typeof APP_VERSION !== 'undefined') {
    versionBadge.textContent = APP_VERSION;
  }
  loadSoundPreference();
  initAuthGate();
})();
