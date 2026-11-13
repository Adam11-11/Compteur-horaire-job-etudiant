// ==========================================
// ASSISTANT IA GÉNÉRALISÉ (BOUTON CIRCULAIRE FLOTTANT : DICTÉE VOCALE & SCAN PHOTO "ADAM")
// Propulsé par Google Gemini 2.5 Flash (Gratuit via Google AI Studio)
// ==========================================

const GEMINI_KEY_STORAGE = 'compteur_paella_gemini_key_v1';
const GEMINI_KEY_COOKIE = 'cp_gemini_key_v1';
const TARGET_WORKER_NAME = 'ADAM';

let isVoiceRecording = false;
let isAiMenuOpen = false;
let activeSpeechRecognition = null;
let activeMediaRecorder = null;
let recordedAudioChunks = [];
let pendingExtraAiEntries = [];

// --- GESTION DU MENU FLOTTANT CIRCULAIRE (BAS GAUCHE) ---
function toggleAiFabMenu(forceState) {
  const menu = document.getElementById('ai-fab-menu');
  const btn = document.getElementById('ai-fab-btn');
  if (!menu || !btn) return;

  isAiMenuOpen = typeof forceState === 'boolean' ? forceState : !isAiMenuOpen;
  menu.classList.toggle('open', isAiMenuOpen);
  btn.setAttribute('aria-expanded', isAiMenuOpen ? 'true' : 'false');
  if (!isAiMenuOpen) {
    const cfg = document.getElementById('ai-config-panel');
    if (cfg) cfg.style.display = 'none';
  }
}

function handleAiFabMainClick() {
  if (typeof playClickSound === 'function') playClickSound();
  const btn = document.getElementById('ai-fab-btn');
  if (btn) {
    btn.classList.remove('chef-bounce');
    void btn.offsetWidth;
    btn.classList.add('chef-bounce');
  }
  if (isVoiceRecording) {
    stopAiVoiceDictation();
    return;
  }
  toggleAiFabMenu();
}

function handleAiMenuVoiceClick() {
  toggleAiFabMenu(false);
  toggleAiVoiceDictation();
}

function handleAiMenuPhotoClick() {
  if (!getGeminiApiKey()) {
    toggleAiFabMenu(true);
    toggleAiConfigPanel(true);
    showToast('Colle d\'abord ta clé API Gemini gratuite pour scanner tes feuilles !', { type: 'info', duration: 4000 });
    return;
  }
  toggleAiFabMenu(false);
  triggerAiSheetPhotoScan();
}

function showAiLiveBubble(html, stateClass = 'loading', autoHideMs = 0) {
  const bubble = document.getElementById('ai-fab-live-bubble');
  if (!bubble) return;
  if (!html) {
    bubble.style.display = 'none';
    bubble.innerHTML = '';
    return;
  }
  bubble.className = `ai-fab-live-bubble ${stateClass}`;
  bubble.innerHTML = html;
  bubble.style.display = 'block';
  if (autoHideMs > 0) {
    setTimeout(() => {
      if (bubble.innerHTML === html) {
        bubble.style.display = 'none';
      }
    }, autoHideMs);
  }
}

// --- GESTION DE LA CLÉ API GEMINI (SYNCHRONISÉE AVEC SUPABASE AUTH) ---
function getGeminiApiKey() {
  try {
    const local = window.localStorage.getItem(GEMINI_KEY_STORAGE);
    if (local && local.trim()) return local.trim();
  } catch (e) {}

  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + GEMINI_KEY_COOKIE + '=([^;]*)'));
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]).trim();
      if (decoded) return decoded;
    }
  } catch (e) {}

  if (typeof currentAuthUser !== 'undefined' && currentAuthUser && currentAuthUser.user_metadata && currentAuthUser.user_metadata.gemini_api_key) {
    const metaKey = String(currentAuthUser.user_metadata.gemini_api_key).trim();
    if (metaKey) {
      saveGeminiApiKeyLocally(metaKey);
      return metaKey;
    }
  }
  return '';
}

function saveGeminiApiKeyLocally(key) {
  const clean = (key || '').trim();
  try {
    if (clean) {
      window.localStorage.setItem(GEMINI_KEY_STORAGE, clean);
    } else {
      window.localStorage.removeItem(GEMINI_KEY_STORAGE);
    }
  } catch (e) {}
  try {
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    const maxAge = clean ? 31536000 : 0;
    document.cookie = `${GEMINI_KEY_COOKIE}=${encodeURIComponent(clean)}; max-age=${maxAge}; path=/; SameSite=Lax${secureFlag}`;
  } catch (e) {}
}

async function saveGeminiKeyFromUI() {
  const inp = document.getElementById('ai-api-key-input');
  if (!inp) return;
  const key = inp.value.trim();
  if (!key) {
    showToast('Colle ta clé API Gemini (commence par AIza...).', { type: 'warn' });
    return;
  }

  saveGeminiApiKeyLocally(key);

  try {
    if (supabaseClient && supabaseClient.auth) {
      const { data } = await supabaseClient.auth.updateUser({
        data: { gemini_api_key: key }
      });
      if (data && data.user) {
        currentAuthUser = data.user;
      }
    }
  } catch (e) {}

  updateAiKeyStatusUI();
  toggleAiConfigPanel(false);
  if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();
  showToast('Clé IA Gemini enregistrée et synchronisée sur ton compte ! 🤖', { type: 'success', duration: 3500 });
}

async function syncGeminiKeyFromSupabaseUser() {
  try {
    if (!supabaseClient || !supabaseClient.auth) return;
    const { data } = await supabaseClient.auth.getUser();
    if (data && data.user && data.user.user_metadata && data.user.user_metadata.gemini_api_key) {
      const remoteKey = String(data.user.user_metadata.gemini_api_key).trim();
      if (remoteKey) {
        saveGeminiApiKeyLocally(remoteKey);
        updateAiKeyStatusUI();
      }
    }
  } catch (e) {}
}

