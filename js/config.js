// ==========================================
// CONFIGURATION SUPABASE & CONSTANTES GLOBALES
// ==========================================
const SUPABASE_URL = 'https://pvfdcgphreklscoexyip.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sXfoxxLGM44ypipf2oyJWQ_hPc1cp_t';
const APP_VERSION = 'v1.42';

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
const DELIVERY_VEHICLE_BONUS = 10;
const MONTH_NAMES = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const MONTH_NAMES_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAY_NAMES_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const DEFAULT_PRESETS = ['18:00-23:00', '11:30-14:30', '19:00-23:30'];

// Icône caméra Pixel Art partagée
const CAM_SVG = '<svg class="px-ico" width="18" height="18" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="4" width="14" height="10" fill="currentColor"/><rect x="5" y="2" width="6" height="2" fill="currentColor"/><rect x="5" y="6" width="6" height="6" style="fill:var(--lens)"/><rect x="6" y="7" width="4" height="4" fill="currentColor"/></svg>';

// Bibliothèque d'icônes Pixel Art 16x16
const PX_ICO = {
  soundOn: '<svg class="px-ico" width="18" height="18" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="6" width="3" height="4" fill="#f2ece4"/><rect x="5" y="4" width="2" height="8" fill="#f2ece4"/><rect x="7" y="2" width="2" height="12" fill="#e5b567"/><rect x="11" y="5" width="1" height="6" fill="#5ab57a"/><rect x="13" y="3" width="1" height="10" fill="#5ab57a"/></svg>',
  soundOff: '<svg class="px-ico" width="18" height="18" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="6" width="3" height="4" fill="#a69fac"/><rect x="5" y="4" width="2" height="8" fill="#a69fac"/><rect x="7" y="2" width="2" height="12" fill="#a69fac"/><rect x="11" y="5" width="1" height="1" fill="#d94b57"/><rect x="13" y="5" width="1" height="1" fill="#d94b57"/><rect x="12" y="6" width="1" height="4" fill="#d94b57"/><rect x="11" y="10" width="1" height="1" fill="#d94b57"/><rect x="13" y="10" width="1" height="1" fill="#d94b57"/></svg>',
  robot: '<svg class="px-ico chef-svg" width="34" height="34" viewBox="0 0 20 20" shape-rendering="crispEdges" aria-hidden="true"><g class="chef-toque"><rect x="6" y="1" width="8" height="1" fill="#18171c"/><rect x="4" y="2" width="12" height="1" fill="#18171c"/><rect x="3" y="3" width="14" height="4" fill="#18171c"/><rect x="6" y="2" width="8" height="1" fill="#ffffff"/><rect x="4" y="3" width="12" height="3" fill="#f2ece4"/><rect x="5" y="3" width="3" height="2" fill="#ffffff"/><rect x="5" y="6" width="10" height="2" fill="#d9d2e0"/><rect x="5" y="7" width="10" height="1" fill="#d94b57"/></g><rect x="5" y="8" width="10" height="6" fill="#18171c"/><rect x="6" y="8" width="8" height="5" fill="#f2c29b"/><rect x="7" y="9" width="2" height="2" fill="#18171c"/><rect x="11" y="9" width="2" height="2" fill="#18171c"/><rect x="7" y="9" width="1" height="1" fill="#ffffff"/><rect x="11" y="9" width="1" height="1" fill="#ffffff"/><rect x="6" y="11" width="1" height="1" fill="#eb7c85"/><rect x="13" y="11" width="1" height="1" fill="#eb7c85"/><rect x="7" y="11" width="6" height="1" fill="#593a2e"/><rect x="6" y="12" width="2" height="1" fill="#593a2e"/><rect x="12" y="12" width="2" height="1" fill="#593a2e"/><rect x="4" y="14" width="12" height="5" fill="#18171c"/><rect x="5" y="14" width="10" height="4" fill="#f2ece4"/><rect x="8" y="14" width="4" height="2" fill="#d94b57"/><rect x="9" y="15" width="2" height="1" fill="#e5b567"/><rect x="9" y="17" width="1" height="1" fill="#a69fac"/><rect x="11" y="17" width="1" height="1" fill="#a69fac"/></svg>',
  prest: '<svg class="px-ico" width="14" height="14" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="2" width="10" height="12" fill="#3a2d42"/><rect x="4" y="3" width="8" height="10" fill="#f2ece4"/><rect x="2" y="2" width="11" height="2" fill="#d4a359"/><rect x="5" y="5" width="6" height="1" fill="#6c627a"/><rect x="5" y="7" width="5" height="1" fill="#6c627a"/><rect x="10" y="9" width="2" height="2" fill="#d94b57"/></svg>',
  crate: '<svg class="px-ico" width="15" height="15" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="4" width="12" height="9" fill="#255a8c"/><rect x="3" y="5" width="10" height="7" fill="#4fa4e8"/><rect x="3" y="5" width="10" height="2" fill="#80c2f7"/><rect x="7" y="5" width="2" height="7" fill="#ffe875"/><rect x="7" y="7" width="2" height="2" fill="#f2ece4"/></svg>',
  gem: '<svg class="px-ico" width="15" height="15" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="4" y="2" width="8" height="3" fill="#2d7a47"/><rect x="2" y="5" width="12" height="4" fill="#2d7a47"/><rect x="4" y="9" width="8" height="3" fill="#2d7a47"/><rect x="6" y="12" width="4" height="2" fill="#2d7a47"/><rect x="5" y="3" width="6" height="2" fill="#82d99d"/><rect x="3" y="5" width="10" height="3" fill="#5ab57a"/><rect x="5" y="8" width="6" height="3" fill="#5ab57a"/><rect x="4" y="4" width="2" height="2" fill="#ffffff"/></svg>',
  hourglass: '<svg class="px-ico" width="15" height="15" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="2" width="10" height="2" fill="#e5b567"/><rect x="3" y="12" width="10" height="2" fill="#e5b567"/><rect x="4" y="4" width="8" height="2" fill="#f2ece4"/><rect x="6" y="6" width="4" height="4" fill="#e5b567"/><rect x="4" y="10" width="8" height="2" fill="#f2ece4"/><rect x="6" y="11" width="4" height="1" fill="#ffe875"/></svg>',
  stop: '<svg class="px-ico" width="18" height="18" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="3" width="10" height="10" fill="#d94b57"/><rect x="4" y="4" width="8" height="8" fill="#eb7c85"/></svg>',
  warn: '<svg class="px-ico" width="15" height="15" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="7" y="2" width="2" height="2" fill="#e5b567"/><rect x="5" y="4" width="6" height="3" fill="#e5b567"/><rect x="3" y="7" width="10" height="4" fill="#e5b567"/><rect x="2" y="11" width="12" height="3" fill="#e5b567"/><rect x="7" y="5" width="2" height="5" fill="#18171c"/><rect x="7" y="11" width="2" height="2" fill="#18171c"/></svg>'
};

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

