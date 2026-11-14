// ==========================================
// AUTHENTIFICATION SUPABASE MULTI-UTILISATEURS & CLOISONNEMENT SÉCURISÉ
// ==========================================
let isAppBooted = false;
let currentAuthUser = null;
let lastAuthenticatedUid = null;
let authTabMode = 'login'; // 'login' | 'signup'
let isSessionVerifiedOnline = false;

const AUTH_BACKUP_STORAGE_KEY = 'compteur_paella_auth_backup_v1';
const REMEMBER_COOKIE_NAME = 'cp_auth_rem_v1';
const IDB_NAME = 'compteur_paella_auth_db';
const IDB_STORE = 'auth_store';
const LAST_UID_STORAGE_KEY = 'compteur_paella_last_uid_v1';

// --- HELPERS UTILISATEUR & CLÉS LOCALES CLOISONNÉES PAR USER_ID ---
function getCurrentAuthUserId() {
  return currentAuthUser && currentAuthUser.id ? String(currentAuthUser.id) : '';
}

function getUserScopedKey(baseKey, userId = getCurrentAuthUserId()) {
  return userId ? `${baseKey}_${userId}` : `${baseKey}_anon`;
}

function formatCleanFirstName(raw) {
  const cleaned = String(raw || '').replace(/[\r\n\t<>]/g, ' ').trim().slice(0, 32);
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function getWorkerDisplayName(user = currentAuthUser) {
  const meta = user && user.user_metadata ? user.user_metadata : null;
  const fromMeta = meta ? formatCleanFirstName(meta.first_name || meta.prenom || meta.name) : '';
  if (fromMeta) return fromMeta;
  const email = user && user.email ? String(user.email) : '';
  const localPart = email.split('@')[0] || '';
  const alphaPrefix = localPart.replace(/[^a-zA-ZÀ-ÿ]/g, ' ').trim().split(/\s+/)[0] || '';
  if (alphaPrefix.length >= 2) {
    return alphaPrefix.charAt(0).toUpperCase() + alphaPrefix.slice(1).toLowerCase();
  }
  return '';
}

function updateSettingsUserUI(user = currentAuthUser) {
  const card = document.getElementById('settings-user-card');
  const nameEl = document.getElementById('settings-user-name');
  const emailEl = document.getElementById('settings-user-email');
  const subEl = document.getElementById('settings-profile-sub');
  const logoutBtn = document.getElementById('auth-logout-btn');

  if (!user) {
    if (card) card.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    return;
  }

  const displayName = getWorkerDisplayName(user) || 'Mon compte';
  if (card) card.style.display = 'block';
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email || '';
  if (subEl) subEl.textContent = `Prénom : ${displayName}`;
  if (logoutBtn) {
    logoutBtn.style.display = 'flex';
    logoutBtn.title = `Connecté : ${user.email || displayName} — Cliquer pour se déconnecter`;
  }
}

async function promptEditWorkerName() {
  if (typeof closeHeaderSettingsMenu === 'function') closeHeaderSettingsMenu();
  if (!currentAuthUser) return;
  const current = getWorkerDisplayName(currentAuthUser);
  const input = window.prompt('Ton prénom (utilisé pour le titre du PDF et la lecture IA des plannings) :', current);
  if (input === null) return;
  const cleanName = formatCleanFirstName(input);
  if (!cleanName) {
    showToast('Entre un prénom valide.', { type: 'warn' });
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.updateUser({
      data: { first_name: cleanName }
    });
    if (error) throw error;
    if (data && data.user) {
      currentAuthUser = data.user;
    } else if (currentAuthUser.user_metadata) {
      currentAuthUser.user_metadata.first_name = cleanName;
    }
    updateSettingsUserUI(currentAuthUser);
    showToast(`Prénom mis à jour : ${cleanName} ✓`, { type: 'success' });
  } catch (err) {
    showToast(`Impossible de modifier le prénom : ${(err && err.message) || 'erreur réseau'}`, { type: 'error' });
  }
}

function migrateLegacyUnscopedStorageToUser(userId) {
  if (!userId) return;
  try {
    const prevOwner = window.localStorage.getItem(LAST_UID_STORAGE_KEY);
    const canAdoptLegacy = !prevOwner || prevOwner === userId;
    const legacyKeys = [
      'pixelpay_cached_shifts_v1',
      'pixelpay_offline_queue_v1',
      'pixelpay_live_session',
      'pixelpay_recent_presets',
      'pixelpay_personal_vehicle_v1',
      'compteur_paella_gemini_key_v1'
    ];

    legacyKeys.forEach(baseKey => {
      const legacyVal = window.localStorage.getItem(baseKey);
      if (legacyVal !== null) {
        const scopedKey = getUserScopedKey(baseKey, userId);
        if (canAdoptLegacy && window.localStorage.getItem(scopedKey) === null) {
          window.localStorage.setItem(scopedKey, legacyVal);
        }
        window.localStorage.removeItem(baseKey);
      }
    });

    window.localStorage.removeItem('pixelpay_shifts_cache_v1');
    // Supprimer l'ancien cookie global de clé Gemini pour éviter tout partage entre comptes
    document.cookie = 'cp_gemini_key_v1=; max-age=0; path=/; SameSite=Lax';
    window.localStorage.setItem(LAST_UID_STORAGE_KEY, userId);
  } catch (e) {}
}

function resetAppStateOnUserChange(previousUid) {
  if (typeof pendingDeletes !== 'undefined' && pendingDeletes instanceof Map) {
    pendingDeletes.forEach(t => clearTimeout(t));
    pendingDeletes.clear();
  }
  if (typeof cachedShifts !== 'undefined') cachedShifts = [];
  if (typeof highlightedShiftId !== 'undefined') highlightedShiftId = null;
  if (typeof holdCounterDisplayValues !== 'undefined') holdCounterDisplayValues = null;
  if (typeof liveClockInterval !== 'undefined' && liveClockInterval) {
    clearInterval(liveClockInterval);
    liveClockInterval = null;
  }
  if (typeof pendingExtraAiEntries !== 'undefined') pendingExtraAiEntries = [];
  if (typeof toggleAiFabMenu === 'function') toggleAiFabMenu(false);

  if (typeof teardownSupabaseRealtime === 'function') {
    teardownSupabaseRealtime();
  }
  if (isAppBooted && typeof cancelEdit === 'function') {
    try { cancelEdit(); } catch (e) {}
  }

  // Nettoyer la clé Gemini en clair du précédent utilisateur lors d'une déconnexion explicite
  if (previousUid) {
    try {
      window.localStorage.removeItem(getUserScopedKey('compteur_paella_gemini_key_v1', previousUid));
    } catch (e) {}
  }
  try {
    document.cookie = 'cp_gemini_key_v1=; max-age=0; path=/; SameSite=Lax';
  } catch (e) {}
}

// --- SAUVEGARDE DE SESSION SANS JAMAIS STOCKER DE MOT DE PASSE ---
function encodeRememberPayload(obj) {
  try {
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)));
  } catch (e) { return ''; }
}