function toggleAiConfigPanel(forceState) {
  const panel = document.getElementById('ai-config-panel');
  if (!panel) return;
  const shouldOpen = typeof forceState === 'boolean' ? forceState : (panel.style.display === 'none' || !panel.style.display);
  panel.style.display = shouldOpen ? 'block' : 'none';
  if (shouldOpen) {
    const inp = document.getElementById('ai-api-key-input');
    if (inp) {
      inp.value = getGeminiApiKey();
      inp.focus();
    }
  }
}

function updateAiKeyStatusUI() {
  const key = getGeminiApiKey();
  const cfgBtn = document.getElementById('ai-key-toggle-btn');
  const labelEl = document.getElementById('ai-key-status-label');
  if (cfgBtn) {
    if (key) {
      if (labelEl) labelEl.textContent = 'CLÉ IA PRÊTE ✓';
      cfgBtn.classList.add('ai-ready');
    } else {
      if (labelEl) labelEl.textContent = 'CONFIGURER CLÉ IA';
      cfgBtn.classList.remove('ai-ready');
    }
  }
}

// --- APPEL API GEMINI (AVEC DÉTECTION AUTOMATIQUE DES MODÈLES DISPONIBLES) ---
let cachedGeminiModels = null;
let cachedGeminiModelsKey = '';

async function discoverAvailableGeminiModels(apiKey) {
  if (cachedGeminiModels && cachedGeminiModelsKey === apiKey && cachedGeminiModels.length > 0) {
    return cachedGeminiModels;
  }

  const preferredOrder = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-pro',
    'gemini-pro-latest'
  ];

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(listUrl);
    if (res.ok) {
      const data = await res.json();
      const rawModels = Array.isArray(data.models) ? data.models : [];
      const supported = rawModels
        .filter(m => {
          const methods = m.supportedGenerationMethods || [];
          const name = String(m.name || '').replace(/^models\//, '');
          if (!methods.includes('generateContent')) return false;
          if (/embedding|imagen|veo|tts|aqa|bisheng|learnlm/i.test(name)) return false;
          return /^gemini-/i.test(name);
        })
        .map(m => String(m.name).replace(/^models\//, ''));

      if (supported.length > 0) {
        supported.sort((a, b) => {
          const idxA = preferredOrder.indexOf(a);
          const idxB = preferredOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          const isFlashA = a.includes('flash') ? 0 : 1;
          const isFlashB = b.includes('flash') ? 0 : 1;
          return isFlashA - isFlashB;
        });
        cachedGeminiModels = supported;
        cachedGeminiModelsKey = apiKey;
        return supported;
      }
    }
  } catch (e) {
    // Fallback silencieux sur la liste par défaut si ListModels échoue
  }

  return ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest'];
}

function parseJsonFromGeminiText(rawText) {
  if (!rawText) throw new Error('Réponse vide de l\'IA.');
  const cleaned = String(rawText)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Réponse IA invalide (JSON non reconnu).');
  }
}

async function callGeminiStructured(parts, systemInstruction) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    toggleAiFabMenu(true);
    toggleAiConfigPanel(true);
    throw new Error('Configure d\'abord ta clé API Gemini gratuite dans le menu 🤖.');
  }

  const models = await discoverAvailableGeminiModels(apiKey);
  let primaryError = null;

  // Fusionne la consigne système directement dans les parts utilisateur pour une compatibilité maximale v1beta
  const combinedParts = [
    { text: `${systemInstruction}\n\nIMPORTANT : Réponds uniquement avec l'objet JSON brut, sans texte autour.` },
    ...parts
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: combinedParts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody && errBody.error && errBody.error.message) || `Erreur HTTP ${response.status}`;
        if (response.status === 400 && /API_KEY_INVALID|key not valid/i.test(msg)) {
          throw new Error('Clé API Gemini invalide. Vérifie ta clé dans le menu 🤖.');
        }
        // Si le modèle est introuvable (404), on passe au suivant sans écraser une vraie erreur précédente
        if (response.status === 404 || /not found|not supported/i.test(msg)) {
          if (!primaryError) primaryError = new Error(msg);
          continue;
        }
        if (!primaryError) primaryError = new Error(msg);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
      if (!rawText) {
        if (!primaryError) primaryError = new Error('Réponse vide de l\'IA.');
        continue;
      }

      return parseJsonFromGeminiText(rawText);
    } catch (err) {
      if (/Clé API Gemini invalide/i.test(err.message)) throw err;
      if (!primaryError) primaryError = err;
    }
  }

  throw primaryError || new Error('Impossible de joindre Gemini.');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || '');
      const commaIdx = res.indexOf(',');
      resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function prepareImageForGemini(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1600;
      let width = img.width || 1200;
      let height = img.height || 1200;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const commaIdx = dataUrl.indexOf(',');
      resolve({
        mimeType: 'image/jpeg',
        base64: commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl
      });
    };
    img.onerror = async () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const b64 = await blobToBase64(file);
        resolve({
          mimeType: file.type || 'image/jpeg',
          base64: b64
        });
      } catch (err) {
        reject(err);
      }
    };
    img.src = objectUrl;
  });
}

// --- 1. SCANNER PHOTO DE LA FEUILLE DE ROUTE (LIGNE "ADAM") ---
function triggerAiSheetPhotoScan() {
  if (!getGeminiApiKey()) {
    toggleAiFabMenu(true);
    toggleAiConfigPanel(true);
    showToast('Colle d\'abord ta clé API Gemini gratuite pour scanner tes feuilles !', { type: 'info', duration: 4000 });
    return;
  }
  const inp = document.getElementById('ai-sheet-photo-input');
  if (inp) {
    inp.value = '';
    inp.click();
  }
}

