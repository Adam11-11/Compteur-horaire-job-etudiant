// ==========================================
// MOTEUR AUDIO 8-BIT & RETOUR HAPTIQUE (VIBRATIONS)
// ==========================================
let audioCtx = null;
let isSoundMuted = false;
let iosHapticLabel = null;

function ensureIosHapticSwitch() {
  if (iosHapticLabel || !document.body) return iosHapticLabel;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.setAttribute('data-haptic-proxy', '1');
  label.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  input.setAttribute('data-haptic-proxy', '1');
  label.appendChild(input);
  document.body.appendChild(label);
  iosHapticLabel = label;
  return iosHapticLabel;
}

function triggerHaptic(kind = 'light') {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const patterns = {
        light: 10,
        medium: 18,
        success: [12, 35, 16, 35, 24],
        warning: [20, 35, 20],
        error: [26, 40, 26]
      };
      navigator.vibrate(patterns[kind] || 10);
      return;
    }
    // iOS 18+ Safari / PWA : le toggle d'un <input type="checkbox" switch> déclenche le Taptic Engine natif
    const lbl = ensureIosHapticSwitch();
    if (lbl) lbl.click();
  } catch (e) {}
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

function playCoinTickSound(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  const baseFreq = 560 + clamped * 680;
  playSquareTone(baseFreq, 0, 0.038, 0.045, baseFreq * 1.18);
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

document.addEventListener('click', (e) => {
  if (e.target && e.target.closest && e.target.closest('[data-haptic-proxy]')) return;
  const el = e.target.closest('button, .bottom-nav a, .month-bar-item, .delivery-toggle, .preset-pill, .tip-pill-btn, .cal-cell');
  if (!el || el.disabled) return;
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

