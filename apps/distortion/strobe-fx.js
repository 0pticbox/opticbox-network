/* DISTORTION strobe illusion pack — 2026-08-24
   Replaces the default Mirror Grid / Negative Pulse / Negative Strobe performance
   slots with three distinct strobe illusions while keeping Mirror Shards. */
(() => {
  'use strict';

  const replacements = {
    mirrorgrid: { effect: 'frameSkip', name: 'FRAME SKIP STROBE' },
    invert: { effect: 'rgbPulse', name: 'RGB PULSE STROBE' },
    strobe: { effect: 'rollingBand', name: 'ROLLING BAND STROBE' }
  };
  const legacyToEffect = Object.fromEntries(
    Object.entries(replacements).map(([legacyId, config]) => [legacyId, config.effect])
  );
  const defaultBindings = new Map([
    ['3', 'frameSkip'],
    ['8', 'rgbPulse'],
    ['\\', 'rollingBand']
  ]);

  let canvas;
  let ctx;
  let sourceCanvas;
  let sourceCtx;
  let holdCanvas;
  let holdCtx;
  let keyBindings = new Map(defaultBindings);
  const active = new Set();
  const held = new Set();
  let lastFrameSkipStep = -1;
  let holdReady = false;

  const normalizeKey = key => key === ' ' ? 'space' : String(key).toLowerCase();
  const mode = () => document.getElementById('fxModeSelect')?.value || 'hold';
  const intensity = () => {
    const value = Number(document.getElementById('masterDistortion')?.value);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .45;
  };
  const blockedByUi = () => {
    if (document.getElementById('startupMapDialog')?.open || document.getElementById('helpDialog')?.open) return true;
    const tag = document.activeElement?.tagName;
    return ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
  };

  function announce(text) {
    const status = document.getElementById('statusText');
    if (status) status.textContent = text.toUpperCase();
  }

  function ensureBuffers() {
    if (!canvas) return;
    for (const buffer of [sourceCanvas, holdCanvas]) {
      if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        holdReady = false;
      }
    }
  }

  function setActive(effect, enabled) {
    if (enabled) active.add(effect);
    else active.delete(effect);
    syncButtons();
  }

  function pressEffect(effect) {
    if (mode() === 'latch') {
      setActive(effect, !active.has(effect));
      announce(`${effectLabel(effect)} ${active.has(effect) ? 'latched' : 'off'}`);
      return;
    }
    active.add(effect);
    held.add(effect);
    syncButtons();
    announce(`${effectLabel(effect)} active`);
  }

  function releaseEffect(effect) {
    if (mode() !== 'hold' || !held.has(effect)) return;
    held.delete(effect);
    active.delete(effect);
    syncButtons();
  }

  function effectLabel(effect) {
    return Object.values(replacements).find(item => item.effect === effect)?.name || effect;
  }

  function syncButtons() {
    document.querySelectorAll('[data-strobe-effect]').forEach(button => {
      button.classList.toggle('active', active.has(button.dataset.strobeEffect));
    });
  }

  function upgradeButton(button, legacyId) {
    if (!button || button.dataset.strobeUpgraded === 'true') return;
    const config = replacements[legacyId];
    if (!config) return;
    const clone = button.cloneNode(true);
    clone.dataset.strobeUpgraded = 'true';
    clone.dataset.strobeEffect = config.effect;
    const strong = clone.querySelector('strong');
    if (strong) strong.textContent = config.name;

    clone.addEventListener('pointerdown', event => {
      event.preventDefault();
      clone.setPointerCapture?.(event.pointerId);
      pressEffect(config.effect);
    });
    const release = () => releaseEffect(config.effect);
    clone.addEventListener('pointerup', release);
    clone.addEventListener('pointercancel', release);
    clone.addEventListener('pointerleave', () => {
      if (mode() === 'hold') release();
    });
    button.replaceWith(clone);
  }

  function patchButtons() {
    Object.keys(replacements).forEach(legacyId => {
      upgradeButton(document.querySelector(`#fxButtons [data-fx="${legacyId}"]`), legacyId);
    });
    syncButtons();
  }

  function patchCustomOptions() {
    document.querySelectorAll('#customFxMapRows select option').forEach(option => {
      const config = replacements[option.value];
      if (config) option.textContent = config.name;
    });
  }

  function addWarning() {
    const fxPage = document.querySelector('[data-panel-page="effects"]');
    const grid = document.getElementById('fxButtons');
    if (!fxPage || !grid || fxPage.querySelector('.strobe-safety-note')) return;
    const note = document.createElement('p');
    note.className = 'micro-help strobe-safety-note';
    note.setAttribute('role', 'note');
    note.textContent = 'STROBE FX USE RAPID FLASHING / HIGH-CONTRAST PULSES. AVOID THESE FX IF YOU ARE PHOTOSENSITIVE.';
    note.style.margin = '8px 0 10px';
    note.style.fontWeight = '700';
    grid.insertAdjacentElement('afterend', note);
  }

  function applyDefaultBindings() {
    keyBindings = new Map(defaultBindings);
    active.clear();
    held.clear();
    syncButtons();
  }

  function applyCustomBindings() {
    const next = new Map();
    document.querySelectorAll('[data-fx-map-key]').forEach(select => {
      const effect = legacyToEffect[select.value];
      if (effect) next.set(normalizeKey(select.dataset.fxMapKey), effect);
    });
    keyBindings = next;
    active.clear();
    held.clear();
    syncButtons();
  }

  function bindMappingControls() {
    document.getElementById('useDefaultMapBtn')?.addEventListener('click', applyDefaultBindings);
    document.getElementById('saveCustomMapBtn')?.addEventListener('click', applyCustomBindings);
    document.getElementById('panicBtn')?.addEventListener('click', () => {
      active.clear();
      held.clear();
      syncButtons();
    });
    document.getElementById('resetControlsBtn')?.addEventListener('click', () => {
      active.clear();
      held.clear();
      syncButtons();
    });
  }

  function drawFrameSkip(src, amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const interval = 460 - amount * 80;
    const step = Math.floor(now / interval);

    if (!holdReady || step !== lastFrameSkipStep) {
      lastFrameSkipStep = step;
      if (!holdReady || step % 2 === 0) {
        holdCtx.setTransform(1, 0, 0, 1, 0, 0);
        holdCtx.globalAlpha = 1;
        holdCtx.globalCompositeOperation = 'source-over';
        holdCtx.filter = 'none';
        holdCtx.clearRect(0, 0, w, h);
        holdCtx.drawImage(src, 0, 0, w, h);
        holdReady = true;
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    if (step % 2) {
      const jump = (6 + amount * 22) * (step % 4 === 1 ? -1 : 1);
      const zoom = 1.015 + amount * .035;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2 + jump, h / 2);
      ctx.scale(zoom, zoom);
      ctx.filter = `contrast(${1.12 + amount * .7}) saturate(${1.05 + amount * .5})`;
      ctx.drawImage(holdCanvas, -w / 2, -h / 2, w, h);
    } else {
      ctx.drawImage(src, 0, 0, w, h);
    }
    ctx.restore();
  }

  function drawRgbPulse(src, amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const step = Math.floor(now / (520 - amount * 100));
    const hit = step % 4 === 0 || step % 4 === 2;
    const offset = 5 + amount * 24;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = hit ? `contrast(${1.15 + amount * .85}) saturate(${1.25 + amount * 1.4})` : 'none';
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();

    if (!hit) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .18 + amount * .22;
    ctx.filter = `sepia(1) saturate(${5 + amount * 5}) hue-rotate(300deg) contrast(1.35)`;
    ctx.drawImage(src, -offset, 0, w, h);
    ctx.filter = `sepia(1) saturate(${5 + amount * 5}) hue-rotate(145deg) contrast(1.35)`;
    ctx.drawImage(src, offset, 0, w, h);
    ctx.restore();

    if (step % 4 === 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = .18 + amount * .24;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function drawRollingBand(src, amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();

    const bands = 5 + Math.floor(amount * 4);
    const bandH = h / bands;
    const travel = (now * (.23 + amount * .18)) % (h + bandH * 2) - bandH;
    const phase = Math.floor(now / (620 - amount * 120));

    for (let i = 0; i < bands; i++) {
      const y = (travel + i * bandH * 1.45) % (h + bandH) - bandH * .5;
      const height = bandH * (.22 + amount * .16);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, w, height);
      ctx.clip();
      ctx.globalAlpha = .62 + amount * .28;
      ctx.filter = `contrast(${1.35 + amount * 1.2}) saturate(${1.1 + amount})`;
      const shift = (phase + i) % 2 ? 10 + amount * 30 : -(10 + amount * 30);
      ctx.drawImage(src, shift, 0, w, h);
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = .42 + amount * .25;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, y, w, height);
      ctx.restore();
    }
  }

  function render(now) {
    requestAnimationFrame(render);
    if (!canvas || !ctx || active.size === 0) {
      syncButtons();
      return;
    }
    ensureBuffers();
    const amount = intensity();

    // Each replacement receives the completed output of the previous one.
    for (const effect of ['frameSkip', 'rgbPulse', 'rollingBand']) {
      if (!active.has(effect)) continue;
      sourceCtx.setTransform(1, 0, 0, 1, 0, 0);
      sourceCtx.globalAlpha = 1;
      sourceCtx.globalCompositeOperation = 'source-over';
      sourceCtx.filter = 'none';
      sourceCtx.clearRect(0, 0, canvas.width, canvas.height);
      sourceCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);

      if (effect === 'frameSkip') drawFrameSkip(sourceCanvas, amount, now);
      else if (effect === 'rgbPulse') drawRgbPulse(sourceCanvas, amount, now);
      else if (effect === 'rollingBand') drawRollingBand(sourceCanvas, amount, now);
    }
    syncButtons();
  }

  function initialize() {
    canvas = document.getElementById('outputCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false });
    sourceCanvas = document.createElement('canvas');
    sourceCtx = sourceCanvas.getContext('2d');
    holdCanvas = document.createElement('canvas');
    holdCtx = holdCanvas.getContext('2d');
    ensureBuffers();

    patchButtons();
    patchCustomOptions();
    addWarning();
    bindMappingControls();

    const fxGrid = document.getElementById('fxButtons');
    const mapRows = document.getElementById('customFxMapRows');
    const observer = new MutationObserver(() => {
      patchButtons();
      patchCustomOptions();
      addWarning();
    });
    if (fxGrid) observer.observe(fxGrid, { childList: true, subtree: true });
    if (mapRows) observer.observe(mapRows, { childList: true, subtree: true });

    document.addEventListener('keydown', event => {
      if (blockedByUi()) return;
      const key = normalizeKey(event.key);
      const effect = keyBindings.get(key);
      if (!effect) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) pressEffect(effect);
    }, true);

    document.addEventListener('keyup', event => {
      const key = normalizeKey(event.key);
      const effect = keyBindings.get(key);
      if (!effect) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      releaseEffect(effect);
    }, true);

    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
