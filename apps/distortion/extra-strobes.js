/* DISTORTION negative-feedback strobe family — 2026-08-25
   Rebuilds backslash, 0, and period as full-frame feedback effects.
   No scan lines, sliced rectangles, or bar overlays are used. */
(() => {
  'use strict';

  const canvas = document.getElementById('outputCanvas');
  const grid = document.getElementById('fxButtons');
  if (!canvas || !grid) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  const sourceCanvas = document.createElement('canvas');
  const sourceCtx = sourceCanvas.getContext('2d');
  const feedbackCanvases = new Map();
  const feedbackContexts = new Map();

  const effects = {
    negative: { key: '\\', name: 'NEGATIVE STROBE' },
    ghost: { key: '0', name: 'GHOST STROBE' },
    void: { key: '.', name: 'VOID STROBE' }
  };

  const keyToEffect = new Map(Object.entries(effects).map(([id, item]) => [item.key, id]));
  const active = new Set();
  const held = new Set();

  const mode = () => document.getElementById('fxModeSelect')?.value || 'hold';
  const intensity = () => {
    const value = Number(document.getElementById('masterDistortion')?.value);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .45;
  };

  function blockedByUi() {
    if (document.getElementById('startupMapDialog')?.open || document.getElementById('helpDialog')?.open) return true;
    return ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  }

  function announce(text) {
    const status = document.getElementById('statusText');
    if (status) status.textContent = text.toUpperCase();
  }

  function ensureSourceBuffer() {
    if (sourceCanvas.width === canvas.width && sourceCanvas.height === canvas.height) return;
    sourceCanvas.width = canvas.width;
    sourceCanvas.height = canvas.height;
    clearAllFeedback();
  }

  function feedbackFor(id) {
    let buffer = feedbackCanvases.get(id);
    let bufferCtx = feedbackContexts.get(id);
    if (!buffer) {
      buffer = document.createElement('canvas');
      bufferCtx = buffer.getContext('2d');
      feedbackCanvases.set(id, buffer);
      feedbackContexts.set(id, bufferCtx);
    }
    if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
      buffer.width = canvas.width;
      buffer.height = canvas.height;
    }
    return { buffer, bufferCtx };
  }

  function clearFeedback(id) {
    const buffer = feedbackCanvases.get(id);
    const bufferCtx = feedbackContexts.get(id);
    if (!buffer || !bufferCtx) return;
    bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
    bufferCtx.globalAlpha = 1;
    bufferCtx.globalCompositeOperation = 'source-over';
    bufferCtx.filter = 'none';
    bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
  }

  function clearAllFeedback() {
    for (const id of feedbackCanvases.keys()) clearFeedback(id);
  }

  function syncButtons() {
    document.querySelectorAll('[data-extra-strobe]').forEach(button => {
      button.classList.toggle('active', active.has(button.dataset.extraStrobe));
    });
  }

  function press(id) {
    if (!effects[id]) return;
    if (mode() === 'latch') {
      if (active.has(id)) {
        active.delete(id);
        clearFeedback(id);
      } else {
        active.add(id);
      }
      held.delete(id);
      syncButtons();
      announce(`${effects[id].name} ${active.has(id) ? 'latched' : 'off'}`);
      return;
    }
    active.add(id);
    held.add(id);
    syncButtons();
    announce(`${effects[id].name} active`);
  }

  function release(id) {
    if (mode() !== 'hold' || !held.has(id)) return;
    held.delete(id);
    active.delete(id);
    clearFeedback(id);
    syncButtons();
  }

  function bindButton(button, id) {
    button.dataset.extraStrobe = id;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      press(id);
    });
    const stop = () => release(id);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('pointerleave', () => { if (mode() === 'hold') stop(); });
  }

  function makeButton(id) {
    const info = effects[id];
    const button = document.createElement('button');
    button.className = 'fx-btn extra-strobe-btn';
    button.innerHTML = `<strong>${info.name}</strong><span>${info.key}</span>`;

    if (id === 'void') {
      button.style.borderColor = '#756dff';
      button.style.background = 'linear-gradient(135deg, rgba(42,34,92,.52), rgba(16,26,38,.92))';
    }

    bindButton(button, id);
    return button;
  }

  function ensureCoreNegativeButton() {
    const original = grid.querySelector('[data-fx="strobe"]');
    if (!original || original.dataset.extraStrobe === 'negative') return;
    const clone = original.cloneNode(true);
    const strong = clone.querySelector('strong');
    if (strong) strong.textContent = effects.negative.name;
    bindButton(clone, 'negative');
    original.replaceWith(clone);
  }

  function ensureButtons() {
    ensureCoreNegativeButton();
    for (const id of ['ghost', 'void']) {
      if (!grid.querySelector(`[data-extra-strobe="${id}"]`)) grid.appendChild(makeButton(id));
    }
    syncButtons();
  }

  function ensureHelp() {
    const section = document.querySelector('[data-help="effects"]');
    const helpGrid = section?.querySelector('.help-key-grid');
    if (!helpGrid) return;

    const coreBackslash = [...helpGrid.querySelectorAll('div')].find(item => item.querySelector('kbd')?.textContent?.trim() === '\\');
    const coreBackslashLabel = coreBackslash?.querySelector('span');
    if (coreBackslashLabel) coreBackslashLabel.textContent = 'Negative Strobe';

    for (const id of ['ghost', 'void']) {
      const info = effects[id];
      if (helpGrid.querySelector(`[data-extra-strobe-help="${id}"]`)) continue;
      const item = document.createElement('div');
      item.dataset.extraStrobeHelp = id;
      item.innerHTML = `<kbd>${info.key}</kbd><span>${info.name.replace(' STROBE', ' Strobe')}</span>`;
      helpGrid.appendChild(item);
    }

    const firstParagraph = section.querySelector('p');
    if (firstParagraph) {
      const base = firstParagraph.textContent
        .replace(/ Extra fixed performance keys:[^.]*\./g, '')
        .replace(/ Strobe family:[^.]*\./g, '');
      firstParagraph.textContent = `${base} Strobe family: \\ = Negative Strobe, 0 = Ghost Strobe, . = Void Strobe. These three use full-frame feedback/echo motion instead of scan lines or sliced bars.`;
    }
  }

  function ensureWarning() {
    const page = document.querySelector('[data-panel-page="effects"]');
    if (!page) return;
    let note = page.querySelector('.strobe-safety-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'micro-help strobe-safety-note';
      note.setAttribute('role', 'note');
      note.style.margin = '8px 0 10px';
      note.style.fontWeight = '700';
      grid.insertAdjacentElement('afterend', note);
    }
    note.textContent = 'STROBE / PULSE FX USE FLASHING OR HIGH-CONTRAST PULSES. AVOID THESE FX IF YOU ARE PHOTOSENSITIVE.';
  }

  function copyOutput() {
    ensureSourceBuffer();
    sourceCtx.setTransform(1, 0, 0, 1, 0, 0);
    sourceCtx.globalAlpha = 1;
    sourceCtx.globalCompositeOperation = 'source-over';
    sourceCtx.filter = 'none';
    sourceCtx.clearRect(0, 0, canvas.width, canvas.height);
    sourceCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
  }

  function drawCentered(target, image, scale, dx = 0, dy = 0) {
    const w = canvas.width;
    const h = canvas.height;
    const dw = w * scale;
    const dh = h * scale;
    target.drawImage(image, (w - dw) / 2 + dx, (h - dh) / 2 + dy, dw, dh);
  }

  function storeFeedback(id) {
    const { bufferCtx } = feedbackFor(id);
    bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
    bufferCtx.globalAlpha = 1;
    bufferCtx.globalCompositeOperation = 'source-over';
    bufferCtx.filter = 'none';
    bufferCtx.clearRect(0, 0, canvas.width, canvas.height);
    bufferCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
  }

  function drawNegative(amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const { buffer } = feedbackFor('negative');
    const pulse = .5 + .5 * Math.sin(now * .024);
    const zoom = 1.015 + amount * .035 + pulse * .012;
    const driftX = Math.sin(now * .009) * (3 + amount * 9);
    const driftY = Math.cos(now * .008) * (2 + amount * 6);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = `invert(${.62 + pulse * .38}) contrast(${1.25 + amount * .95}) saturate(${1 + amount * .55})`;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = .24 + amount * .24;
    ctx.filter = `contrast(${1.15 + amount * .65})`;
    drawCentered(ctx, buffer, zoom, driftX, driftY);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .08 + amount * .12;
    ctx.filter = 'invert(1) contrast(1.25)';
    drawCentered(ctx, sourceCanvas, 1.008 + amount * .014, -driftX * .55, -driftY * .55);
    ctx.restore();

    storeFeedback('negative');
  }

  function drawGhost(amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const { buffer } = feedbackFor('ghost');
    const sway = Math.sin(now * .012);
    const pulse = .5 + .5 * Math.sin(now * .019);
    const zoom = 1.025 + amount * .055;
    const offset = (5 + amount * 18) * sway;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = `invert(${.38 + pulse * .48}) contrast(${1.12 + amount * .7}) saturate(${1.05 + amount * .7})`;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .18 + amount * .2;
    ctx.filter = `invert(.88) sepia(.28) saturate(${1.7 + amount * 1.4}) hue-rotate(180deg) contrast(1.2)`;
    drawCentered(ctx, buffer, zoom, offset, -offset * .3);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = .12 + amount * .16;
    ctx.filter = 'invert(1)';
    drawCentered(ctx, sourceCanvas, 1.012 + amount * .02, -offset * .45, offset * .18);
    ctx.restore();

    storeFeedback('ghost');
  }

  function drawVoid(amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const { buffer } = feedbackFor('void');
    const pulse = .5 + .5 * Math.sin(now * .017);
    const spiral = now * .0045;
    const zoom = 1.035 + amount * .07 + pulse * .018;
    const dx = Math.sin(spiral) * (4 + amount * 13);
    const dy = Math.cos(spiral * .83) * (3 + amount * 10);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = `invert(${.48 + pulse * .42}) sepia(.3) saturate(${1.65 + amount * 1.7}) hue-rotate(${188 + pulse * 28}deg) contrast(${1.22 + amount * .8}) brightness(${.82 + pulse * .12})`;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .2 + amount * .22;
    ctx.filter = `invert(.72) sepia(.55) saturate(${2.2 + amount * 1.8}) hue-rotate(198deg) contrast(1.25)`;
    drawCentered(ctx, buffer, zoom, dx, dy);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = .1 + amount * .15;
    ctx.filter = 'invert(1) contrast(1.35)';
    drawCentered(ctx, sourceCanvas, 1.018 + amount * .028, -dx * .65, -dy * .65);
    ctx.restore();

    storeFeedback('void');
  }

  function render(now) {
    requestAnimationFrame(render);
    if (!active.size) return;

    if (active.has('negative')) {
      copyOutput();
      drawNegative(intensity(), now);
    }
    if (active.has('ghost')) {
      copyOutput();
      drawGhost(intensity(), now);
    }
    if (active.has('void')) {
      copyOutput();
      drawVoid(intensity(), now);
    }
  }

  const observer = new MutationObserver(() => {
    ensureButtons();
    ensureHelp();
    ensureWarning();
  });
  observer.observe(grid, { childList: true, subtree: true });

  document.addEventListener('keydown', event => {
    if (blockedByUi()) return;
    const id = keyToEffect.get(event.key);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) press(id);
  }, true);

  document.addEventListener('keyup', event => {
    const id = keyToEffect.get(event.key);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    release(id);
  }, true);

  document.getElementById('panicBtn')?.addEventListener('click', () => {
    active.clear();
    held.clear();
    clearAllFeedback();
    syncButtons();
  });
  document.getElementById('resetControlsBtn')?.addEventListener('click', () => {
    active.clear();
    held.clear();
    clearAllFeedback();
    syncButtons();
  });

  ensureButtons();
  ensureHelp();
  ensureWarning();
  requestAnimationFrame(render);
})();