async function analyzeSheetPhotoWithAI(file) {
  if (!file) return;

  // 1. D'une pierre deux coups : attacher immédiatement la photo comme preuve dans le formulaire
  if (typeof setFormPhotoFile === 'function') {
    setFormPhotoFile(file, true);
  }

  if (!getGeminiApiKey()) return;

  const fabBtn = document.getElementById('ai-fab-btn');
  const fabIcon = document.getElementById('ai-fab-icon');
  const statusBanner = document.getElementById('ai-scan-result-banner');

  if (fabBtn) fabBtn.classList.add('busy');
  if (fabIcon) fabIcon.innerHTML = PX_ICO.hourglass;

  showAiLiveBubble('🤖 Lecture de la feuille (recherche de <strong>ADAM</strong>)...', 'loading');

  if (statusBanner) {
    statusBanner.className = 'ai-result-banner loading';
    statusBanner.style.display = 'block';
    statusBanner.innerHTML = '🤖 Analyse de la feuille en cours (recherche de la ligne <strong>ADAM</strong>)...';
  }

  try {
    const preparedImg = await prepareImageForGemini(file);
    const refYear = typeof activePayYear === 'number' ? activePayYear : new Date().getFullYear();
    const todayYMD = typeof toYMD === 'function' ? toYMD(new Date()) : new Date().toISOString().slice(0, 10);

    const systemPrompt = `Tu es un assistant expert en lecture de feuilles de planning/pointage de traiteur Paella.
Sur la photo du tableau :
1. Il y a plusieurs lignes pour différents employés (WALID, KAMAL, SAID, WISSAM, ADAM, etc.). Ignore tous les autres employés et cherche UNIQUEMENT la ou les lignes où la colonne "PERSONNELS" contient "${TARGET_WORKER_NAME}" (insensible à la casse).
2. En haut à gauche du tableau figure la date du jour au format "SAM. 07.11" ou "DIM. 15/11" (Jour.Mois). Convertis-la au format "YYYY-MM-DD" en utilisant l'année de référence ${refYear} (ou aujourd'hui ${todayYMD} si illisible).
3. Pour CHAQUE ligne où "PERSONNELS" est "${TARGET_WORKER_NAME}" :
   - La colonne "RDV" contient l'heure de début imprimée (ex: "19H15" -> "19:15").
   - La colonne juste à droite de "RDV" contient l'heure de fin écrite à la main au stylo (ex: "23h40" -> "23:40").
   - La colonne de gauche tout au début indique le véhicule (ex: "P. TRAFIC", "K. LONG", "TB 1").
   - La colonne "PRESTATIONS" indique la ville et le détail (ex: "VILLIERS EN BIERE 60 P. (SP 21h00)").
   - ATTENTION RÈGLE MÉTIER CRUCIALE (NE PAS CUMULER PRESTATION 60€ ET LIVRAISON) :
     * Cas A — C'est une LIVRAISON PURE (la colonne PRESTATIONS indique "LIV 1", "LIV 2", "LIV" SANS "SP" ni "SERV") :
       Alors "category": "livraisons", "has_delivery": true, mets les horaires dans "del_start" et "del_end", et laisse OBLIGATOIREMENT "std_start": "" et "std_end": "" vides (sinon l'application ajoute 60€ de prestation par erreur !).
     * Cas B — C'est une PRESTATION (service sur place "SP", ou "LIV + SERV") :
       Alors "category": "prestations", "has_delivery": false, mets les horaires dans "std_start" et "std_end", et laisse "del_start": "" et "del_end": "" vides.
4. Réponds UNIQUEMENT avec un objet JSON strict de la forme :
{
  "found": true,
  "date": "YYYY-MM-DD",
  "entries": [
    {
      "category": "prestations | livraisons",
      "std_start": "HH:MM ou vide si livraison",
      "std_end": "HH:MM ou vide si livraison",
      "std_break": 0,
      "has_delivery": false,
      "del_start": "HH:MM si livraison sinon vide",
      "del_end": "HH:MM si livraison sinon vide",
      "del_minutes": 0,
      "tip_pay": 0,
      "note": "Ville + nombre de parts + véhicule (ex: Villiers-en-Bière 60P - P. Trafic)"
    }
  ],
  "summary": "Résumé court de ce qui a été lu pour ${TARGET_WORKER_NAME}"
}`;

    const result = await callGeminiStructured(
      [
        { text: `Lis cette feuille de planning, ignore les autres prénoms et trouve uniquement la ou les lignes de ${TARGET_WORKER_NAME} ainsi que la date en haut à gauche.` },
        { inline_data: { mime_type: preparedImg.mimeType, data: preparedImg.base64 } }
      ],
      systemPrompt
    );

    showAiLiveBubble('', '');
    applyAiExtractedShift(result, 'photo');
  } catch (err) {
    if (typeof playErrorSound === 'function') playErrorSound();
    showAiLiveBubble(`⚠ ${escapeHtml(err.message || 'Impossible de lire la photo')}`, 'error', 4500);
    if (statusBanner) {
      statusBanner.className = 'ai-result-banner error';
      statusBanner.style.display = 'block';
      statusBanner.textContent = `⚠ ${err.message || 'Impossible de lire la photo'}`;
    }
    showToast(`Erreur lecture IA : ${err.message || 'Échec'}`, { type: 'error', duration: 4000 });
  } finally {
    if (fabBtn) fabBtn.classList.remove('busy');
    if (fabIcon) fabIcon.innerHTML = PX_ICO.robot;
  }
}

