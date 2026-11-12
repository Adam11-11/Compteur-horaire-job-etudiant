// ==========================================
// AUTHENTIFICATION SUPABASE (SESSION ULTRA-PERSISTANTE MOBILE & PC)
// ==========================================

let isAppBooted = false;
let currentAuthUser = null;
let authMode = 'password'; // 'password' | 'magiclink'

const REMEMBER_STORAGE_KEY = 'compteur_paella_remember_v1';
const REMEMBER_COOKIE_NAME = 'cp_auth_rem_v1';
const IDB_NAME = 'compteur_paella_auth_db';
const IDB_STORE = 'auth_store';

// --- STOCKAGE TRIPLE PERSISTANCE (localStorage + Cookie 365j + IndexedDB) ---
function encodeRememberPayload(obj) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  } catch (e) {
    return '';
  }
}

function decodeRememberPayload(str) {
  if (!str) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(str))));
  } catch (e) {
    return null;
  }
}

function setRememberCookie(encoded) {
  try {
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${REMEMBER_COOKIE_NAME}=${encodeURIComponent(encoded)}; max-age=31536000; path=/; SameSite=Lax${secureFlag}`;
  } catch (e) {}
}

function getRememberCookie() {
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + REMEMBER_COOKIE_NAME + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch (e) {
    return null;
  }
}

function clearRememberCookie() {
  try {
    document.cookie = `${REMEMBER_COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
  } catch (e) {}
}

function saveToIndexedDB(encoded) {
  try {
    if (!window.indexedDB) return;
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e) => {
      try {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(encoded, REMEMBER_STORAGE_KEY);
      } catch (err) {}
    };
  } catch (e) {}
}

