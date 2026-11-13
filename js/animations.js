// ==========================================
// ANIMATIONS & EFFETS VISUELS (COMPTEURS, SPARKS, BARRES)
// ==========================================
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

