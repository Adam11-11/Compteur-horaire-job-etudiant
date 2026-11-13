// ==========================================
// ANIMATIONS & EFFETS VISUELS (COMPTEURS, SPARKS, BARRES, AMBIANCE)
// ==========================================
const lastAnimatedStatValues = new Map();

function animateElementClass(el, className, durationMs = 360) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  if (el._animTimers && el._animTimers[className]) {
    clearTimeout(el._animTimers[className]);
  }
  el._animTimers = el._animTimers || {};
  el._animTimers[className] = setTimeout(() => {
    el.classList.remove(className);
  }, durationMs);
}

function spawnMicroPop(targetEl, text, variant = 'gold') {
  if (!targetEl || prefersReducedMotion()) return;
  const rect = targetEl.getBoundingClientRect();
  if (!rect.width && !rect.height) return;

  const pop = document.createElement('span');
  pop.className = `pixel-micro-pop pop-${variant}`;
  pop.textContent = text;
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${Math.max(8, rect.top - 4)}px`;
  document.body.appendChild(pop);

  setTimeout(() => {
    if (pop.parentNode) pop.remove();
  }, 680);
}

function spawnSparksAtPoint(x, y, count = 5, palette = null) {
  if (prefersReducedMotion()) return;
  const colors = palette || ['', 'spark-cream', 'spark-red'];

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.45 - 0.22);
    const dist = 20 + Math.random() * 20;
    const tx = `${Math.round(Math.cos(angle) * dist)}px`;
    const ty = `${Math.round(Math.sin(angle) * dist)}px`;
    const spark = document.createElement('span');
    spark.className = `pixel-spark pixel-spark-fixed ${colors[i % colors.length]}`.trim();
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.setProperty('--tx', tx);
    spark.style.setProperty('--ty', ty);
    document.body.appendChild(spark);
    setTimeout(() => {
      if (spark.parentNode) spark.remove();
    }, 680);
  }
}

function spawnMiniSparksAt(el, count = 6) {
  if (!el || prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  spawnSparksAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
}

function initAmbientEffects() {
  if (prefersReducedMotion()) return;

  if (!document.getElementById('pixel-ambient-bg')) {
    const bg = document.createElement('div');
    bg.id = 'pixel-ambient-bg';
    bg.className = 'pixel-ambient-bg';
    bg.setAttribute('aria-hidden', 'true');

    const colors = ['ember-gold', 'ember-red', 'ember-cream', 'ember-gold', 'ember-blue'];
    const particleCount = 24;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('span');
      const leftPct = Math.round(((i + 0.4) / particleCount) * 97 + (i % 3) * 1.2);
      const isStar = i % 4 === 0;
      const size = isStar ? 6 : (i % 2 === 0 ? 5 : 4);
      const duration = 6.8 + (i % 6) * 1.3;
      const delay = -((i * 1.35) % duration);
      const drift = (i % 2 === 0 ? 1 : -1) * (14 + (i % 4) * 8);

      p.className = `ambient-pixel ${isStar ? 'ambient-star ' : ''}${colors[i % colors.length]}`;
      p.style.left = `${Math.min(98, leftPct)}%`;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.setProperty('--dur', `${duration.toFixed(1)}s`);
      p.style.setProperty('--delay', `${delay.toFixed(1)}s`);
      p.style.setProperty('--drift', `${drift}px`);
      bg.appendChild(p);
    }
    document.body.prepend(bg);
  }

  if (!window.__paellaClickSparksBound) {
    window.__paellaClickSparksBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (prefersReducedMotion()) return;
      const target = e.target.closest('.pixel-btn, .nav-btn, .view-tab, .bottom-nav a, .preset-pill, .tip-pill-btn, .stat-card-clickable, .cal-cell.worked, .month-bar-item');
      if (!target || target.disabled) return;
      const x = e.clientX || (target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2);
      const y = e.clientY || (target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2);
      let palette = null;
      if (target.closest('.tip-pill-btn, .tip-card')) palette = ['spark-green', 'spark-cream', ''];
      else if (target.closest('.delivery-card, .delivery-toggle')) palette = ['spark-blue', 'spark-cream', ''];
      spawnSparksAtPoint(x, y, 5, palette);
    }, { passive: true });
  }

  document.querySelectorAll('.paella-logo').forEach(logo => {
    if (logo.dataset.ambientBound) return;
    logo.dataset.ambientBound = '1';
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', (e) => {
      e.stopPropagation();
      animateElementClass(logo, 'paella-sizzle-pop', 460);
      spawnMiniSparksAt(logo, 9);
      if (typeof playCoinTickSound === 'function') playCoinTickSound(0.65);
    });
  });
}

function triggerViewEntrance(viewName) {
  if (prefersReducedMotion()) return;
  const viewSections = {
    counter: ['section-period', 'section-history', 'section-global'],
    prestations: ['section-form', 'section-prestations'],
    livraisons: ['section-form', 'section-livraisons'],
    pourboires: ['section-form', 'section-pourboires'],
    calendar: ['section-calendar']
  };
  const ids = viewSections[viewName] || [];
  ids.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('--view-stagger', `${idx * 45}ms`);
    animateElementClass(el, 'view-section-enter', 320);
  });
}

function animateStatIfChanged(elementId, targetVal, duration = 420) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const nextNum = Number(targetVal) || 0;
  const prevNum = lastAnimatedStatValues.has(elementId)
    ? lastAnimatedStatValues.get(elementId)
    : nextNum;

  lastAnimatedStatValues.set(elementId, nextNum);

  if (prefersReducedMotion() || Math.abs(nextNum - prevNum) < 0.01) {
    if (!activeCountRafs.has(elementId)) {
      el.textContent = `${nextNum.toFixed(2)} €`;
    }
    return;
  }

  animateValueCounter(elementId, prevNum, nextNum, duration, false);
}

function animateMonthlyBars() {
  const fills = document.querySelectorAll('#monthly-summary-list .month-bar-fill');
  if (prefersReducedMotion()) {
    fills.forEach(f => f.classList.add('bar-filled'));
    return;
  }
  fills.forEach(f => f.classList.remove('bar-filled'));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fills.forEach(f => f.classList.add('bar-filled'));
    });
  });
}

function triggerPeriodTransition(direction) {
  if (prefersReducedMotion()) return;
  const targets = [
    document.getElementById('period-label-box'),
    document.getElementById('period-stats-grid')
  ];
  const cls = direction >= 0 ? 'period-transition-next' : 'period-transition-prev';
  targets.forEach(el => {
    if (!el) return;
    el.classList.remove('period-transition-next', 'period-transition-prev');
    void el.offsetWidth;
    el.classList.add(cls);
  });
  document.querySelectorAll('#period-stats-grid .stat-card').forEach((card, idx) => {
    card.style.setProperty('--card-stagger', `${idx * 45}ms`);
    animateElementClass(card, 'stat-card-pop', 360);
  });
}

function scrollToTotalCardAndWait() {
  return new Promise(resolve => {
    const card = document.getElementById('month-total-card');
    if (!card) {
      resolve();
      return;
    }
    if (prefersReducedMotion()) {
      card.scrollIntoView({ behavior: 'auto', block: 'center' });
      resolve();
      return;
    }

    let finished = false;
    let idleTimer = null;
    let maxTimer = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', finish);
      clearTimeout(idleTimer);
      clearTimeout(maxTimer);
      resolve();
    };

    const onScroll = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, 120);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', finish, { once: true, passive: true });

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    idleTimer = setTimeout(finish, 160);
    maxTimer = setTimeout(finish, 950);
  });
}

function animateValueCounter(elementId, fromVal, toVal, duration = 1200, withCoinTicks = false) {
  return new Promise(resolve => {
    const el = document.getElementById(elementId);
    if (!el) {
      resolve();
      return;
    }
    if (activeCountRafs.has(elementId)) {
      cancelAnimationFrame(activeCountRafs.get(elementId));
      activeCountRafs.delete(elementId);
    }

    if (prefersReducedMotion() || Math.abs(toVal - fromVal) < 0.005) {
      el.textContent = `${toVal.toFixed(2)} €`;
      resolve();
      return;
    }

    const startTime = performance.now();
    let lastTickTime = 0;

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = fromVal + (toVal - fromVal) * eased;
      el.textContent = `${currentVal.toFixed(2)} €`;

      if (withCoinTicks && now - lastTickTime >= 80 && progress < 0.98) {
        lastTickTime = now;
        playCoinTickSound(progress);
      }

      if (progress < 1) {
        const rafId = requestAnimationFrame(step);
        activeCountRafs.set(elementId, rafId);
      } else {
        el.textContent = `${toVal.toFixed(2)} €`;
        activeCountRafs.delete(elementId);
        resolve();
      }
    };

    const rafId = requestAnimationFrame(step);
    activeCountRafs.set(elementId, rafId);
  });
}

function spawnFloatingGain(cardEl, addedPay) {
  if (!cardEl || prefersReducedMotion()) return;
  const badge = document.createElement('div');
  badge.className = 'floating-gain';
  badge.textContent = `+${addedPay.toFixed(2)} €`;
  cardEl.appendChild(badge);
  setTimeout(() => {
    if (badge.parentNode) badge.remove();
  }, 1300);
}

function spawnPixelCelebration(cardEl) {
  if (!cardEl || prefersReducedMotion()) return;
  const vectors = [
    { tx: '-68px', ty: '-46px', cls: '' },
    { tx: '-38px', ty: '-62px', cls: 'spark-cream' },
    { tx: '0px',   ty: '-68px', cls: '' },
    { tx: '38px',  ty: '-62px', cls: 'spark-red' },
    { tx: '68px',  ty: '-46px', cls: '' },
    { tx: '-74px', ty: '10px',  cls: 'spark-cream' },
    { tx: '74px',  ty: '10px',  cls: 'spark-cream' },
    { tx: '-44px', ty: '48px',  cls: '' },
    { tx: '44px',  ty: '48px',  cls: 'spark-red' }
  ];
  vectors.forEach(v => {
    const spark = document.createElement('span');
    spark.className = `pixel-spark ${v.cls}`.trim();
    spark.style.setProperty('--tx', v.tx);
    spark.style.setProperty('--ty', v.ty);
    cardEl.appendChild(spark);
    setTimeout(() => {
      if (spark.parentNode) spark.remove();
    }, 720);
  });
}

async function runPostSaveSequence(oldStats, newStats, shiftTotalPay) {
  if (document.body.getAttribute('data-view') !== 'counter' && typeof window.setView === 'function') {
    window.setView('counter');
  }

  lastAnimatedStatValues.set('month-std-pay', newStats.stdPay);
  lastAnimatedStatValues.set('month-del-pay', newStats.delPay);
  lastAnimatedStatValues.set('month-tip-pay', newStats.tipPay || 0);
  lastAnimatedStatValues.set('month-total-pay', newStats.totalPay);

  const totalChanged = Math.abs(newStats.totalPay - oldStats.totalPay) > 0.005;
  const tipChangedOnly = !totalChanged && Math.abs((newStats.tipPay || 0) - (oldStats.tipPay || 0)) > 0.005;
  const targetCard = tipChangedOnly
    ? (document.querySelector('.tip-card') || document.getElementById('month-total-card'))
    : document.getElementById('month-total-card');

  if (prefersReducedMotion()) {
    document.getElementById('month-std-pay').textContent = `${newStats.stdPay.toFixed(2)} €`;
    document.getElementById('month-del-pay').textContent = `${newStats.delPay.toFixed(2)} €`;
    const tipEl = document.getElementById('month-tip-pay');
    if (tipEl) tipEl.textContent = `${(newStats.tipPay || 0).toFixed(2)} €`;
    document.getElementById('month-total-pay').textContent = `${newStats.totalPay.toFixed(2)} €`;
    await scrollToTotalCardAndWait();
    return;
  }

  await scrollToTotalCardAndWait();

  if (targetCard) {
    targetCard.classList.add('counting-pulse');
    spawnFloatingGain(targetCard, shiftTotalPay);
  }

  const animPromises = [];
  if (totalChanged) {
    animPromises.push(animateValueCounter('month-total-pay', oldStats.totalPay, newStats.totalPay, 1200, true));
  }
  if (Math.abs(newStats.stdPay - oldStats.stdPay) > 0.005) {
    animPromises.push(animateValueCounter('month-std-pay', oldStats.stdPay, newStats.stdPay, 1200, false));
  }
  if (Math.abs(newStats.delPay - oldStats.delPay) > 0.005) {
    animPromises.push(animateValueCounter('month-del-pay', oldStats.delPay, newStats.delPay, 1200, false));
  }
  if (Math.abs((newStats.tipPay || 0) - (oldStats.tipPay || 0)) > 0.005) {
    animPromises.push(animateValueCounter('month-tip-pay', oldStats.tipPay || 0, newStats.tipPay || 0, 1200, tipChangedOnly));
  }

  await Promise.all(animPromises);

  if (targetCard) {
    targetCard.classList.remove('counting-pulse');
    spawnPixelCelebration(targetCard);
  }
  playCelebrationJingle();
}

