// ==========================================
// ASSISTANT IA (SCANNER FEUILLE DE ROUTE "ADAM" & DICTÉE VOCALE)
// Propulsé par Google Gemini 2.5 Flash (Gratuit via Google AI Studio)
// ==========================================

const GEMINI_KEY_STORAGE = 'compteur_paella_gemini_key_v1';
const GEMINI_KEY_COOKIE = 'cp_gemini_key_v1';
const TARGET_WORKER_NAME = 'ADAM';

let isVoiceRecording = false;
let activeSpeechRecognition = null;
let activeMediaRecorder = null;
let recordedAudioChunks = [];

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

  // Synchroniser dans les métadonnées privées de l'utilisateur Supabase (pour l'avoir automatiquement sur téléphone et PC)
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
  if (cfgBtn) {
    if (key) {
      cfgBtn.textContent = '⚙ IA PRÊTE ✓';
      cfgBtn.classList.add('ai-ready');
    } else {
      cfgBtn.textContent = '⚙ CLÉ IA';
      cfgBtn.classList.remove('ai-ready');
    }
  }
}

// --- APPEL API GEMINI (AVEC FALLBACK DE MODÈLE) ---
async function callGeminiStructured(parts, systemInstruction) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    toggleAiConfigPanel(true);
    throw new Error('Configure d\'abord ta clé API Gemini gratuite (bouton ⚙ CLÉ IA).');
  }

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [{ role: 'user', parts }],
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
          throw new Error('Clé API Gemini invalide. Vérifie ta clé dans ⚙ CLÉ IA.');
        }
        lastError = new Error(msg);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = new Error('Réponse vide de l\'IA.');
        continue;
      }

      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      lastError = err;
      if (/Clé API Gemini invalide/i.test(err.message)) throw err;
    }
  }

  throw lastError || new Error('Impossible de joindre Gemini.');
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