// --- 2. DICTÉE VOCALE IA (MICRO TÉLÉPHONE & PC) ---
function toggleAiVoiceDictation() {
  if (isVoiceRecording) {
    stopAiVoiceDictation();
  } else {
    startAiVoiceDictation();
  }
}

async function startAiVoiceDictation() {
  const fabBtn = document.getElementById('ai-fab-btn');
  const fabIcon = document.getElementById('ai-fab-icon');

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Priorité 1 : Enregistrement audio envoyé à Gemini (ultra fiable sur mobile iOS/Android) si clé présente
  if (getGeminiApiKey() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedAudioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      activeMediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      activeMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedAudioChunks.push(e.data);
      };

      activeMediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordedAudioChunks, { type: activeMediaRecorder.mimeType || 'audio/webm' });
        await processVoiceAudioWithGemini(blob);
      };

      activeMediaRecorder.start();
      isVoiceRecording = true;
      if (fabBtn) fabBtn.classList.add('recording');
      if (fabIcon) fabIcon.innerHTML = PX_ICO.stop;
      showAiLiveBubble('🎙️ <strong>Parle maintenant !</strong><br><small>Appuie sur ⏹ quand tu as fini</small>', 'recording');
      return;
    } catch (micErr) {
      // Fallback vers SpeechRecognition si disponible
    }
  }

  // Priorité 2 : Web Speech API native du téléphone (fonctionne même sans clé API !)
  if (SpeechRec) {
    try {
      activeSpeechRecognition = new SpeechRec();
      activeSpeechRecognition.lang = 'fr-FR';
      activeSpeechRecognition.interimResults = false;
      activeSpeechRecognition.maxAlternatives = 1;

      isVoiceRecording = true;
      if (fabBtn) fabBtn.classList.add('recording');
      if (fabIcon) fabIcon.innerHTML = PX_ICO.stop;
      showAiLiveBubble('🎙️ <strong>Écoute en cours...</strong><br><small>Dis tes horaires, livraison ou pourboire</small>', 'recording');

      activeSpeechRecognition.onresult = async (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        stopAiVoiceDictation();
        if (transcript) {
          await processVoiceTranscript(transcript);
        }
      };

      activeSpeechRecognition.onerror = (event) => {
        stopAiVoiceDictation();
        showAiLiveBubble('', '');
        showToast(`Erreur micro : ${event.error || 'Non autorisé'}`, { type: 'error' });
      };

      activeSpeechRecognition.onend = () => {
        if (isVoiceRecording) stopAiVoiceDictation();
      };

      activeSpeechRecognition.start();
      return;
    } catch (e) {}
  }

  toggleAiFabMenu(true);
  toggleAiConfigPanel(true);
  showToast('Active l\'accès au micro ou configure ta clé IA gratuite.', { type: 'warn', duration: 4000 });
}

function stopAiVoiceDictation() {
  isVoiceRecording = false;
  const fabBtn = document.getElementById('ai-fab-btn');
  const fabIcon = document.getElementById('ai-fab-icon');
  if (fabBtn) fabBtn.classList.remove('recording');
  if (fabIcon) fabIcon.innerHTML = PX_ICO.robot;

  if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
    try { activeMediaRecorder.stop(); } catch (e) {}
  }
  if (activeSpeechRecognition) {
    try { activeSpeechRecognition.stop(); } catch (e) {}
    activeSpeechRecognition = null;
  }
}

async function processVoiceAudioWithGemini(audioBlob) {
  const fabBtn = document.getElementById('ai-fab-btn');
  const fabIcon = document.getElementById('ai-fab-icon');
  if (fabBtn) fabBtn.classList.add('busy');
  if (fabIcon) fabIcon.innerHTML = PX_ICO.hourglass;
  showAiLiveBubble('🤖 Analyse de ta voix en cours...', 'loading');

  try {
    const base64Audio = await blobToBase64(audioBlob);
    const todayYMD = typeof toYMD === 'function' ? toYMD(new Date()) : new Date().toISOString().slice(0, 10);
    const systemPrompt = buildVoiceSystemPrompt(todayYMD);

    const result = await callGeminiStructured(
      [
        { text: `Aujourd'hui nous sommes le ${todayYMD}. Écoute cet enregistrement vocal, détermine s'il s'agit d'une prestation (horaires), d'une livraison ou d'un pourboire, et extrais les informations au format JSON.` },
        { inline_data: { mime_type: audioBlob.type || 'audio/webm', data: base64Audio } }
      ],
      systemPrompt
    );

    showAiLiveBubble('', '');
    applyAiExtractedShift(result, 'voice');
  } catch (err) {
    if (typeof playErrorSound === 'function') playErrorSound();
    showAiLiveBubble(`⚠ ${escapeHtml(err.message || 'Erreur analyse vocale')}`, 'error', 4500);
  } finally {
    if (fabBtn) fabBtn.classList.remove('busy');
    if (fabIcon) fabIcon.innerHTML = PX_ICO.robot;
  }
}

async function processVoiceTranscript(transcript) {
  showAiLiveBubble(`🎙️ <em>"${escapeHtml(transcript)}"</em>...`, 'loading');
  const todayYMD = typeof toYMD === 'function' ? toYMD(new Date()) : new Date().toISOString().slice(0, 10);

  if (getGeminiApiKey()) {
    try {
      const result = await callGeminiStructured(
        [{ text: `Aujourd'hui nous sommes le ${todayYMD}. Phrase dictée : "${transcript}"` }],
        buildVoiceSystemPrompt(todayYMD)
      );
      showAiLiveBubble('', '');
      applyAiExtractedShift(result, 'voice');
      return;
    } catch (e) {}
  }

  const localResult = parseVoiceTranscriptLocally(transcript, todayYMD);
  showAiLiveBubble('', '');
  applyAiExtractedShift(localResult, 'voice');
}

