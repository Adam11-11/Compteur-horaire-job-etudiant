// ==========================================
// CONFIGURATION SUPABASE & CONSTANTES GLOBALES
// ==========================================
const SUPABASE_URL = 'https://pvfdcgphreklscoexyip.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sXfoxxLGM44ypipf2oyJWQ_hPc1cp_t';
const APP_VERSION = 'v1.52';

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

// Icône caméra Pixel Art 24x24 haute précision partagée
const CAM_SVG = '<svg class="px-ico" width="18" height="18" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="7" y="4" width="8" height="2" fill="#0d0c10"/><rect x="8" y="5" width="6" height="2" fill="currentColor"/><rect x="2" y="7" width="20" height="13" fill="#0d0c10"/><rect x="3" y="8" width="18" height="11" fill="currentColor"/><rect x="4" y="8" width="16" height="1" fill="rgba(255,255,255,0.45)"/><rect x="17" y="6" width="3" height="2" fill="#d94b57"/><rect x="4" y="9" width="3" height="2" fill="#ffe875"/><rect x="8" y="9" width="8" height="8" style="fill:var(--lens)"/><rect x="7" y="11" width="10" height="4" style="fill:var(--lens)"/><rect x="9" y="10" width="6" height="6" fill="#0d0c10"/><rect x="10" y="11" width="4" height="4" fill="#255a8c"/><rect x="10" y="11" width="2" height="2" fill="#80c2f7"/><rect x="10" y="11" width="1" height="1" fill="#ffffff"/></svg>';