// --- 1. SCANNER PHOTO DE LA FEUILLE DE ROUTE (LIGNE "ADAM") ---
function triggerAiSheetPhotoScan() {
  if (!getGeminiApiKey()) {
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
    setFormPhotoFile(file, true); // true = éviter une boucle si appelé depuis setFormPhotoFile
  }

  if (!getGeminiApiKey()) return;

  const scanBtn = document.getElementById('ai-scan-photo-btn');
  const statusBanner = document.getElementById('ai-scan-result-banner');
  const origBtnHtml = scanBtn ? scanBtn.innerHTML : '📸 SCANNER FEUILLE';

  if (scanBtn) {
    scanBtn.disabled = true;
    scanBtn.innerHTML = '⏳ LECTURE IA...';
  }
  if (statusBanner) {
    statusBanner.className = 'ai-result-banner loading';
    statusBanner.style.display = 'block';
    statusBanner.innerHTML = '🤖 Analyse de la feuille en cours (recherche de la ligne <strong>ADAM</strong>)...';
  }

  try {
    // Compresser l'image pour un envoi ultra-rapide en 4G/5G
    const compressedBlob = typeof compressPhotoBlob === 'function' ? await compressPhotoBlob(file) : file;
    const base64Data = await blobToBase64(compressedBlob);
    const refYear = typeof activePayYear === 'number' ? activePayYear : new Date().getFullYear();
    const todayYMD = typeof toYMD === 'function' ? toYMD(new Date()) : new Date().toISOString().slice(0, 10);

    const systemPrompt = `Tu es un assistant expert en lecture de feuilles de planning/pointage de traiteur Paella.
Sur la photo du tableau :
1. En haut à gauche du tableau figure la date du jour au format "SAM. 07.11" ou "DIM. 15/11" (Jour.Mois). Convertis-la au format "YYYY-MM-DD" en utilisant l'année de référence ${refYear} (ou aujourd'hui ${todayYMD} si illisible).
2. Cherche dans la colonne "PERSONNELS" la ligne où est écrit "${TARGET_WORKER_NAME}" (insensible à la casse).
3. Sur cette ligne "${TARGET_WORKER_NAME}" :
   - La colonne "RDV" contient l'heure de début imprimée (ex: "19H15" -> "19:15").
   - La colonne juste à droite de "RDV" contient l'heure de fin écrite à la main au stylo (ex: "23h40" -> "23:40").
   - La colonne de gauche tout au début indique parfois le véhicule (ex: "P. TRAFIC", "K. LONG", "TB 1").
   - La colonne "PRESTATIONS" indique la ville et le détail (ex: "VILLIERS EN BIERE 60 P. (SP 21h00)").
4. Réponds UNIQUEMENT avec un objet JSON strict de la forme :
{
  "found": true,
  "date": "YYYY-MM-DD",
  "std_start": "HH:MM",
  "std_end": "HH:MM",
  "std_break": 0,
  "has_delivery": false,
  "tip_pay": 0,
  "note": "Ville + nombre de parts + véhicule (ex: Villiers-en-Bière 60P - P. Trafic)",
  "summary": "Résumé court de ce qui a été lu"
}
Si le nom "${TARGET_WORKER_NAME}" n'est pas trouvé mais qu'il s'agit d'un horaire écrit autrement, remplis du mieux possible.`;

    const result = await callGeminiStructured(
      [
        { text: `Lis cette feuille de planning, trouve la ligne de ${TARGET_WORKER_NAME} ainsi que la date en haut à gauche, et extrais les horaires.` },
        { inline_data: { mime_type: compressedBlob.type || 'image/webp', data: base64Data } }
      ],
      systemPrompt
    );

    applyAiExtractedShift(result, 'photo');
  } catch (err) {
    if (typeof playErrorSound === 'function') playErrorSound();
    if (statusBanner) {
      statusBanner.className = 'ai-result-banner error';
      statusBanner.style.display = 'block';
      statusBanner.textContent = `⚠ ${err.message || 'Impossible de lire la photo'}`;
    }
    showToast(`Erreur lecture IA : ${err.message || 'Échec'}`, { type: 'error', duration: 4000 });
  } finally {
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.innerHTML = origBtnHtml;
    }
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
  const voiceBtn = document.getElementById('ai-voice-btn');
  const statusBanner = document.getElementById('ai-scan-result-banner');

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Priorité 1 : Enregistrement audio envoyé à Gemini (ultra fiable sur mobile iOS/Android et comprend tout) si clé présente
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
      if (voiceBtn) {
        voiceBtn.classList.add('recording');
        voiceBtn.innerHTML = '⏹ FINI DE PARLER';
      }
      if (statusBanner) {
        statusBanner.className = 'ai-result-banner loading';
        statusBanner.style.display = 'block';
        statusBanner.innerHTML = '🎙️ <strong>Parle maintenant !</strong> (Ex: <em>"Aujourd\'hui j\'ai fait 19h15 à 23h40 à Villiers"</em>) puis reclique sur le bouton.';
      }
      return;
    } catch (micErr) {
      // Si micro refusé ou indisponible, tenter SpeechRecognition en fallback
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
      if (voiceBtn) {
        voiceBtn.classList.add('recording');
        voiceBtn.innerHTML = '⏹ ÉCOUTE...';
      }
      if (statusBanner) {
        statusBanner.className = 'ai-result-banner loading';
        statusBanner.style.display = 'block';
        statusBanner.innerHTML = '🎙️ <strong>Parle maintenant :</strong> dis tes horaires, livraison ou pourboire...';
      }

      activeSpeechRecognition.onresult = async (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        stopAiVoiceDictation();
        if (transcript) {
          await processVoiceTranscript(transcript);
        }
      };

      activeSpeechRecognition.onerror = (event) => {
        stopAiVoiceDictation();
        showToast(`Erreur micro : ${event.error || 'Non autorisé'}`, { type: 'error' });
      };

      activeSpeechRecognition.onend = () => {
        if (isVoiceRecording) stopAiVoiceDictation();
      };

      activeSpeechRecognition.start();
      return;
    } catch (e) {}
  }

  showToast('Active l\'accès au micro dans ton navigateur ou configure ta clé IA (⚙ CLÉ IA).', { type: 'warn', duration: 4000 });
}

function stopAiVoiceDictation() {
  isVoiceRecording = false;
  const voiceBtn = document.getElementById('ai-voice-btn');
  if (voiceBtn) {
    voiceBtn.classList.remove('recording');
    voiceBtn.innerHTML = '🎙️ DICTER';
  }
  if (activeMediaRecorder && activeMediaRecorder.state !== 'inactive') {
    try { activeMediaRecorder.stop(); } catch (e) {}
  }
  if (activeSpeechRecognition) {
    try { activeSpeechRecognition.stop(); } catch (e) {}
    activeSpeechRecognition = null;
  }
}