function buildVoiceSystemPrompt(todayYMD) {
  return `Tu es un assistant de pointage intelligent pour un job étudiant (traiteur Paella).
Date d'aujourd'hui : ${todayYMD}.

RÈGLES MÉTIER ABSOLUES (À RESPECTER STRICTEMENT POUR ÉVITER TOUTE ERREUR DE PAIE) :
L'application possède 3 catégories distinctes qui ne doivent PAS être mélangées par erreur :

1. CATÉGORIE "livraisons" (LIVRAISON) :
   - Si l'utilisateur dit qu'il a fait une LIVRAISON (ex: "j'ai fait une livraison", "livraison de 11h à 13h50", "livraison de 2h50", "livraison à 34 euros") :
   - Tu DOIS mettre : "category": "livraisons" et "has_delivery": true.
   - INTERDICTION ABSOLUE de remplir "std_start" ou "std_end" pour une livraison ! "std_start" et "std_end" DOIVENT rester vides ("") sinon l'application ajoute un minimum de 60€ de prestation par-dessus la livraison !
   - Si l'utilisateur donne les heures de début et de fin de sa livraison, mets-les UNIQUEMENT dans "del_start" ("HH:MM") et "del_end" ("HH:MM").
   - Si l'utilisateur donne la durée de la livraison (ex: "2h50" ou "170 minutes"), convertis-la en minutes dans "del_minutes" (ex: 170).
   - Si l'utilisateur donne directement le montant en euros d'une livraison longue > 30€ (ex: "livraison à 34 euros"), calcule les minutes à 12€/h : "del_minutes" = Math.round((montant / 12) * 60) (ex: 34€ -> 170 minutes) et mets "del_pay": 34. Si c'est une livraison normale sans durée précisée, mets "del_minutes": 0 (forfait 30€).

2. CATÉGORIE "prestations" (PRESTATION / SERVICE / TAF) :
   - Si l'utilisateur parle de ses heures de travail / prestation / service (sans dire que c'est une livraison) :
   - Mets "category": "prestations", "std_start": "HH:MM", "std_end": "HH:MM", et "has_delivery": false (sauf s'il précise explicitement avoir fait UNE prestation ET UNE livraison séparée).

3. CATÉGORIE "pourboires" (POURBOIRE / TIP SEUL) :
   - Si l'utilisateur mentionne uniquement un pourboire (ex: "20 euros de pourboire") :
   - Mets "category": "pourboires", "tip_pay": 20, "std_start": "", "std_end": "", "has_delivery": false.

Réponds UNIQUEMENT avec un objet JSON strict :
{
  "category": "prestations | livraisons | pourboires",
  "date": "YYYY-MM-DD",
  "std_start": "HH:MM uniquement si prestation, VIDE si livraison",
  "std_end": "HH:MM uniquement si prestation, VIDE si livraison",
  "std_break": 0,
  "has_delivery": false,
  "del_start": "HH:MM si livraison avec horaires, sinon vide",
  "del_end": "HH:MM si livraison avec horaires, sinon vide",
  "del_minutes": 0,
  "del_pay": 0,
  "tip_pay": 0,
  "note": "Note ou ville éventuelle",
  "summary": "Résumé court de ce qui a été compris"
}`;
}

// Garde-fou déterministe : empêche à 100% que les horaires d'une livraison aillent dans std_start/std_end (et déclenchent le min 60€)
function normalizeAiEntry(raw) {
  const item = { ...(raw || {}) };
  const summaryAndNote = `${item.summary || ''} ${item.note || ''}`.toLowerCase();

  let cat = String(item.category || '').toLowerCase().trim();
  const mentionsDeliveryOnly =
    cat === 'livraisons' ||
    cat === 'livraison' ||
    (Boolean(item.has_delivery) && !/\b(prestation|service\s+sur\s+place)\b/i.test(summaryAndNote));

  if (mentionsDeliveryOnly) {
    item.category = 'livraisons';
    item.has_delivery = true;

    // Si l'IA a mis les horaires de la livraison dans std_start / std_end par erreur, on les déplace dans del_start / del_end !
    if (!item.del_start && !item.del_end && item.std_start && item.std_end) {
      item.del_start = item.std_start;
      item.del_end = item.std_end;
    }

    // On vide OBLIGATOIREMENT std_start et std_end pour ne JAMAIS déclencher les 60€ minimum de prestation
    item.std_start = '';
    item.std_end = '';
    item.std_break = 0;

    // Calcul de del_minutes si del_start et del_end sont fournis
    if (item.del_start && item.del_end && typeof getMinutesBetween === 'function') {
      const rangeMin = getMinutesBetween(item.del_start, item.del_end);
      if (rangeMin > 0) {
        item.del_minutes = rangeMin;
      }
    }

    // Si un montant en euros > 30€ a été dicté (ex: 34€) sans durée en minutes ni horaires, on déduit les minutes (12€/h)
    const explicitDelPay = Number(item.del_pay) || 0;
    if ((!item.del_minutes || item.del_minutes <= 0) && explicitDelPay > 30) {
      item.del_minutes = Math.round((explicitDelPay / (typeof HOURLY_RATE === 'number' ? HOURLY_RATE : 12)) * 60);
    }
  } else if (cat === 'pourboires' || cat === 'pourboire' || (!item.std_start && !item.has_delivery && Number(item.tip_pay) > 0)) {
    item.category = 'pourboires';
    item.std_start = '';
    item.std_end = '';
    item.std_break = 0;
    item.has_delivery = false;
    item.del_start = '';
    item.del_end = '';
    item.del_minutes = 0;
  } else {
    item.category = 'prestations';
    item.del_start = item.del_start || '';
    item.del_end = item.del_end || '';
  }

  return item;
}

