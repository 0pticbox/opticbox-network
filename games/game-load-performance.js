/* 0PTICBOX PICO-8 load smoother — does not alter game timing. */
(() => {
  'use strict';

  const loader = document.currentScript;
  const cartSource = loader?.dataset?.cart || '';
  if (!cartSource) return;

  let started = false;
  const warmCartridge = () => {
    if (started) return;
    started = true;
    fetch(cartSource, {
      cache: 'force-cache',
      credentials: 'same-origin',
      priority: 'low',
    }).catch(() => {
      /* Normal PICO-8 loading remains the fallback if prefetch is unavailable. */
    });
  };

  const scheduleWarmup = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(warmCartridge, { timeout: 1600 });
    } else {
      window.setTimeout(warmCartridge, 650);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleWarmup, { once: true });
  } else {
    scheduleWarmup();
  }

  /* If the user moves toward interacting before the idle callback fires,
     begin the cache warm-up immediately without blocking the click itself. */
  window.addEventListener('pointerdown', warmCartridge, { once: true, passive: true });
  window.addEventListener('keydown', warmCartridge, { once: true, passive: true });
})();
