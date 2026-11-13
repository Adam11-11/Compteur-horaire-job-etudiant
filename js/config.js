// ==========================================
// CONFIGURATION SUPABASE & CONSTANTES GLOBALES
// ==========================================
const SUPABASE_URL = 'https://pvfdcgphreklscoexyip.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sXfoxxLGM44ypipf2oyJWQ_hPc1cp_t';
const APP_VERSION = 'v1.24';

// Stockage persistant renforcé (localStorage + Cookie longue durée 365j pour mobile)
const AUTH_STORAGE_KEY = 'compteur_paella_auth';
const customAuthStorage = {
  getItem(key) {
    try {
      const val = window.localStorage.getItem(key);
      if (val) return val;
    } catch (e) {}
    return null;
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  },
  removeItem(key) {
    // Empêcher la déconnexion accidentelle sur mobile en cas de micro-coupure réseau
    if (!window.__manualLogoutInProgress) return;
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
  }
};

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    storage: customAuthStorage
  }
});
const PHOTO_BUCKET = 'proofs';

const HOURLY_RATE = 12;
const STD_MIN_PAY = 60;
const DELIVERY_DEFAULT_PAY = 30;
const MONTH_NAMES = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const DAY_NAMES_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const DEFAULT_PRESETS = ['18:00-23:00', '11:30-14:30', '19:00-23:30'];

// Icône caméra Pixel Art partagée
const CAM_SVG = '<svg width="18" height="18" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="4" width="14" height="10" fill="currentColor"/><rect x="5" y="2" width="6" height="2" fill="currentColor"/><rect x="5" y="6" width="6" height="6" style="fill:var(--lens)"/><rect x="6" y="7" width="4" height="4" fill="currentColor"/></svg>';

// ==========================================
// ÉTAT GLOBAL DE L'APPLICATION
// ==========================================
let hasDelivery = false;
let logFilterMode = 'period';
let activePayYear, activePayMonth;
let cachedShifts = [];
let isLoadingShifts = false;
let editingShiftId = null;
let editingLegacyId = null;
const pendingDeletes = new Map();

// États photo dans le formulaire
let formSelectedPhotoFile = null;
let formPhotoPreviewUrl = null;
let existingFormProofPath = null;
let removeExistingFormPhoto = false;

// États pour animations post-sauvegarde et surbrillance
let holdCounterDisplayValues = null;
let latestRenderedPeriodStats = { stdPay: 0, delPay: 0, tipPay: 0, totalPay: 0 };
let highlightedShiftId = null;
const activeCountRafs = new Map();