function parseVoiceTranscriptLocally(text, todayYMD) {
  const lower = text.toLowerCase().replace(/heures?/g, 'h').replace(/\s+/g, ' ');
  let dateStr = todayYMD;
  if (/\bhier\b/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStr = toYMD(d);
  }

  const has_delivery = /\blivraisons?\b/.test(lower);
  const mentionsPrestation = /\b(prestations?|services?)\b/.test(lower);
  const isDeliveryOnly = has_delivery && !mentionsPrestation;

  const timeMatches = [...lower.matchAll(/(\d{1,2})\s*(?:h|:)\s*(\d{0,2})/g)];
  let firstTime = '';
  let secondTime = '';
  if (timeMatches.length >= 2) {
    const h1 = String(Math.min(23, Number(timeMatches[0][1]))).padStart(2, '0');
    const m1 = String(Math.min(59, Number(timeMatches[0][2] || 0))).padStart(2, '0');
    const h2 = String(Math.min(23, Number(timeMatches[1][1]))).padStart(2, '0');
    const m2 = String(Math.min(59, Number(timeMatches[1][2] || 0))).padStart(2, '0');
    firstTime = `${h1}:${m1}`;
    secondTime = `${h2}:${m2}`;
  }

  let std_start = '';
  let std_end = '';
  let del_start = '';
  let del_end = '';
  let del_minutes = 0;

  if (isDeliveryOnly) {
    del_start = firstTime;
    del_end = secondTime;
    // Si une seule durée est dite (ex: "livraison de 2h50")
    if (timeMatches.length === 1) {
      const durH = Number(timeMatches[0][1]) || 0;
      const durM = Number(timeMatches[0][2]) || 0;
      del_minutes = durH * 60 + durM;
    }
    const euroMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?|balles?)/);
    if (!del_start && !del_minutes && euroMatch && !/\b(pourboire|tip)\b/.test(lower)) {
      const val = parseFloat(String(euroMatch[1]).replace(',', '.')) || 0;
      if (val > 30) {
        del_minutes = Math.round((val / 12) * 60);
      }
    }
  } else {
    std_start = firstTime;
    std_end = secondTime;
  }

  let std_break = 0;
  const pauseMatch = lower.match(/(\d{1,3})\s*(?:min|minutes?)\s*de\s*pause|pause\s*(?:de\s*)?(\d{1,3})/);
  if (pauseMatch) {
    std_break = Number(pauseMatch[1] || pauseMatch[2] || 0);
  }

  let tip_pay = 0;
  const tipMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?|balles?)\s*(?:de\s*)?(?:pourboire|tip)|(?:pourboire|tip)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/);
  if (tipMatch) {
    tip_pay = parseFloat(String(tipMatch[1] || tipMatch[2]).replace(',', '.')) || 0;
  }

  let category = 'prestations';
  if (isDeliveryOnly) category = 'livraisons';
  else if (!std_start && !has_delivery && tip_pay > 0) category = 'pourboires';

  return normalizeAiEntry({
    category,
    date: dateStr,
    std_start,
    std_end,
    std_break,
    has_delivery,
    del_start,
    del_end,
    del_minutes,
    tip_pay,
    note: '',
    summary: text
  });
}

// --- APPLICATION AUTOMATIQUE, MODALE DE CONFIRMATION & SAUVEGARDE ---
let lastAiTargetView = 'prestations';

async function saveAllAiDetectedEntries() {
  closeAiConfirmModal(false);
  const extras = [...pendingExtraAiEntries];
  pendingExtraAiEntries = [];
  await saveShift(null);

  if (extras.length > 0 && navigator.onLine && typeof supabaseClient !== 'undefined') {
    for (const rawExtra of extras) {
      const extra = normalizeAiEntry(rawExtra);
      const startMin = extra.std_start ? parseTimeMinutes(extra.std_start) : null;
      const endMin = extra.std_end ? parseTimeMinutes(extra.std_end) : null;
      let stdMinutes = 0;
      if (startMin !== null && endMin !== null) {
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60;
        stdMinutes = Math.max(0, diff - (Number(extra.std_break) || 0));
      }
      const stdPay = stdMinutes > 0 ? Math.max(STD_MIN_PAY, (stdMinutes / 60) * HOURLY_RATE) : 0;

      let delMinutes = Number(extra.del_minutes) || 0;
      if (extra.del_start && extra.del_end && typeof getMinutesBetween === 'function') {
        const dm = getMinutesBetween(extra.del_start, extra.del_end);
        if (dm > 0) delMinutes = dm;
      }
      const delPay = extra.has_delivery
        ? Math.max(DELIVERY_DEFAULT_PAY, (delMinutes / 60) * HOURLY_RATE)
        : 0;
      const tipPay = Number(extra.tip_pay) || 0;
      // Les pourboires ne sont pas comptés dans total_pay (paie du mois)
      const totalPay = stdPay + delPay;

      await supabaseClient.from('shifts').insert([{
        date: extra.date,
        note: extra.note || '',
        std_start: extra.std_start || '',
        std_end: extra.std_end || '',
        std_break: Number(extra.std_break) || 0,
        std_minutes: stdMinutes,
        std_pay: Number(stdPay.toFixed(2)),
        has_delivery: Boolean(extra.has_delivery),
        del_minutes: delMinutes,
        del_pay: Number(delPay.toFixed(2)),
        total_pay: Number(totalPay.toFixed(2)),
        proof_url: tipPay > 0 ? `tip:${tipPay.toFixed(2)}` : null,
        is_legacy: false
      }]);
    }
    await fetchShifts();
    showToast(`${extras.length + 1} lignes ADAM enregistrées avec succès !`, { type: 'success' });
  }
}

