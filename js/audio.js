// ==========================================
// MOTEUR AUDIO 8-BIT & RETOUR HAPTIQUE (VIBRATIONS)
// ==========================================
let audioCtx = null;
let isSoundMuted = false;

function fireIosSwitchHaptic() {
  try {
    if (!document.body) return;
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.setAttribute('data-haptic-proxy', '1');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.setAttribute('data-haptic-proxy', '1');
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    label.remove();
  } catch (e) {}
}

// Impulsion sub-basse physique (50-95 Hz) : fait vibrer le châssis du téléphone via le haut-parleur
// même en mode PWA standalone iOS ou pendant l'animation de montée de l'argent
function playSubBassThump(strength = 0.26, duration = 0.022, startFreq = 115, endFreq = 46) {
  if (isSoundMuted) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(strength, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.005);
  } catch (e) {}
}

function triggerHaptic(kind = 'light') {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const patterns = {
        tick: 12,
        light: 14,
        medium: 22,
        page: [14, 25, 18],
        success: [16, 35, 18, 35, 28],
        warning: [24, 35, 24],
        error: [30, 40, 30]
      };
      navigator.vibrate(patterns[kind] || 14);
    } else {
      fireIosSwitchHaptic();
    }
  } catch (e) {}

  if (kind === 'tick') {
    playSubBassThump(0.28, 0.018, 130, 52);
  } else if (kind === 'page' || kind === 'medium') {
    playSubBassThump(0.34, 0.026, 125, 44);
  } else if (kind === 'success') {
    playSubBassThump(0.36, 0.032, 140, 48);
  } else if (kind === 'warning' || kind === 'error') {
    playSubBassThump(0.34, 0.03, 95, 40);
  } else {
    playSubBassThump(0.25, 0.018, 120, 48);
  }
}

function loadSoundPreference() {
  try {
    isSoundMuted = window.localStorage.getItem('pixelpay_sound_muted') === '1';
  } catch (e) {
    isSoundMuted = false;
  }
  updateSoundButtonUI();
}

function updateSoundButtonUI() {
  const btn = document.getElementById('sound-toggle-btn');
  if (!btn) return;
  btn.innerHTML = isSoundMuted
    ? (typeof PX_ICO !== 'undefined' ? PX_ICO.soundOff : '🔇')
    : (typeof PX_ICO !== 'undefined' ? PX_ICO.soundOn : '🔊');
  btn.classList.toggle('muted', isSoundMuted);
  btn.setAttribute('aria-pressed', isSoundMuted ? 'true' : 'false');
  btn.setAttribute('title', isSoundMuted ? 'Son coupé (cliquer pour activer)' : 'Son activé (cliquer pour couper)');
}

function toggleSoundMute() {
  isSoundMuted = !isSoundMuted;
  try {
    window.localStorage.setItem('pixelpay_sound_muted', isSoundMuted ? '1' : '0');
  } catch (e) {}
  updateSoundButtonUI();
  if (!isSoundMuted) {
    ensureAudioContext();
    playClickSound();
  }
}

function ensureAudioContext() {
  if (isSoundMuted) return null;
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

['pointerdown', 'touchstart', 'keydown'].forEach(evtName => {
  window.addEventListener(evtName, () => {
    if (!isSoundMuted) ensureAudioContext();
  }, { once: true, passive: true });
});

function playSquareTone(freq, startTimeOffset, duration, gainVal = 0.055, slideToFreq = null) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + startTimeOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, now);
  if (slideToFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideToFreq), now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainVal, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}

function playClickSound() {
  playSquareTone(540, 0, 0.035, 0.045, 720);
}

function playToggleSound(isOn) {
  triggerHaptic('medium');
  if (isOn) {
    playSquareTone(440, 0, 0.045, 0.05);
    playSquareTone(660, 0.045, 0.06, 0.055);
  } else {
    playSquareTone(600, 0, 0.045, 0.05);
    playSquareTone(380, 0.045, 0.06, 0.05);
  }
}

function playSaveSuccessSound() {
  triggerHaptic('success');
  playSquareTone(523.25, 0, 0.065, 0.06);
  playSquareTone(659.25, 0.065, 0.065, 0.06);
  playSquareTone(783.99, 0.13, 0.11, 0.065);
}

function playPageSwitchSound() {
  triggerHaptic('page');
  playSquareTone(420, 0, 0.03, 0.04, 580);
  playSquareTone(620, 0.028, 0.04, 0.045, 760);
}

function playCoinTickSound(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  triggerHaptic('tick');
  const baseFreq = 560 + clamped * 680;
  playSquareTone(baseFreq, 0, 0.038, 0.05, baseFreq * 1.18);
}

function playCelebrationJingle() {
  triggerHaptic('success');
  const notes = [
    { f: 587.33, t: 0,    d: 0.07 },
    { f: 783.99, t: 0.07, d: 0.07 },
    { f: 987.77, t: 0.14, d: 0.07 },
    { f: 1174.66, t: 0.21, d: 0.18 }
  ];
  notes.forEach(n => playSquareTone(n.f, n.t, n.d, 0.065));
}

function playErrorSound() {
  triggerHaptic('error');
  playSquareTone(210, 0, 0.09, 0.065, 165);
  playSquareTone(155, 0.1, 0.14, 0.065, 115);
}

function playDeleteSound() {
  triggerHaptic('warning');
  playSquareTone(460, 0, 0.05, 0.055);
  playSquareTone(320, 0.05, 0.05, 0.055);
  playSquareTone(190, 0.10, 0.09, 0.055);
}

// Déclenchement dès touchend (geste matériel actif sur iOS) + click
let lastTouchHapticTs = 0;
document.addEventListener('touchend', (e) => {
  if (e.target && e.target.closest && e.target.closest('[data-haptic-proxy]')) return;
  const el = e.target && e.target.closest
    ? e.target.closest('button, .bottom-nav a, .view-tab, .month-bar-item, .delivery-toggle, .preset-pill, .tip-pill-btn, .cal-cell')
    : null;
  if (!el || el.disabled) return;
  lastTouchHapticTs = Date.now();
  fireIosSwitchHaptic();
}, { passive: true });

document.addEventListener('click', (e) => {
  if (e.target && e.target.closest && e.target.closest('[data-haptic-proxy]')) return;
  const el = e.target.closest('button, .bottom-nav a, .view-tab, .month-bar-item, .delivery-toggle, .preset-pill, .tip-pill-btn, .cal-cell');
  if (!el || el.disabled) return;
  if (el.matches('.bottom-nav a, .view-tab')) return; // géré directement par setView() avec playPageSwitchSound()
  if (el.classList.contains('btn-danger') || el.classList.contains('del-btn') || el.classList.contains('del')) {
    triggerHaptic('warning');
    return;
  }
  if (el.id === 'ai-fab-btn' || el.classList.contains('delivery-toggle')) {
    triggerHaptic('medium');
  } else {
    triggerHaptic('light');
  }
  if (el.id === 'sound-toggle-btn') return;
  playClickSound();
});

