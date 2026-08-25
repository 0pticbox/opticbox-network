/* 0PTICBOX browser-tool adaptive performance controller — 2026-08-16 */
(() => {
  'use strict';

  if (window.OPTICBOX_PERF?.installed) return;

  const root = document.documentElement;
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const coarsePointer = window.matchMedia?.('(hover: none), (pointer: coarse)').matches || false;
  const saveData = Boolean(navigator.connection?.saveData);
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);

  let tier = 'full';
  if (
    reducedMotion ||
    saveData ||
    (memory > 0 && memory <= 4) ||
    (cores > 0 && cores <= 2)
  ) {
    tier = 'low';
  } else if (
    coarsePointer ||
    (memory > 0 && memory <= 8) ||
    (cores > 0 && cores <= 4)
  ) {
    tier = 'mid';
  }

  let targetFps = tier === 'low' ? 30 : tier === 'mid' ? 45 : 60;
  let frameInterval = 1000 / targetFps;
  let nextFrameId = 1;
  let pumpId = 0;
  let lastDelivery = 0;
  const queuedFrames = new Map();

  const style = document.createElement('style');
  style.id = 'opticbox-app-performance-style';
  style.textContent = `
    html.optic-perf-loading *,
    html.optic-perf-loading *::before,
    html.optic-perf-loading *::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
    html.optic-perf-low {
      --opticbox-performance-quality: .58;
      --opticbox-performance-glow: .55;
    }
    html.optic-perf-mid {
      --opticbox-performance-quality: .78;
      --opticbox-performance-glow: .78;
    }
    html.optic-perf-full {
      --opticbox-performance-quality: 1;
      --opticbox-performance-glow: 1;
    }
    html.optic-perf-low canvas,
    html.optic-perf-mid canvas,
    html.optic-perf-low video,
    html.optic-perf-mid video {
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
    }
    html.optic-perf-low [style*="backdrop-filter"],
    html.optic-perf-low [style*="backdropFilter"] {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        scroll-behavior: auto !important;
      }
    }
  `;
  (document.head || document.documentElement).append(style);

  const applyTier = (nextTier, reason = 'hardware') => {
    if (!['low', 'mid', 'full'].includes(nextTier)) return;
    tier = nextTier;
    targetFps = tier === 'low' ? 30 : tier === 'mid' ? 45 : 60;
    frameInterval = 1000 / targetFps;
    root.classList.remove('optic-perf-low', 'optic-perf-mid', 'optic-perf-full');
    root.classList.add(`optic-perf-${tier}`);
    root.dataset.performanceTier = tier;
    root.style.setProperty('--opticbox-target-fps', String(targetFps));
    window.OPTICBOX_PERF.tier = tier;
    window.OPTICBOX_PERF.targetFps = targetFps;
    window.OPTICBOX_PERF.reason = reason;
    document.dispatchEvent(new CustomEvent('opticbox:performance-tier', {
      detail: { tier, targetFps, reason },
    }));
  };

  const pump = (now) => {
    pumpId = 0;
    if (!queuedFrames.size) return;

    if (document.hidden || now - lastDelivery + 0.25 < frameInterval) {
      pumpId = nativeRAF(pump);
      return;
    }

    lastDelivery = now;
    const batch = [...queuedFrames.entries()];
    queuedFrames.clear();

    for (const [, callback] of batch) {
      try {
        callback(now);
      } catch (error) {
        setTimeout(() => { throw error; }, 0);
      }
    }

    if (queuedFrames.size && !pumpId) pumpId = nativeRAF(pump);
  };

  window.requestAnimationFrame = (callback) => {
    if (typeof callback !== 'function') return nativeRAF(callback);
    const id = nextFrameId++;
    queuedFrames.set(id, callback);
    if (!pumpId) pumpId = nativeRAF(pump);
    return id;
  };

  window.cancelAnimationFrame = (id) => {
    queuedFrames.delete(id);
  };

  window.OPTICBOX_PERF = {
    installed: true,
    tier,
    targetFps,
    reason: 'hardware',
    reducedMotion,
    saveData,
    memory,
    cores,
    coarsePointer,
    pixelRatioCap: tier === 'low' ? 1 : tier === 'mid' ? 1.5 : 2,
    nativeRequestAnimationFrame: nativeRAF,
    setTier(nextTier) {
      applyTier(nextTier, 'manual');
    },
  };

  root.classList.add('optic-perf-loading');
  applyTier(tier, 'hardware');

  const releaseLoadingMotion = () => {
    nativeRAF(() => nativeRAF(() => {
      window.setTimeout(() => root.classList.remove('optic-perf-loading'), 40);
    }));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', releaseLoadingMotion, { once: true });
  } else {
    releaseLoadingMotion();
  }

  let monitorStart = 0;
  let monitorLast = 0;
  const monitorSamples = [];

  const monitor = (now) => {
    if (!monitorStart) monitorStart = now;
    if (!document.hidden && monitorLast) {
      const delta = now - monitorLast;
      if (delta > 0 && delta < 250) monitorSamples.push(delta);
    }
    monitorLast = now;

    if (now - monitorStart < 3200) {
      nativeRAF(monitor);
      return;
    }

    if (monitorSamples.length < 18) return;
    const ordered = monitorSamples.slice().sort((a, b) => a - b);
    const p75 = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.75))];

    if (p75 >= 30 && tier !== 'low') {
      applyTier('low', 'measured-frame-time');
    } else if (p75 >= 21 && tier === 'full') {
      applyTier('mid', 'measured-frame-time');
    }
  };

  nativeRAF(monitor);
})();

/* DISTORTION-only extensions. Keeping this path-gated means the shared
   performance controller stays a no-op for every other 0PTICBOX app. */
(() => {
  'use strict';
  if (!/\/apps\/distortion\/?(?:index\.html)?$/i.test(location.pathname)) return;

  const loadDistortionExtensions = () => {
    const load = (src, marker) => {
      if (document.querySelector(`script[${marker}]`)) return;
      const script = document.createElement('script');
      script.src = src;
      script.setAttribute(marker, 'true');
      (document.head || document.documentElement).appendChild(script);
    };

    load('./strobe-fx.js?v=20260824-3', 'data-distortion-strobe-pack');
    load('./clip-trim.js?v=20260825-1', 'data-distortion-clip-trim');
    load('./extra-strobes.js?v=20260825-2', 'data-distortion-extra-strobes');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDistortionExtensions, { once: true });
  } else {
    loadDistortionExtensions();
  }
})();