async function confirmAiModalAndSave() {
  const saveBtn = document.getElementById('ai-confirm-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ AJOUT EN COURS...';
  }
  try {
    await saveAllAiDetectedEntries();
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '✅ CONFIRMER & AJOUTER';
    }
  }
}

function editAiModalInForm() {
  closeAiConfirmModal(false);
  if (typeof playClickSound === 'function') playClickSound();
  if (typeof window.setView === 'function') {
    window.setView(lastAiTargetView || 'prestations', true);
  }
  const titleEl = document.getElementById('form-section-title');
  if (titleEl) {
    const titleMap = {
      prestations: 'VÉRIFIER / MODIFIER LA PRESTATION',
      livraisons: 'VÉRIFIER / MODIFIER LA LIVRAISON',
      pourboires: 'VÉRIFIER / MODIFIER LE POURBOIRE'
    };
    titleEl.textContent = titleMap[lastAiTargetView] || 'VÉRIFIER LA SAISIE IA';
  }
  if (typeof scrollToForm === 'function') {
    setTimeout(() => scrollToForm(), 80);
  }
}

function closeAiConfirmModal(resetForm = false) {
  const modal = document.getElementById('ai-confirm-modal');
  if (modal) modal.style.display = 'none';
  if (resetForm) {
    pendingExtraAiEntries = [];
    if (typeof cancelEdit === 'function') cancelEdit();
  }
}

function openAiConfirmModal(data, calc, sourceType) {
  const modal = document.getElementById('ai-confirm-modal');
  const badgeEl = document.getElementById('ai-confirm-source-badge');
  const bodyEl = document.getElementById('ai-confirm-body');
  const saveBtn = document.getElementById('ai-confirm-save-btn');
  if (!modal || !bodyEl) return;

  if (badgeEl) {
    badgeEl.textContent = sourceType === 'photo'
      ? '📸 SCAN FEUILLE (LIGNE ADAM)'
      : '🎙️ DICTÉE VOCALE IA';
  }

  let catBadgeHtml = `<span class="ai-cat-pill cat-prest">🍳 PRESTATION</span>`;
  if (data.category === 'livraisons') {
    catBadgeHtml = `<span class="ai-cat-pill cat-del">${PX_ICO.crate} LIVRAISON</span>`;
  } else if (data.category === 'pourboires') {
    catBadgeHtml = `<span class="ai-cat-pill cat-tip">${PX_ICO.gem} POURBOIRE (HORS PAIE)</span>`;
  }

  const rowsHtml = [];
  rowsHtml.push(`
    <div class="ai-confirm-row">
      <span class="ai-confirm-label">TYPE DÉTECTÉ</span>
      <span class="ai-confirm-val">${catBadgeHtml}</span>
    </div>
  `);

  if (data.date) {
    rowsHtml.push(`
      <div class="ai-confirm-row">
        <span class="ai-confirm-label">DATE</span>
        <strong class="ai-confirm-val">${escapeHtml(formatDateWithDayFR(data.date))}</strong>
      </div>
    `);
  }

  if (data.category === 'prestations' && data.std_start && data.std_end) {
    const durStr = calc.stdMinutes > 0 ? ` (${formatHoursMin(calc.stdMinutes)})` : '';
    rowsHtml.push(`
      <div class="ai-confirm-row">
        <span class="ai-confirm-label">HORAIRES PRESTATION</span>
        <strong class="ai-confirm-val">${escapeHtml(data.std_start)} ➔ ${escapeHtml(data.std_end)}${durStr}</strong>
      </div>
    `);
    if (Number(data.std_break) > 0) {
      rowsHtml.push(`
        <div class="ai-confirm-row">
          <span class="ai-confirm-label">PAUSE</span>
          <span class="ai-confirm-val">${Number(data.std_break)} min</span>
        </div>
      `);
    }
  }

  if (data.has_delivery) {
    let delDetail = 'Forfait 30.00 €';
    if (data.del_start && data.del_end) {
      const dm = calc.delMinutes > 0 ? ` (${formatHoursMin(calc.delMinutes)})` : '';
      delDetail = `${escapeHtml(data.del_start)} ➔ ${escapeHtml(data.del_end)}${dm}`;
    } else if (calc.delMinutes > 0) {
      delDetail = `Durée : ${formatHoursMin(calc.delMinutes)}${calc.delMinutes > 150 ? ' (> 2h30 à 12€/h)' : ''}`;
    }
    rowsHtml.push(`
      <div class="ai-confirm-row">
        <span class="ai-confirm-label">DÉTAIL LIVRAISON</span>
        <strong class="ai-confirm-val">${delDetail}</strong>
      </div>
    `);
  }

  if (Number(data.tip_pay) > 0) {
    rowsHtml.push(`
      <div class="ai-confirm-row">
        <span class="ai-confirm-label">POURBOIRE</span>
        <strong class="ai-confirm-val" style="color: var(--green-soft);">+${Number(data.tip_pay).toFixed(2)} € (non compté dans la paie)</strong>
      </div>
    `);
  }

  if (data.note) {
    rowsHtml.push(`
      <div class="ai-confirm-row">
        <span class="ai-confirm-label">LIEU / NOTE</span>
        <span class="ai-confirm-val">${escapeHtml(data.note)}</span>
      </div>
    `);
  }

  if (sourceType === 'photo') {
    rowsHtml.push(`
      <div class="ai-confirm-row">
        <span class="ai-confirm-label">PREUVE PHOTO</span>
        <span class="ai-confirm-val" style="color: var(--green-soft);">📷 Photo jointe automatiquement ✓</span>
      </div>
    `);
  }

  const displayAmount = calc.totalPay > 0 ? calc.totalPay : (calc.tipPay || 0);
  const amountLabel = calc.totalPay > 0 ? 'MONTANT AJOUTÉ À LA PAIE' : 'MONTANT DU POURBOIRE';

  const extraCount = pendingExtraAiEntries.length;
  const extraHtml = extraCount > 0
    ? `<div class="ai-confirm-extra-note">+ ${extraCount} autre(s) ligne(s) ADAM détectée(s) sur cette même feuille !</div>`
    : '';

  bodyEl.innerHTML = `
    <div class="ai-confirm-summary-list">
      ${rowsHtml.join('')}
    </div>
    <div class="ai-confirm-total-box">
      <span>${amountLabel}</span>
      <strong>+${displayAmount.toFixed(2)} €</strong>
    </div>
    ${extraHtml}
  `;

  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = extraCount > 0
      ? `✅ CONFIRMER LES ${extraCount + 1} LIGNES`
      : `✅ CONFIRMER & AJOUTER`;
  }

  modal.style.display = 'flex';
}