function decodeRememberPayload(str) {
  try {
    if (!str) return null;
    const json = decodeURIComponent(escape(atob(str)));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      // Ne jamais conserver d'éventuel ancien champ mot de passe
      if ('pw' in parsed) delete parsed.pw;
      return parsed;
    }
  } catch (e) {}
  return null;
}

function setRememberCookie(encoded) {
  try {
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${REMEMBER_COOKIE_NAME}=${encodeURIComponent(encoded)}; max-age=2592000; path=/; SameSite=Lax${secureFlag}`;
  } catch (e) {}
}

function getRememberCookie() {
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + REMEMBER_COOKIE_NAME + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  } catch (e) { return ''; }
}

function clearRememberCookie() {
  try {
    document.cookie = `${REMEMBER_COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
  } catch (e) {}
}

function saveToIndexedDB(encoded) {
  try {
    if (!window.indexedDB) return;
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => {
      try {
        const db = e.target.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(encoded, 'session_backup');
      } catch (err) {}
    };
  } catch (e) {}
}

function loadFromIndexedDB() {
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) { resolve(null); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = (e) => {
        try {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) { resolve(null); return; }
          const tx = db.transaction(IDB_STORE, 'readonly');
          const getReq = tx.objectStore(IDB_STORE).get('session_backup');
          getReq.onsuccess = () => resolve(decodeRememberPayload(getReq.result));
          getReq.onerror = () => resolve(null);
        } catch (err) { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

function clearIndexedDB() {
  try {
    if (!window.indexedDB) return;
    const req = indexedDB.open(IDB_NAME, 1);
    req.onsuccess = (e) => {
      try {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) return;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('session_backup');
      } catch (err) {}
    };
  } catch (e) {}
}

function savePersistentAuthBackup(session) {
  if (!session || !session.user) return;
  const existing = getPersistentAuthBackupSync() || {};
  const payload = {
    email: session.user.email || existing.email || '',
    userId: session.user.id || existing.userId || '',
    firstName: (session.user.user_metadata && session.user.user_metadata.first_name) || existing.firstName || '',
    access_token: session.access_token || existing.access_token || '',
    refresh_token: session.refresh_token || existing.refresh_token || '',
    savedAt: Date.now()
  };
  const encoded = encodeRememberPayload(payload);
  if (!encoded) return;
  try {
    window.localStorage.setItem(AUTH_BACKUP_STORAGE_KEY, encoded);
  } catch (e) {}
  setRememberCookie(encoded);
  saveToIndexedDB(encoded);
}

function getPersistentAuthBackupSync() {
  try {
    const ls = window.localStorage.getItem(AUTH_BACKUP_STORAGE_KEY);
    if (ls) {
      const d = decodeRememberPayload(ls);
      if (d && d.userId && d.refresh_token) return d;
    }
  } catch (e) {}
  try {
    const ck = getRememberCookie();
    if (ck) {
      const d = decodeRememberPayload(ck);
      if (d && d.userId && d.refresh_token) return d;
    }
  } catch (e) {}
  return null;
}

async function getPersistentAuthBackupAsync() {
  const syncData = getPersistentAuthBackupSync();
  if (syncData) return syncData;
  const idbData = await loadFromIndexedDB();
  if (idbData && idbData.userId && idbData.refresh_token) {
    const encoded = encodeRememberPayload(idbData);
    try { window.localStorage.setItem(AUTH_BACKUP_STORAGE_KEY, encoded); } catch (e) {}
    setRememberCookie(encoded);
    return idbData;
  }
  return null;
}

function clearPersistentAuthBackup() {
  try { window.localStorage.removeItem(AUTH_BACKUP_STORAGE_KEY); } catch (e) {}
  try { window.localStorage.removeItem('compteur_paella_auth'); } catch (e) {}
  clearRememberCookie();
  clearIndexedDB();
}

// --- GESTION DE L'INTERFACE D'AUTHENTIFICATION ---
function setAuthTabMode(mode) {
  authTabMode = mode === 'signup' ? 'signup' : 'login';
  const isSignup = authTabMode === 'signup';

  const tabLogin = document.getElementById('auth-tab-login');
  const tabSignup = document.getElementById('auth-tab-signup');
  const firstGroup = document.getElementById('auth-firstname-group');
  const firstInput = document.getElementById('auth-firstname');
  const passInput = document.getElementById('auth-password');
  const confirmGroup = document.getElementById('auth-password-confirm-group');
  const confirmInput = document.getElementById('auth-password-confirm');
  const submitBtn = document.getElementById('auth-submit-btn');
  const fb = document.getElementById('auth-feedback');

  if (tabLogin) {
    tabLogin.classList.toggle('is-active', !isSignup);
    tabLogin.setAttribute('aria-selected', !isSignup ? 'true' : 'false');
  }
  if (tabSignup) {
    tabSignup.classList.toggle('is-active', isSignup);
    tabSignup.setAttribute('aria-selected', isSignup ? 'true' : 'false');
  }
  if (firstGroup) firstGroup.style.display = isSignup ? 'block' : 'none';
  if (firstInput) firstInput.required = isSignup;
  if (confirmGroup) confirmGroup.style.display = isSignup ? 'block' : 'none';
  if (confirmInput) confirmInput.required = isSignup;
  if (passInput) passInput.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  if (fb) fb.style.display = 'none';

  if (submitBtn) {
    submitBtn.textContent = isSignup ? '✓ CRÉER MON COMPTE' : 'SE CONNECTER';
  }
}

function setAuthState(state, user = null) {
  currentAuthUser = user || null;
  document.body.setAttribute('data-auth', state);

  const checkingBox = document.getElementById('auth-checking-box');
  const formBox = document.getElementById('auth-form-box');

  if (state === 'checking') {
    if (checkingBox) checkingBox.style.display = 'block';
    if (formBox) formBox.style.display = 'none';
    updateSettingsUserUI(null);
  } else if (state === 'unauthenticated') {
    if (checkingBox) checkingBox.style.display = 'none';
    if (formBox) formBox.style.display = 'block';
    updateSettingsUserUI(null);
    const fb = document.getElementById('auth-feedback');
    if (fb) fb.style.display = 'none';
  } else if (state === 'authenticated') {
    if (checkingBox) checkingBox.style.display = 'none';
    if (formBox) formBox.style.display = 'none';
    updateSettingsUserUI(user);
  }

  if (typeof dismissAppSplash === 'function' && state !== 'checking') {
    dismissAppSplash();
  }
}

function showAuthFeedback(message, type = 'error') {
  const feedbackEl = document.getElementById('auth-feedback');
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.className = `auth-feedback ${type}`;
  feedbackEl.style.display = 'block';
}

function translateAuthError(msg) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme d\'abord ton adresse email via le lien reçu dans ta boîte mail.';
  }
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'Un compte existe déjà avec cet email. Connecte-toi !';
  }
  if (m.includes('password should be at least')) {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'Les inscriptions publiques sont désactivées sur Supabase.';
  }
  if (m.includes('rate limit')) {
    return 'Trop de tentatives. Réessaie dans quelques instants.';
  }
  return msg || 'Erreur d\'authentification.';
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const firstInput = document.getElementById('auth-firstname');
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-password-confirm');
  const submitBtn = document.getElementById('auth-submit-btn');

  const email = (emailInput ? emailInput.value : '').trim();
  const password = passInput ? passInput.value : '';

  if (!email) {
    showAuthFeedback('Renseigne ton adresse email.', 'error');
    if (emailInput) emailInput.focus();
    return;
  }

  if (authTabMode === 'signup') {
    const firstName = formatCleanFirstName(firstInput ? firstInput.value : '');
    const passwordConfirm = confirmInput ? confirmInput.value : '';
    if (!firstName) {
      showAuthFeedback('Renseigne ton prénom.', 'error');
      if (firstInput) firstInput.focus();
      return;
    }
    if (!password || password.length < 6) {
      showAuthFeedback('Choisis un mot de passe d\'au moins 6 caractères.', 'error');
      if (passInput) passInput.focus();
      return;
    }
    if (password !== passwordConfirm) {
      showAuthFeedback('Les deux mots de passe ne correspondent pas.', 'error');
      if (confirmInput) confirmInput.focus();
      return;
    }

    const originalText = submitBtn ? submitBtn.textContent : '✓ CRÉER MON COMPTE';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'CRÉATION...';
    }
    const fb = document.getElementById('auth-feedback');
    if (fb) fb.style.display = 'none';

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName }
        }
      });

      if (error) {
        if (typeof playErrorSound === 'function') playErrorSound();
        showAuthFeedback(translateAuthError(error.message), 'error');
        return;
      }

      if (data && data.session) {
        savePersistentAuthBackup(data.session);
        onAuthenticatedSession(data.session);
      } else if (data && data.user) {
        if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();
        setAuthTabMode('login');
        showAuthFeedback(`Compte créé pour ${firstName} ! Vérifie tes emails pour confirmer puis connecte-toi.`, 'success');
      }
    } catch (err) {
      showAuthFeedback('Erreur réseau : impossible de créer le compte pour le moment.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
    return;
  }

  if (!password) {
    showAuthFeedback('Renseigne ton mot de passe.', 'error');
    if (passInput) passInput.focus();
    return;
  }

  const originalText = submitBtn ? submitBtn.textContent : 'SE CONNECTER';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'CONNEXION...';
  }
  const fb = document.getElementById('auth-feedback');
  if (fb) fb.style.display = 'none';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      if (typeof playErrorSound === 'function') playErrorSound();
      showAuthFeedback(translateAuthError(error.message), 'error');
      return;
    }

    if (data && data.session) {
      savePersistentAuthBackup(data.session);
      onAuthenticatedSession(data.session);
    }
  } catch (err) {
    showAuthFeedback('Erreur réseau : impossible de vérifier la connexion.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

async function handleLogout() {
  const prevUid = getCurrentAuthUserId() || lastAuthenticatedUid;
  window.__manualLogoutInProgress = true;
  clearPersistentAuthBackup();
  resetAppStateOnUserChange(prevUid);
  lastAuthenticatedUid = null;
  isSessionVerifiedOnline = false;
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {}
  window.__manualLogoutInProgress = false;
  setAuthState('unauthenticated', null);
  setAuthTabMode('login');
  showToast('Déconnecté.', { type: 'info' });
}

function onAuthenticatedSession(session) {
  if (!session || !session.user) {
    setAuthState('unauthenticated', null);
    return;
  }

  const newUid = String(session.user.id || '');
  if (!newUid) {
    setAuthState('unauthenticated', null);
    return;
  }

  const userSwitched = Boolean(lastAuthenticatedUid && lastAuthenticatedUid !== newUid);
  if (userSwitched) {
    resetAppStateOnUserChange(lastAuthenticatedUid);
  }

  lastAuthenticatedUid = newUid;
  savePersistentAuthBackup(session);
  setAuthState('authenticated', session.user);
  migrateLegacyUnscopedStorageToUser(newUid);

  if (typeof hydrateVehicleFromAuthUser === 'function') {
    hydrateVehicleFromAuthUser(session.user);
  }
  if (typeof updateVehicleUI === 'function') {
    updateVehicleUI();
  }
  if (typeof updateLiveClockUI === 'function') {
    updateLiveClockUI();
  }
  if (typeof updateNetworkStatusUI === 'function') {
    updateNetworkStatusUI();
  }

  if (!isAppBooted) {
    isAppBooted = true;
    bootMainApp();
  } else {
    if (typeof renderPresetPills === 'function') renderPresetPills();
    if (typeof initSupabaseRealtime === 'function') initSupabaseRealtime();
    if (typeof fetchShifts === 'function') fetchShifts();
    if (typeof syncOfflineQueue === 'function') syncOfflineQueue(false);
  }
}

async function restoreSessionFromBackup(backup) {
  if (!backup || !backup.refresh_token) return null;

  if (backup.access_token && backup.refresh_token) {
    try {
      const { data, error } = await supabaseClient.auth.setSession({
        access_token: backup.access_token,
        refresh_token: backup.refresh_token
      });
      if (!error && data && data.session) return data.session;
    } catch (e) {}
  }

  return null;
}

async function initAuthGate() {
  const loginForm = document.getElementById('auth-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  setAuthState('checking');

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      if (window.__manualLogoutInProgress) {
        setAuthState('unauthenticated', null);
        return;
      }
      if (!navigator.onLine) return;
      const prevUid = getCurrentAuthUserId() || lastAuthenticatedUid;
      resetAppStateOnUserChange(prevUid);
      lastAuthenticatedUid = null;
      setAuthState('unauthenticated', null);
    } else if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
      isSessionVerifiedOnline = true;
      onAuthenticatedSession(session);
    }
  });

  window.addEventListener('online', async () => {
    if (!isSessionVerifiedOnline && currentAuthUser) {
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data && data.session) {
          isSessionVerifiedOnline = true;
          onAuthenticatedSession(data.session);
          return;
        }
        const backup = await getPersistentAuthBackupAsync();
        const restored = await restoreSessionFromBackup(backup);
        if (restored) {
          isSessionVerifiedOnline = true;
          onAuthenticatedSession(restored);
        } else {
          resetAppStateOnUserChange(getCurrentAuthUserId());
          lastAuthenticatedUid = null;
          setAuthState('unauthenticated', null);
          showToast('Session expirée : reconnecte-toi.', { type: 'warn' });
        }
      } catch (e) {}
    }
  });

  try {
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) {
      if (navigator.onLine) {
        const userRes = await supabaseClient.auth.getUser().catch(() => null);
        if (userRes && userRes.error && /jwt|invalid|expired|user from sub claim/i.test(userRes.error.message || '')) {
          await supabaseClient.auth.signOut().catch(() => {});
          clearPersistentAuthBackup();
          setAuthState('unauthenticated', null);
          return;
        }
        if (userRes && userRes.data && userRes.data.user) {
          data.session.user = userRes.data.user;
        }
        isSessionVerifiedOnline = true;
      }
      onAuthenticatedSession(data.session);
      return;
    }

    const backup = await getPersistentAuthBackupAsync();
    if (backup && navigator.onLine) {
      const restored = await restoreSessionFromBackup(backup);
      if (restored) {
        isSessionVerifiedOnline = true;
        onAuthenticatedSession(restored);
        return;
      }
      clearPersistentAuthBackup();
    } else if (backup && !navigator.onLine && backup.userId && backup.refresh_token) {
      // Mode hors-ligne strict : restaurer uniquement les données locales cloisonnées de cet utilisateur, puis revérifier dès le retour en ligne
      onAuthenticatedSession({
        user: {
          id: backup.userId,
          email: backup.email || '',
          user_metadata: backup.firstName ? { first_name: backup.firstName } : {}
        },
        access_token: backup.access_token,
        refresh_token: backup.refresh_token
      });
      return;
    }

    setAuthState('unauthenticated', null);
  } catch (err) {
    const fallback = getPersistentAuthBackupSync();
    if (!navigator.onLine && fallback && fallback.userId && fallback.refresh_token) {
      onAuthenticatedSession({
        user: {
          id: fallback.userId,
          email: fallback.email || '',
          user_metadata: fallback.firstName ? { first_name: fallback.firstName } : {}
        },
        access_token: fallback.access_token,
        refresh_token: fallback.refresh_token
      });
    } else {
      setAuthState('unauthenticated', null);
    }
  }
}