async function processVoiceAudioWithGemini(audioBlob) {
  const statusBanner = document.getElementById('ai-scan-result-banner');
  if (statusBanner) {
    statusBanner.className = 'ai-result-banner loading';
    statusBanner.style.display = 'block';
    statusBanner.innerHTML = '🤖 Transcription et analyse de ta voix en cours...';
  }

  try {
    const base64Audio = await blobToBase64(audioBlob);
    const todayYMD = typeof toYMD === 'function' ? toYMD(new Date()) : new Date().toISOString().slice(0, 10);
    const systemPrompt = buildVoiceSystemPrompt(todayYMD);

    const result = await callGeminiStructured(
      [
        { text: `Aujourd'hui nous sommes le ${todayYMD}. Écoute cet enregistrement vocal et extrais les informations de pointage au format JSON.` },
        { inline_data: { mime_type: audioBlob.type || 'audio/webm', data: base64Audio } }
      ],
      systemPrompt
    );

    applyAiExtractedShift(result, 'voice');
  } catch (err) {
    if (typeof playErrorSound === 'function') playErrorSound();
    if (statusBanner) {
      statusBanner.className = 'ai-result-banner error';
      statusBanner.style.display = 'block';
      statusBanner.textContent = `⚠ ${err.message || 'Erreur analyse vocale'}`;
    }
  }
}

async function processVoiceTranscript(transcript) {
  const statusBanner = document.getElementById('ai-scan-result-banner');
  if (statusBanner) {
    statusBanner.className = 'ai-result-banner loading';
    statusBanner.style.display = 'block';
    statusBanner.innerHTML = `🎙️ Entendu : <em>"${escapeHtml(transcript)}"</em>...`;
  }

  const todayYMD = typeof toYMD === 'function' ? toYMD(new Date()) : new Date().toISOString().slice(0, 10);

  // Si clé Gemini présente, utiliser Gemini pour comprendre n'importe quelle formulation
  if (getGeminiApiKey()) {
    try {
      const result = await callGeminiStructured(
        [{ text: `Aujourd'hui nous sommes le ${todayYMD}. Phrase dictée : "${transcript}"` }],
        buildVoiceSystemPrompt(todayYMD)
      );
      applyAiExtractedShift(result, 'voice');
      return;
    } catch (e) {}
  }

  // Fallback local instantané sans clé API (analyse par expressions régulières)
  const localResult = parseVoiceTranscriptLocally(transcript, todayYMD);
  applyAiExtractedShift(localResult, 'voice');
}

function buildVoiceSystemPrompt(todayYMD) {
  return `Tu es un assistant de pointage pour un job étudiant (traiteur Paella).
Date d'aujourd'hui : ${todayYMD}.
À partir de ce que dit l'utilisateur, extrais un objet JSON strict :
{
  "date": "YYYY-MM-DD",
  "std_start": "HH:MM ou vide",
  "std_end": "HH:MM ou vide",
  "std_break": 0,
  "has_delivery": false,
  "del_minutes": 0,
  "tip_pay": 0,
  "note": "Note ou lieu éventuel",
  "summary": "Résumé court de ce qui a été compris"
}`;
}

function parseVoiceTranscriptLocally(text, todayYMD) {
  const lower = text.toLowerCase().replace(/heures?/g, 'h').replace(/\s+/g, ' ');
  let dateStr = todayYMD;
  if (/\bhier\b/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    dateStr = toYMD(d);
  }

  const timeMatches = [...lower.matchAll(/(\d{1,2})\s*(?:h|:)\s*(\d{0,2})/g)];
  let std_start = '';
  let std_end = '';
  if (timeMatches.length >= 2) {
    const h1 = String(Math.min(23, Number(timeMatches[0][1]))).padStart(2, '0');
    const m1 = String(Math.min(59, Number(timeMatches[0][2] || 0))).padStart(2, '0');
    const h2 = String(Math.min(23, Number(timeMatches[1][1]))).padStart(2, '0');
    const m2 = String(Math.min(59, Number(timeMatches[1][2] || 0))).padStart(2, '0');
    std_start = `${h1}:${m1}`;
    std_end = `${h2}:${m2}`;
  }

  let std_break = 0;
  const pauseMatch = lower.match(/(\d{1,3})\s*(?:min|minutes?)\s*de\s*pause|pause\s*(?:de\s*)?(\d{1,3})/);
  if (pauseMatch) {
    std_break = Number(pauseMatch[1] || pauseMatch[2] || 0);
  }

  const has_delivery = /\blivraisons?\b/.test(lower);
  let tip_pay = 0;
  const tipMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euros?|balles?)\s*(?:de\s*)?(?:pourboire|tip)|(?:pourboire|tip)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/);
  if (tipMatch) {
    tip_pay = parseFloat(String(tipMatch[1] || tipMatch[2]).replace(',', '.')) || 0;
  }

  return {
    date: dateStr,
    std_start,
    std_end,
    std_break,
    has_delivery,
    tip_pay,
    note: '',
    summary: text
  };
}

