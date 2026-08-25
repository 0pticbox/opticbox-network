/* DISTORTION extra negative-strobe keys — 2026-08-25
   Adds two related negative-flash variants on 0 and period.
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
    button.innerHTML = `<strong>${info.name}</strong><span>${info.key}</span>`;

    // Give period its own colder visual identity in the bank.
    if (id === 'void') {
      button.style.borderColor = '#756dff';
      button.style.background = 'linear-gradient(135deg, rgba(42,34,92,.52), rgba(16,26,38,.92))';
    }

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

    // Snappier than the first version, but still deliberately paced instead of
    // turning into a continuous high-frequency full-screen flash.
    const step = Math.floor(now / (235 - amount * 25));
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

    const shift = 5 + amount * 18;
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      const bandSlot = h / bands;
      const bh = Math.max(3, bandSlot * .16);
      const y = Math.max(0, Math.min(h - bh, i * bandSlot + bandSlot * .38));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, w, bh);
      ctx.clip();
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = .2 + amount * .15;
      const dx = i % 2 ? shift : -shift;
      ctx.drawImage(sourceCanvas, dx, 0, w, h);
      ctx.restore();
    }
  }

  function drawVoid(amount, now) {
    const w = canvas.width;
    const h = canvas.height;

    // Faster response than v1, with a colder cyan/violet negative tint.
    const step = Math.floor(now / (255 - amount * 30));
    const hit = step % 3 !== 1;
    const hue = 185 + (step % 4) * 13;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = hit
      ? `invert(1) sepia(.32) saturate(${1.8 + amount * 1.5}) hue-rotate(${hue}deg) contrast(${1.35 + amount * .7}) brightness(${.78 + amount * .1})`
      : `saturate(${1.05 + amount * .35}) hue-rotate(${hue * .35}deg) brightness(${.86 + amount * .08}) contrast(${1.06 + amount * .25})`;
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    ctx.restore();

    if (!hit) return;

    // Many thin in-frame scan slices instead of a handful of chunky rectangles.
    const sliceCount = 16 + Math.floor(amount * 8);
    const phase = step % 2 ? 1 : -1;
    const maxShift = 4 + amount * 12;

    for (let i = 0; i < sliceCount; i++) {
      const slot = h / sliceCount;
      const bh = Math.max(2, Math.min(6, slot * (.15 + (i % 3) * .035)));
      const rawY = i * slot + slot * (.2 + ((i * 7 + step) % 5) * .1);
      const y = Math.max(0, Math.min(h - bh, rawY));
      const dx = phase * maxShift * ((i % 4) / 3);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, w, bh);
      ctx.clip();

      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .18 + amount * .16;
      ctx.filter = `invert(1) sepia(1) saturate(${3 + amount * 2.5}) hue-rotate(${190 + i * 7}deg) contrast(1.35)`;
      ctx.drawImage(sourceCanvas, dx, 0, w, h);

      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = .12 + amount * .11;
      ctx.fillStyle = i % 2 ? '#b6f3ff' : '#b8a8ff';
      ctx.fillRect(0, y, w, bh);
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
