/* DISTORTION extra negative-strobe keys — 2026-08-25
   Adds two related but slower negative-flash variants on 0 and period.
   The original backslash NEGATIVE STROBE remains untouched in app.js. */
(() => {
  'use strict';

  const canvas = document.getElementById('outputCanvas');
  const grid = document.getElementById('fxButtons');
  if (!canvas || !grid) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  const sourceCanvas = document.createElement('canvas');
  const sourceCtx = sourceCanvas.getContext('2d');

  const effects = {
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

  function ensureBuffer() {
    if (sourceCanvas.width === canvas.width && sourceCanvas.height === canvas.height) return;
    sourceCanvas.width = canvas.width;
    sourceCanvas.height = canvas.height;
  }

  function syncButtons() {
    document.querySelectorAll('[data-extra-strobe]').forEach(button => {
      button.classList.toggle('active', active.has(button.dataset.extraStrobe));
    });
  }

  function press(id) {
    if (!effects[id]) return;
    if (mode() === 'latch') {
      if (active.has(id)) active.delete(id); else active.add(id);
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
    syncButtons();
  }

  function makeButton(id) {
    const info = effects[id];
    const button = document.createElement('button');
    button.className = 'fx-btn extra-strobe-btn';
    button.dataset.extraStrobe = id;
    button.innerHTML = `<strong>${info.name}</strong><span>${info.key === '.' ? '.' : info.key}</span>`;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      press(id);
    });
    const stop = () => release(id);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('pointerleave', () => { if (mode() === 'hold') stop(); });
    return button;
  }

  function ensureButtons() {
    for (const id of Object.keys(effects)) {
      if (!grid.querySelector(`[data-extra-strobe="${id}"]`)) grid.appendChild(makeButton(id));
    }
    syncButtons();
  }

  function ensureHelp() {
    const section = document.querySelector('[data-help="effects"]');
    const helpGrid = section?.querySelector('.help-key-grid');
    if (!helpGrid) return;
    for (const [id, info] of Object.entries(effects)) {
      if (helpGrid.querySelector(`[data-extra-strobe-help="${id}"]`)) continue;
      const item = document.createElement('div');
      item.dataset.extraStrobeHelp = id;
      item.innerHTML = `<kbd>${info.key}</kbd><span>${info.name.replace(' STROBE', ' Strobe')}</span>`;
      helpGrid.appendChild(item);
    }
    const firstParagraph = section.querySelector('p');
    if (firstParagraph && !firstParagraph.textContent.includes('Ghost Strobe')) {
      firstParagraph.textContent += ' Extra fixed performance keys: 0 = Ghost Strobe and . = Void Strobe.';
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
    ensureBuffer();
    sourceCtx.setTransform(1, 0, 0, 1, 0, 0);
    sourceCtx.globalAlpha = 1;
    sourceCtx.globalCompositeOperation = 'source-over';
    sourceCtx.filter = 'none';
    sourceCtx.clearRect(0, 0, canvas.width, canvas.height);
    sourceCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
  }

  function drawGhost(amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const step = Math.floor(now / (310 - amount * 35));
    const hit = step % 3 === 0;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = hit
      ? `invert(1) contrast(${1.25 + amount * .75}) saturate(${1.05 + amount * .7})`
      : `contrast(${1.03 + amount * .22}) brightness(${.92 + amount * .08})`;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();

    if (!hit) return;

    const shift = 7 + amount * 24;
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const y = i * h / bands;
      const bh = h / bands * .38;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, w, bh);
      ctx.clip();
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = .22 + amount * .18;
      ctx.drawImage(sourceCanvas, i % 2 ? shift : -shift, 0, w, h);
      ctx.restore();
    }
  }

  function drawVoid(amount, now) {
    const w = canvas.width;
    const h = canvas.height;
    const step = Math.floor(now / (390 - amount * 45));
    const hit = step % 4 === 0 || step % 4 === 2;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = hit
      ? `invert(1) grayscale(${.2 + amount * .35}) contrast(${1.45 + amount * .8}) brightness(${.72 + amount * .12})`
      : `brightness(${.78 + amount * .10}) contrast(${1.08 + amount * .35})`;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();

    if (!hit) return;

    const sliceCount = 5;
    const phase = step % 2 ? 1 : -1;
    for (let i = 0; i < sliceCount; i++) {
      const y = ((i + .35) / sliceCount) * h;
      const bh = Math.max(8, h * (.035 + (i % 2) * .022));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, w, bh);
      ctx.clip();
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = .32 + amount * .18;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, y, w, bh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = .42 + amount * .18;
      ctx.filter = 'invert(1) contrast(1.5)';
      ctx.drawImage(sourceCanvas, phase * (10 + amount * 28), 0, w, h);
      ctx.restore();
    }
  }

  function render(now) {
    requestAnimationFrame(render);
    if (!active.size) return;

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
  observer.observe(grid, { childList: true });

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
    syncButtons();
  });
  document.getElementById('resetControlsBtn')?.addEventListener('click', () => {
    active.clear();
    held.clear();
    syncButtons();
  });

  ensureButtons();
  ensureHelp();
  ensureWarning();
  requestAnimationFrame(render);
})();