// --- APPLICATION DES DONNÉES EXTRAITES DANS LE FORMULAIRE ---
function applyAiExtractedShift(data, sourceType) {
  const statusBanner = document.getElementById('ai-scan-result-banner');
  if (!data) return;

  // Basculer sur l'onglet adéquat si nécessaire
  const currentView = document.body.getAttribute('data-view');
  if (data.std_start && data.std_end && currentView !== 'prestations') {
    if (typeof setView === 'function') setView('prestations');
  } else if (!data.std_start && data.has_delivery && currentView !== 'livraisons') {
    if (typeof setView === 'function') setView('livraisons');
  } else if (!data.std_start && !data.has_delivery && data.tip_pay > 0 && currentView !== 'pourboires') {
    if (typeof setView === 'function') setView('pourboires');
  }

  if (data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    const dateEl = document.getElementById('shift-date');
    if (dateEl) dateEl.value = data.date;
  }

  if (data.std_start) {
    const startEl = document.getElementById('std-start');
    if (startEl) startEl.value = data.std_start;
  }
  if (data.std_end) {
    const endEl = document.getElementById('std-end');
    if (endEl) endEl.value = data.std_end;
  }
  if (typeof data.std_break === 'number' && data.std_break >= 0) {
    const breakEl = document.getElementById('std-break');
    if (breakEl) breakEl.value = String(data.std_break);
  }

  if (typeof data.has_delivery === 'boolean' && typeof setDeliveryState === 'function') {
    setDeliveryState(data.has_delivery);
    if (data.has_delivery && data.del_minutes > 0) {
      const delMinEl = document.getElementById('del-duration-min');
      if (delMinEl) delMinEl.value = String(data.del_minutes);
    }
  }

  if (typeof data.tip_pay === 'number' && data.tip_pay > 0) {
    const tipEl = document.getElementById('tip-amount');
    if (tipEl) tipEl.value = data.tip_pay.toFixed(2);
  }

  if (data.note) {
    const noteEl = document.getElementById('shift-note');
    if (noteEl) noteEl.value = data.note;
  }

  const calc = typeof calculateCurrentForm === 'function' ? calculateCurrentForm() : { totalPay: 0 };
  if (typeof checkFormDuplicateDate === 'function') checkFormDuplicateDate();
  if (typeof playSaveSuccessSound === 'function') playSaveSuccessSound();

  const detailsParts = [];
  if (data.date) detailsParts.push(`📅 ${formatDateFR(data.date)}`);
  if (data.std_start && data.std_end) detailsParts.push(`⏱ ${data.std_start} - ${data.std_end}`);
  if (data.has_delivery) detailsParts.push(`🚚 Livraison`);
  if (data.tip_pay > 0) detailsParts.push(`💰 +${Number(data.tip_pay).toFixed(2)}€`);
  if (data.note) detailsParts.push(`📝 ${escapeHtml(data.note)}`);

  if (statusBanner) {
    statusBanner.className = 'ai-result-banner success';
    statusBanner.style.display = 'block';
    statusBanner.innerHTML = `
      <div class="ai-banner-row">
        <div>
          <strong>✅ ${sourceType === 'photo' ? 'FEUILLE LUE (LIGNE ADAM) + PHOTO JOINTE' : 'DICTÉE COMPRISE'} :</strong>
          <div style="margin-top:4px;">${detailsParts.join(' • ') || escapeHtml(data.summary || 'Champs remplis')} ➔ <strong>+${calc.totalPay.toFixed(2)} €</strong></div>
        </div>
        <button type="button" class="pixel-btn btn-gold ai-quick-save-btn" onclick="saveShift(null)">
          ⚡ SAUVEGARDER DIRECT
        </button>
      </div>
    `;
  }

  showToast(`IA : ${data.std_start && data.std_end ? `${data.std_start} - ${data.std_end}` : 'Champs remplis'} (+${calc.totalPay.toFixed(2)} €)`, {
    type: 'success',
    duration: 5000,
    actionText: 'SAUVEGARDER',
    onAction: () => saveShift(null)
  });
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
}