function loadFromIndexedDB() {
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) return resolve(null);
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => {
        try {
          const db = e.target.result;
          const tx = db.transaction(IDB_STORE, 'readonly');
          const getReq = tx.objectStore(IDB_STORE).get(REMEMBER_STORAGE_KEY);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function clearIndexedDB() {
  try {
    if (!window.indexedDB) return;
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onsuccess = (e) => {
      try {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(REMEMBER_STORAGE_KEY);
      } catch (err) {}
    };
  } catch (e) {}
}

function savePersistentAuthBackup(session, passwordOptional) {
  if (!session || !session.user) return;
  const existing = getPersistentAuthBackupSync() || {};
  const payload = {
    email: session.user.email || existing.email || '',
    userId: session.user.id || existing.userId || '',
    access_token: session.access_token || existing.access_token || '',
    refresh_token: session.refresh_token || existing.refresh_token || '',
    pw: passwordOptional !== undefined ? passwordOptional : (existing.pw || ''),
    savedAt: Date.now()
  };
  const encoded = encodeRememberPayload(payload);
  if (!encoded) return;
  try {
    window.localStorage.setItem(REMEMBER_STORAGE_KEY, encoded);
  } catch (e) {}
  setRememberCookie(encoded);
  saveToIndexedDB(encoded);
}

function getPersistentAuthBackupSync() {
  let encoded = null;
  try {
    encoded = window.localStorage.getItem(REMEMBER_STORAGE_KEY);
  } catch (e) {}
  if (!encoded) {
    encoded = getRememberCookie();
    if (encoded) {
      try { window.localStorage.setItem(REMEMBER_STORAGE_KEY, encoded); } catch (e) {}
    }
  }
  return decodeRememberPayload(encoded);
}

async function getPersistentAuthBackupAsync() {
  const syncData = getPersistentAuthBackupSync();
  if (syncData && syncData.email) return syncData;
  const idbEncoded = await loadFromIndexedDB();
  if (idbEncoded) {
    try { window.localStorage.setItem(REMEMBER_STORAGE_KEY, idbEncoded); } catch (e) {}
    setRememberCookie(idbEncoded);
    return decodeRememberPayload(idbEncoded);
  }
  return null;
}

function clearPersistentAuthBackup() {
  try { window.localStorage.removeItem(REMEMBER_STORAGE_KEY); } catch (e) {}
  try { window.localStorage.removeItem('compteur_paella_auth'); } catch (e) {}
  clearRememberCookie();
  clearIndexedDB();
}

// --- GESTION DE L'INTERFACE D'AUTHENTIFICATION ---
function setAuthState(state, user = null) {
  currentAuthUser = user || null;
  document.body.setAttribute('data-auth', state);

  const checkingBox = document.getElementById('auth-checking-box');
  const formBox = document.getElementById('auth-form-box');
  const logoutBtn = document.getElementById('auth-logout-btn');

  if (state === 'checking') {
    if (checkingBox) checkingBox.style.display = 'block';
    if (formBox) formBox.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  } else if (state === 'unauthenticated') {
    if (checkingBox) checkingBox.style.display = 'none';
    if (formBox) formBox.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    cachedShifts = [];
    if (typeof renderApp === 'function' && isAppBooted) {
      renderApp();
    }
  } else if (state === 'authenticated') {
    if (checkingBox) checkingBox.style.display = 'none';
    if (formBox) formBox.style.display = 'none';
    if (logoutBtn) {
      logoutBtn.style.display = 'inline-flex';
      if (user && user.email) {
        logoutBtn.title = `Connecté : ${user.email} — Cliquer pour se déconnecter`;
      }
    }
  }
}

function showAuthFeedback(message, type = 'error') {
  const feedbackEl = document.getElementById('auth-feedback');
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.className = `auth-feedback ${type}`;
  feedbackEl.style.display = 'block';
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');

  const email = (emailInput ? emailInput.value : '').trim();
  const password = passInput ? passInput.value : '';

  if (!email) {
    showAuthFeedback('Renseigne ton adresse email.', 'error');
    if (typeof playErrorSound === 'function') playErrorSound();
    return;
  }

  if (!password) {
    showAuthFeedback('Renseigne ton mot de passe.', 'error');
    if (typeof playErrorSound === 'function') playErrorSound();
    return;
  }

  const originalBtnText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ CONNEXION...';
  }
  const fb = document.getElementById('auth-feedback');
  if (fb) fb.style.display = 'none';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    if (data && data.session) {
      savePersistentAuthBackup(data.session, password);
      if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();
      if (passInput) passInput.value = '';
      onAuthenticatedSession(data.session);
    }
  } catch (err) {
    if (typeof playErrorSound === 'function') playErrorSound();
    const rawMsg = err && err.message ? err.message : 'Erreur de connexion';
    let friendly = rawMsg;
    if (/invalid login credentials/i.test(rawMsg)) {
      friendly = 'Email ou mot de passe incorrect.';
    } else if (/signups not allowed|user not found/i.test(rawMsg)) {
      friendly = 'Accès refusé : cet email n\'est pas autorisé.';
    } else if (/email not confirmed/i.test(rawMsg)) {
      friendly = 'Email non confirmé dans Supabase.';
    } else if (/rate limit/i.test(rawMsg)) {
      friendly = 'Trop de tentatives. Patiente quelques minutes.';
    }
    showAuthFeedback(`⚠ ${friendly}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
}

async function handleLogout() {
  window.__manualLogoutInProgress = true;
  clearPersistentAuthBackup();
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {}
  window.__manualLogoutInProgress = false;
  try {
    window.localStorage.removeItem('pixelpay_shifts_cache_v1');
  } catch (e) {}
  cachedShifts = [];
  setAuthState('unauthenticated', null);
  if (typeof showToast === 'function') {
    showToast('Session fermée 🔒', { type: 'info', duration: 2500 });
  }
}

function onAuthenticatedSession(session) {
  const wasAlreadyAuthenticated = document.body.getAttribute('data-auth') === 'authenticated';
  if (session && session.access_token) {
    savePersistentAuthBackup(session);
  }
  setAuthState('authenticated', session ? session.user : null);

  if (!isAppBooted) {
    isAppBooted = true;
    bootMainApp();
  } else if (!wasAlreadyAuthenticated) {
    fetchShifts().then(() => {
      if (navigator.onLine && typeof syncOfflineQueue === 'function') {
        syncOfflineQueue(false);
      }
    });
  }
}

// Reconnexion silencieuse en arrière-plan si le jeton mobile a expiré ou tourné
async function restoreSessionFromBackup(backup) {
  if (!backup) return false;
  if (!navigator.onLine) return true; // En mode hors-ligne, on garde l'appli ouverte avec le cache local

  // 1. Essayer de restaurer avec refresh_token
  if (backup.access_token && backup.refresh_token) {
    try {
      const { data, error } = await supabaseClient.auth.setSession({
        access_token: backup.access_token,
        refresh_token: backup.refresh_token
      });
      if (!error && data && data.session) {
        savePersistentAuthBackup(data.session);
        return true;
      }
    } catch (e) {}
  }

  // 2. Si le refresh_token a expiré (ex: connexion simultanée PC + téléphone), reconnexion silencieuse
  if (backup.email && backup.pw) {
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: backup.email,
        password: backup.pw
      });
      if (!error && data && data.session) {
        savePersistentAuthBackup(data.session, backup.pw);
        return true;
      }
    } catch (e) {}
  }

  return false;
}

async function initAuthGate() {
  const loginForm = document.getElementById('auth-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  // Déverrouillage instantané si une sauvegarde locale/cookie existe déjà sur le téléphone
  const syncBackup = getPersistentAuthBackupSync();
  if (syncBackup && syncBackup.email) {
    onAuthenticatedSession({ user: { email: syncBackup.email, id: syncBackup.userId } });
  } else {
    setAuthState('checking');
  }

  // Écouter les changements d'état Supabase
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      onAuthenticatedSession(session);
    } else if (event === 'SIGNED_OUT' && window.__manualLogoutInProgress) {
      setAuthState('unauthenticated', null);
    }
  });

  // Vérification de la session Supabase ou restauration automatique silencieuse
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (!error && data && data.session) {
      onAuthenticatedSession(data.session);
      return;
    }

    const asyncBackup = syncBackup || (await getPersistentAuthBackupAsync());
    if (asyncBackup && asyncBackup.email) {
      onAuthenticatedSession({ user: { email: asyncBackup.email, id: asyncBackup.userId } });
      const restored = await restoreSessionFromBackup(asyncBackup);
      if (restored) {
        fetchShifts();
      }
      return;
    }

    setAuthState('unauthenticated', null);
  } catch (e) {
    const fallback = getPersistentAuthBackupSync();
    if (fallback && fallback.email) {
      onAuthenticatedSession({ user: { email: fallback.email, id: fallback.userId } });
    } else {
      setAuthState('unauthenticated', null);
    }
  }
}