function applyAiExtractedShift(rawData, sourceType) {
  const statusBanner = document.getElementById('ai-scan-result-banner');
  if (!rawData) return;

  pendingExtraAiEntries = [];
  let data = { ...rawData };

  if (Array.isArray(rawData.entries) && rawData.entries.length > 0) {
    const first = rawData.entries[0];
    data = {
      ...rawData,
      ...first,
      date: rawData.date || first.date
    };
    if (rawData.entries.length > 1) {
      pendingExtraAiEntries = rawData.entries.slice(1).map(e => normalizeAiEntry({
        ...e,
        date: rawData.date || e.date || toYMD(new Date())
      }));
    }
  }

  // Appliquer le garde-fou métier (une livraison ne doit JAMAIS remplir std_start/std_end)
  data = normalizeAiEntry(data);

  // Déterminer la bonne section cible si l'utilisateur clique sur "MODIFIER"
  lastAiTargetView = 'prestations';
  if (data.category === 'livraisons') {
    lastAiTargetView = 'livraisons';
  } else if (data.category === 'pourboires') {
    lastAiTargetView = 'pourboires';
  }

  // Réinitialiser proprement tous les champs du formulaire avant remplissage pour éviter tout cumul fantôme
  const startEl = document.getElementById('std-start');
  const endEl = document.getElementById('std-end');
  const breakEl = document.getElementById('std-break');
  const delStartEl = document.getElementById('del-start');
  const delEndEl = document.getElementById('del-end');
  const delMinEl = document.getElementById('del-duration-min');
  const tipEl = document.getElementById('tip-amount');
  const noteEl = document.getElementById('shift-note');

  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';
  if (breakEl) breakEl.value = '0';
  if (delStartEl) delStartEl.value = '';
  if (delEndEl) delEndEl.value = '';
  if (delMinEl) delMinEl.value = '';
  if (tipEl) tipEl.value = '';
  if (noteEl) noteEl.value = '';

  if (data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    const dateEl = document.getElementById('shift-date');
    if (dateEl) dateEl.value = data.date;
  }

  // Remplir les horaires de prestation UNIQUEMENT si ce n'est pas une livraison pure
  if (data.category === 'prestations') {
    if (data.std_start && startEl) startEl.value = data.std_start;
    if (data.std_end && endEl) endEl.value = data.std_end;
    if (typeof data.std_break === 'number' && data.std_break >= 0 && breakEl) {
      breakEl.value = String(data.std_break);
    }
  }

  // Remplir la livraison et ses horaires/durée propres (sans toucher à std-start/std-end)
  if (typeof setDeliveryState === 'function') {
    setDeliveryState(Boolean(data.has_delivery));
    if (data.has_delivery) {
      if (data.del_start && delStartEl) delStartEl.value = data.del_start;
      if (data.del_end && delEndEl) delEndEl.value = data.del_end;
      if (Number(data.del_minutes) > 0 && delMinEl) {
        delMinEl.value = String(Math.round(Number(data.del_minutes)));
      }
    }
  }

  if (typeof data.tip_pay === 'number' && data.tip_pay > 0 && tipEl) {
    tipEl.value = data.tip_pay.toFixed(2);
  }

  if (data.note && noteEl) {
    noteEl.value = data.note;
  }

  const calc = typeof calculateCurrentForm === 'function' ? calculateCurrentForm() : { totalPay: 0, stdMinutes: 0, delMinutes: 0, tipPay: 0 };
  if (typeof checkFormDuplicateDate === 'function') checkFormDuplicateDate();
  if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();

  if (statusBanner) {
    statusBanner.style.display = 'none';
  }

  // Ouvrir la fenêtre modale de confirmation ("Ce que l'IA a compris" -> Confirmer ou Modifier)
  openAiConfirmModal(data, calc, sourceType);
}

function initAiAssistant() {
  updateAiKeyStatusUI();
  syncGeminiKeyFromSupabaseUser();

  const sheetInp = document.getElementById('ai-sheet-photo-input');
  if (sheetInp) {
    sheetInp.addEventListener('change', () => {
      if (sheetInp.files && sheetInp.files[0]) {
        analyzeSheetPhotoWithAI(sheetInp.files[0]);
      }
    });
  }

  // Fermer le menu déroulant IA quand on clique ailleurs sur la page
  document.addEventListener('click', (e) => {
    if (!isAiMenuOpen) return;
    const wrapper = document.getElementById('ai-fab-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      toggleAiFabMenu(false);
    }
  });
}
