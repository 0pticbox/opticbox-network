/* DISTORTION color/strobe extension — 2026-08-24
   Keeps the original backslash NEGATIVE STROBE intact and replaces two weaker
   default slots with color-heavy pulse effects inspired by Color Crush / RGB Pulse / Color Surge. */
(() => {
  'use strict';

  const replacements = {
    mirrorgrid: { effect: 'crushPulse', name: 'CRUSH PULSE' },
    blocks: { effect: 'chromaBurn', name: 'CHROMA BURN' },
    invert: { effect: 'rgbPulse', name: 'RGB PULSE STROBE' }
  };
  const legacyToEffect = Object.fromEntries(
    Object.entries(replacements).map(([legacyId, config]) => [legacyId, config.effect])
  );
  const defaultBindings = new Map([
    ['3', 'crushPulse'],
    ['6', 'chromaBurn'],
    ['8', 'rgbPulse']
  ]);

  let canvas;
  let ctx;
  let sourceCanvas;
  let sourceCtx;
  let keyBindings = new Map(defaultBindings);
  const active = new Set();
  const held = new Set();

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
    if (!canvas || !sourceCanvas) return;
    if (sourceCanvas.width !== canvas.width || sourceCanvas.height !== canvas.height) {
      sourceCanvas.width = canvas.width;
      sourceCanvas.height = canvas.height;
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

  function patchHelp() {
    const section = document.querySelector('[data-help="effects"]');
    if (!section) return;
    const labels = {
      '3': 'Crush Pulse',
      '6': 'Chroma Burn',
      '8': 'RGB Pulse Strobe',
      '\\': 'Negative Strobe'
    };
    section.querySelectorAll('.help-key-grid > div').forEach(item => {
      const key = item.querySelector('kbd')?.textContent?.trim();
      const span = item.querySelector('span');
      if (span && labels[key]) span.textContent = labels[key];
    });
    const paragraphs = [...section.querySelectorAll('p')];
    if (paragraphs[0]) {
      paragraphs[0].textContent = 'With Default Mapping, 3 is Crush Pulse, 4 stays Color Crush, 6 is Chroma Burn, 8 is RGB Pulse Strobe, 9 stays Color Surge, and backslash is restored to the original Negative Strobe. Use HOLD for momentary hits or LATCH to keep effects active.';
    }
    const stackNote = paragraphs.find(p => p.textContent.includes('universal pass-by-pass stack') || p.textContent.includes('distortion bank still uses'));
    if (stackNote) {
      stackNote.textContent = 'The color-heavy effects are designed to layer together: Crush Pulse + Color Crush for hard posterized hits, RGB Pulse + Color Surge for chromatic motion, and the original backslash Negative Strobe for the sharp flash you already liked.';
    }
  }

  function addWarning() {
    const fxPage = document.querySelector('[data-panel-page="effects"]');
    const grid = document.getElementById('fxButtons');
    if (!fxPage || !grid || fxPage.querySelector('.strobe-safety-note')) return;
    const note = document.createElement('p');
    note.className = 'micro-help strobe-safety-note';
    note.setAttribute('role', 'note');
    note.textContent = 'STROBE / PULSE FX USE FLASHING OR HIGH-CONTRAST PULSES. AVOID THESE FX IF YOU ARE PHOTOSENSITIVE.';
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

  function drawCrushPulse(src, amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const step = Math.floor(now / (340 - amount * 80));
    const hit = step % 4 === 0 || step % 4 === 2;
    const hue = (step * 47) % 360;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = hit
      ? `contrast(${1.75 + amount * 2.4}) saturate(${2.7 + amount * 4.2}) brightness(${.82 + amount * .22}) hue-rotate(${hue}deg)`
      : `contrast(${1.25 + amount * .85}) saturate(${1.5 + amount * 1.8})`;
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();

    if (!hit) return;

    const bandCount = 3 + Math.floor(amount * 4);
    for (let i = 0; i < bandCount; i++) {
      const bandH = Math.max(8, h * (.035 + (i % 3) * .018));
      const y = ((step * 83 + i * 137) % Math.max(1, Math.floor(h + bandH))) - bandH;
      const shift = ((i % 2 ? 1 : -1) * (7 + amount * 30));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, w, bandH);
      ctx.clip();
      ctx.globalAlpha = .42 + amount * .28;
      ctx.filter = `contrast(${2 + amount * 2.2}) saturate(${3 + amount * 4}) hue-rotate(${hue + i * 65}deg)`;
      ctx.drawImage(src, shift, 0, w, h);
      ctx.restore();
    }
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

  function drawChromaBurn(src, amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const hue = (now * (.045 + amount * .03)) % 360;
    const pulse = .5 + .5 * Math.sin(now * (.006 + amount * .002));
    const offset = (6 + amount * 32) * Math.sin(now * .012);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = `hue-rotate(${hue}deg) saturate(${2.3 + amount * 4.8}) contrast(${1.25 + amount * 1.25}) brightness(${.82 + pulse * .26})`;
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .16 + amount * .24;
    ctx.filter = `sepia(1) saturate(${5 + amount * 6}) hue-rotate(${hue + 55}deg) contrast(1.35)`;
    ctx.drawImage(src, offset, 0, w, h);
    ctx.filter = `sepia(1) saturate(${5 + amount * 6}) hue-rotate(${hue + 210}deg) contrast(1.35)`;
    ctx.drawImage(src, -offset, 0, w, h);
    ctx.restore();

    if (Math.floor(now / (460 - amount * 80)) % 3 === 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = .08 + amount * .13;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
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
    for (const effect of ['crushPulse', 'chromaBurn', 'rgbPulse']) {
      if (!active.has(effect)) continue;
      sourceCtx.setTransform(1, 0, 0, 1, 0, 0);
      sourceCtx.globalAlpha = 1;
      sourceCtx.globalCompositeOperation = 'source-over';
      sourceCtx.filter = 'none';
      sourceCtx.clearRect(0, 0, canvas.width, canvas.height);
      sourceCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);

      if (effect === 'crushPulse') drawCrushPulse(sourceCanvas, amount, now);
      else if (effect === 'chromaBurn') drawChromaBurn(sourceCanvas, amount, now);
      else if (effect === 'rgbPulse') drawRgbPulse(sourceCanvas, amount, now);
    }
    syncButtons();
  }

  function initialize() {
    canvas = document.getElementById('outputCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false });
    sourceCanvas = document.createElement('canvas');
    sourceCtx = sourceCanvas.getContext('2d');
    ensureBuffers();

    patchButtons();
    patchCustomOptions();
    addWarning();
    patchHelp();
    bindMappingControls();

    const fxGrid = document.getElementById('fxButtons');
    const mapRows = document.getElementById('customFxMapRows');
    const observer = new MutationObserver(() => {
      patchButtons();
      patchCustomOptions();
      addWarning();
      patchHelp();
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