// Bibliothèque d'icônes Pixel Art 24x24 haute précision (SNES RPG)
const PX_ICO = {
  soundOn: '<svg class="px-ico" width="19" height="19" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="8" width="4" height="8" fill="#0d0c10"/><rect x="7" y="6" width="3" height="12" fill="#0d0c10"/><rect x="10" y="3" width="3" height="18" fill="#0d0c10"/><rect x="4" y="9" width="3" height="6" fill="#c7c1d4"/><rect x="4" y="9" width="3" height="2" fill="#f2ece4"/><rect x="7" y="7" width="3" height="10" fill="#e5b567"/><rect x="7" y="7" width="2" height="2" fill="#fff2a6"/><rect x="10" y="4" width="2" height="16" fill="#e5b567"/><rect x="10" y="4" width="2" height="4" fill="#fff2a6"/><rect x="15" y="8" width="2" height="8" fill="#5ab57a"/><rect x="16" y="7" width="1" height="2" fill="#82d99d"/><rect x="19" y="5" width="2" height="14" fill="#5ab57a"/><rect x="19" y="5" width="2" height="3" fill="#82d99d"/></svg>',
  soundOff: '<svg class="px-ico" width="19" height="19" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="8" width="4" height="8" fill="#0d0c10"/><rect x="7" y="6" width="3" height="12" fill="#0d0c10"/><rect x="10" y="3" width="3" height="18" fill="#0d0c10"/><rect x="4" y="9" width="3" height="6" fill="#6c627a"/><rect x="7" y="7" width="3" height="10" fill="#8d869c"/><rect x="10" y="4" width="2" height="16" fill="#a69fac"/><rect x="15" y="8" width="2" height="2" fill="#d94b57"/><rect x="19" y="8" width="2" height="2" fill="#d94b57"/><rect x="17" y="10" width="2" height="4" fill="#d94b57"/><rect x="15" y="14" width="2" height="2" fill="#d94b57"/><rect x="19" y="14" width="2" height="2" fill="#d94b57"/></svg>',
  robot: '<svg class="px-ico chef-svg" width="38" height="38" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><g class="chef-toque"><rect x="7" y="1" width="10" height="1" fill="#0d0c10"/><rect x="5" y="2" width="14" height="2" fill="#0d0c10"/><rect x="4" y="4" width="16" height="5" fill="#0d0c10"/><rect x="7" y="2" width="10" height="1" fill="#ffffff"/><rect x="5" y="3" width="14" height="4" fill="#f2ece4"/><rect x="6" y="3" width="3" height="3" fill="#ffffff"/><rect x="10" y="3" width="1" height="4" fill="#d9d2e0"/><rect x="14" y="3" width="1" height="4" fill="#d9d2e0"/><rect x="6" y="7" width="12" height="2" fill="#d94b57"/><rect x="6" y="8" width="12" height="1" fill="#ffe875"/></g><rect x="6" y="9" width="12" height="7" fill="#0d0c10"/><rect x="7" y="9" width="10" height="6" fill="#f2c29b"/><rect x="7" y="9" width="10" height="1" fill="#dba074"/><rect x="8" y="10" width="2" height="1" fill="#4a2c20"/><rect x="14" y="10" width="2" height="1" fill="#4a2c20"/><rect x="8" y="11" width="2" height="2" fill="#0d0c10"/><rect x="14" y="11" width="2" height="2" fill="#0d0c10"/><rect x="8" y="11" width="1" height="1" fill="#ffffff"/><rect x="14" y="11" width="1" height="1" fill="#ffffff"/><rect x="7" y="13" width="1" height="1" fill="#eb7c85"/><rect x="16" y="13" width="1" height="1" fill="#eb7c85"/><rect x="11" y="12" width="2" height="1" fill="#e09a73"/><rect x="9" y="13" width="6" height="1" fill="#4a2c20"/><rect x="7" y="14" width="3" height="1" fill="#4a2c20"/><rect x="14" y="14" width="3" height="1" fill="#4a2c20"/><rect x="5" y="16" width="14" height="7" fill="#0d0c10"/><rect x="6" y="16" width="12" height="6" fill="#f2ece4"/><rect x="6" y="16" width="2" height="6" fill="#d9d2e0"/><rect x="16" y="16" width="2" height="6" fill="#d9d2e0"/><rect x="9" y="16" width="6" height="2" fill="#d94b57"/><rect x="11" y="17" width="2" height="2" fill="#ffe875"/><rect x="10" y="19" width="1" height="1" fill="#8d869c"/><rect x="13" y="19" width="1" height="1" fill="#8d869c"/><rect x="10" y="21" width="1" height="1" fill="#8d869c"/><rect x="13" y="21" width="1" height="1" fill="#8d869c"/></svg>',
  prest: '<svg class="px-ico" width="16" height="16" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="2" width="14" height="20" fill="#0d0c10"/><rect x="3" y="3" width="18" height="3" fill="#0d0c10"/><rect x="4" y="18" width="16" height="4" fill="#0d0c10"/><rect x="4" y="4" width="16" height="2" fill="#d4a359"/><rect x="4" y="4" width="16" height="1" fill="#ffe875"/><rect x="6" y="6" width="12" height="12" fill="#f2ece4"/><rect x="6" y="6" width="12" height="2" fill="#d6cbb8"/><rect x="16" y="6" width="2" height="12" fill="#d6cbb8"/><rect x="8" y="9" width="8" height="1" fill="#6c627a"/><rect x="8" y="11" width="7" height="1" fill="#6c627a"/><rect x="8" y="13" width="5" height="1" fill="#6c627a"/><rect x="14" y="13" width="3" height="3" fill="#d94b57"/><rect x="15" y="14" width="1" height="1" fill="#eb7c85"/><rect x="5" y="19" width="14" height="2" fill="#b5823b"/></svg>',
  crate: '<svg class="px-ico" width="16" height="16" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="5" width="18" height="14" fill="#0d0c10"/><rect x="4" y="6" width="16" height="12" fill="#255a8c"/><rect x="4" y="6" width="16" height="3" fill="#80c2f7"/><rect x="4" y="9" width="16" height="8" fill="#4fa4e8"/><rect x="4" y="16" width="16" height="2" fill="#1d446b"/><rect x="10" y="6" width="4" height="12" fill="#ffe875"/><rect x="11" y="6" width="2" height="12" fill="#fff9d6"/><rect x="4" y="11" width="16" height="2" fill="#255a8c"/><rect x="10" y="10" width="4" height="4" fill="#d94b57"/><rect x="11" y="11" width="2" height="2" fill="#ffe875"/><rect x="5" y="7" width="2" height="1" fill="#ffffff"/></svg>',
  gem: '<svg class="px-ico" width="16" height="16" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="6" y="3" width="12" height="3" fill="#0d0c10"/><rect x="3" y="6" width="18" height="5" fill="#0d0c10"/><rect x="5" y="11" width="14" height="4" fill="#0d0c10"/><rect x="8" y="15" width="8" height="3" fill="#0d0c10"/><rect x="10" y="18" width="4" height="3" fill="#0d0c10"/><rect x="7" y="4" width="10" height="2" fill="#82d99d"/><rect x="4" y="6" width="16" height="4" fill="#5ab57a"/><rect x="6" y="10" width="12" height="4" fill="#5ab57a"/><rect x="9" y="14" width="6" height="3" fill="#2d7a47"/><rect x="11" y="17" width="2" height="2" fill="#1e5932"/><rect x="13" y="6" width="6" height="4" fill="#2d7a47"/><rect x="7" y="5" width="4" height="2" fill="#b7f5ca"/><rect x="6" y="7" width="2" height="2" fill="#ffffff"/></svg>',
  hourglass: '<svg class="px-ico" width="16" height="16" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="2" width="14" height="3" fill="#0d0c10"/><rect x="5" y="19" width="14" height="3" fill="#0d0c10"/><rect x="7" y="5" width="10" height="14" fill="#0d0c10"/><rect x="6" y="3" width="12" height="2" fill="#e5b567"/><rect x="6" y="3" width="4" height="1" fill="#fff2a6"/><rect x="6" y="20" width="12" height="2" fill="#b5823b"/><rect x="8" y="5" width="8" height="4" fill="#f2ece4"/><rect x="9" y="7" width="6" height="2" fill="#ffe875"/><rect x="10" y="9" width="4" height="6" fill="#d6cbb8"/><rect x="11" y="10" width="2" height="4" fill="#ffe875"/><rect x="8" y="15" width="8" height="4" fill="#f2ece4"/><rect x="9" y="16" width="6" height="3" fill="#e5b567"/><rect x="10" y="15" width="4" height="1" fill="#ffe875"/></svg>',
  stop: '<svg class="px-ico" width="18" height="18" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="4" y="4" width="16" height="16" fill="#0d0c10"/><rect x="5" y="5" width="14" height="14" fill="#d94b57"/><rect x="6" y="6" width="12" height="3" fill="#eb7c85"/><rect x="6" y="16" width="12" height="3" fill="#8c2a34"/></svg>',
  warn: '<svg class="px-ico" width="16" height="16" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="10" y="2" width="4" height="3" fill="#0d0c10"/><rect x="8" y="5" width="8" height="4" fill="#0d0c10"/><rect x="5" y="9" width="14" height="5" fill="#0d0c10"/><rect x="3" y="14" width="18" height="6" fill="#0d0c10"/><rect x="11" y="3" width="2" height="3" fill="#fff2a6"/><rect x="9" y="6" width="6" height="3" fill="#e5b567"/><rect x="6" y="9" width="12" height="5" fill="#e5b567"/><rect x="4" y="14" width="16" height="5" fill="#d19a3e"/><rect x="4" y="14" width="16" height="2" fill="#e5b567"/><rect x="11" y="8" width="2" height="6" fill="#0d0c10"/><rect x="11" y="16" width="2" height="2" fill="#0d0c10"/></svg>',
  fuel: '<svg class="px-ico" width="16" height="16" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="4" y="3" width="12" height="17" fill="#0d0c10"/><rect x="2" y="19" width="16" height="3" fill="#0d0c10"/><rect x="5" y="4" width="10" height="15" fill="#d94b57"/><rect x="5" y="4" width="10" height="2" fill="#eb7c85"/><rect x="13" y="5" width="2" height="14" fill="#8c2a34"/><rect x="6" y="6" width="8" height="5" fill="#18171c"/><rect x="7" y="7" width="6" height="3" fill="#f2ece4"/><rect x="7" y="8" width="5" height="2" fill="#5ab57a"/><rect x="7" y="8" width="2" height="1" fill="#82d99d"/><rect x="7" y="13" width="6" height="2" fill="#e5b567"/><rect x="7" y="13" width="3" height="1" fill="#fff2a6"/><rect x="3" y="20" width="14" height="1" fill="#c7c1d4"/><rect x="3" y="20" width="5" height="1" fill="#f2ece4"/><rect x="16" y="6" width="5" height="4" fill="#0d0c10"/><rect x="18" y="4" width="2" height="3" fill="#0d0c10"/><rect x="18" y="5" width="1" height="2" fill="#e5b567"/><rect x="16" y="7" width="4" height="2" fill="#c7c1d4"/><rect x="18" y="10" width="3" height="8" fill="#0d0c10"/><rect x="19" y="10" width="1" height="7" fill="#6c627a"/><rect x="15" y="16" width="5" height="3" fill="#0d0c10"/><rect x="15" y="17" width="4" height="1" fill="#6c627a"/></svg>',
  gear: '<svg class="px-ico" width="14" height="14" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><rect x="9" y="2" width="6" height="3" fill="#0d0c10"/><rect x="9" y="19" width="6" height="3" fill="#0d0c10"/><rect x="2" y="9" width="3" height="6" fill="#0d0c10"/><rect x="19" y="9" width="3" height="6" fill="#0d0c10"/><rect x="4" y="4" width="4" height="4" fill="#0d0c10"/><rect x="16" y="4" width="4" height="4" fill="#0d0c10"/><rect x="4" y="16" width="4" height="4" fill="#0d0c10"/><rect x="16" y="16" width="4" height="4" fill="#0d0c10"/><rect x="6" y="6" width="12" height="12" fill="#0d0c10"/><rect x="10" y="3" width="4" height="18" fill="#c7c1d4"/><rect x="3" y="10" width="18" height="4" fill="#c7c1d4"/><rect x="5" y="5" width="14" height="14" fill="#a69fac"/><rect x="7" y="7" width="10" height="10" fill="#c7c1d4"/><rect x="7" y="7" width="10" height="2" fill="#f2ece4"/><rect x="9" y="9" width="6" height="6" fill="#0d0c10"/><rect x="10" y="10" width="4" height="4" fill="#23212b"/></svg>'
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

