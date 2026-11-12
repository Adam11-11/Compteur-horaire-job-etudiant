// ==========================================
// POINT D'ENTRÉE & INITIALISATION DE L'APPLICATION
// ==========================================
function bootMainApp() {
  initFormCalculationListeners();
  initFormPhotoEvents();
  initCalendarAndNavigation();
  initPhotoViewer();
  initNewFeatures();

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

(function initApp() {
  loadSoundPreference();
  initAuthGate();
})();
