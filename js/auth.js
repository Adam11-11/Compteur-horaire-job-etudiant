// ==========================================
// AUTHENTIFICATION SUPABASE (SESSION PERSISTANTE & VERROUILLAGE UI)
// ==========================================

let isAppBooted = false;
let currentAuthUser = null;
let authMode = 'password'; // 'password' | 'magiclink'

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
    // Vider les données en mémoire tant que non connecté
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

function setAuthMode(mode) {
  authMode = mode === 'magiclink' ? 'magiclink' : 'password';
  const passGroup = document.getElementById('auth-password-group');
  const passInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');
  const modePassBtn = document.getElementById('auth-mode-pass-btn');
  const modeMagicBtn = document.getElementById('auth-mode-magic-btn');
  const feedbackEl = document.getElementById('auth-feedback');

  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
  }

  if (authMode === 'magiclink') {
    if (passGroup) passGroup.style.display = 'none';
    if (passInput) passInput.required = false;
    if (submitBtn) submitBtn.textContent = '✉ ENVOYER LE LIEN MAGIQUE';
    if (modePassBtn) modePassBtn.classList.remove('active');
    if (modeMagicBtn) modeMagicBtn.classList.add('active');
  } else {
    if (passGroup) passGroup.style.display = 'block';
    if (passInput) passInput.required = true;
    if (submitBtn) submitBtn.textContent = '🔓 SE CONNECTER';
    if (modePassBtn) modePassBtn.classList.add('active');
    if (modeMagicBtn) modeMagicBtn.classList.remove('active');
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

  if (authMode === 'password' && !password) {
    showAuthFeedback('Renseigne ton mot de passe.', 'error');
    if (typeof playErrorSound === 'function') playErrorSound();
    return;
  }

  const originalBtnText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ CONNEXION...';
  }
  showAuthFeedback('', 'info');
  document.getElementById('auth-feedback').style.display = 'none';

  try {
    if (authMode === 'magiclink') {
      const redirectUrl = window.location.origin + window.location.pathname;
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: false
        }
      });
      if (error) throw error;
      if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();
      showAuthFeedback('✓ Lien envoyé ! Vérifie ta boîte mail et clique sur le lien pour ouvrir l\'appli.', 'success');
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      if (data && data.session) {
        if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();
        if (passInput) passInput.value = '';
        onAuthenticatedSession(data.session);
      }
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
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {}
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

async function initAuthGate() {
  setAuthState('checking');

  const loginForm = document.getElementById('auth-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  // Écouter les changements d'état d'authentification (connexion, déconnexion, renouvellement auto du token)
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      onAuthenticatedSession(session);
    } else if (event === 'SIGNED_OUT') {
      setAuthState('unauthenticated', null);
    }
  });

  // Vérification initiale de la session persistée (localStorage / URL Magic Link)
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (!error && data && data.session) {
      onAuthenticatedSession(data.session);
    } else {
      setAuthState('unauthenticated', null);
    }
  } catch (e) {
    setAuthState('unauthenticated', null);
  }
}

