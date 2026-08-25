/* DISTORTION per-clip trim controls — 2026-08-25
   Non-destructive IN/OUT points live directly under each uploaded clip card. */
(() => {
  'use strict';

  const sourceVideo = document.getElementById('sourceVideo');
  const chromaVideo = document.getElementById('chromaVideo');
  const videoInput = document.getElementById('videoInput');
  const videoLibrary = document.getElementById('videoLibrary');
  const chromaSelect = document.getElementById('chromaVideoSelect');
  const timelineWrap = document.querySelector('.timeline-wrap');
  const timeline = document.getElementById('timelineCanvas');
  const hoverTime = document.getElementById('hoverTime');
  const hoverPlayToggle = document.getElementById('hoverPlayToggle');
  const statusText = document.getElementById('statusText');

  if (!sourceVideo || !videoInput || !videoLibrary) return;

  const trims = new Map();
  const MIN_GAP = 0.08;
  let updatingLibrary = false;

  function status(text) {
    if (statusText) statusText.textContent = String(text).toUpperCase();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function format(seconds) {
    if (!Number.isFinite(seconds)) return '00:00.00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  function itemCount() {
    return videoLibrary.querySelectorAll('.video-item').length;
  }

  function activeIndex() {
    return [...videoLibrary.querySelectorAll('.video-item')].findIndex(item => item.classList.contains('active'));
  }

  function topIndex() {
    const value = chromaSelect?.value;
    return value === '' || value == null ? -1 : Number(value);
  }

  function ensureTrim(index, duration) {
    if (index < 0 || !Number.isFinite(duration) || duration <= 0) return null;
    let trim = trims.get(index);
    if (!trim) {
      trim = { in: 0, out: duration, duration };
      trims.set(index, trim);
    } else {
      trim.duration = duration;
      trim.in = clamp(trim.in, 0, Math.max(0, duration - MIN_GAP));
      trim.out = clamp(trim.out, trim.in + MIN_GAP, duration);
    }
    return trim;
  }

  function trimFor(index, fallbackDuration = 0) {
    const existing = trims.get(index);
    if (existing) return existing;
    return ensureTrim(index, fallbackDuration);
  }

  function syncMediaToTrim(media, index, forceStart = false) {
    if (!media || index < 0 || !Number.isFinite(media.duration) || media.duration <= 0) return;
    const trim = ensureTrim(index, media.duration);
    if (!trim) return;
    if (forceStart || media.currentTime < trim.in - 0.02 || media.currentTime >= trim.out - 0.015) {
      try { media.currentTime = trim.in; } catch {}
    }
  }

  function enforceLoop(media, index) {
    if (!media || media.readyState < 1 || index < 0) return;
    const trim = trimFor(index, media.duration);
    if (!trim) return;
    if (media.currentTime < trim.in - 0.035 || media.currentTime >= trim.out - 0.018) {
      const shouldPlay = !media.paused;
      try { media.currentTime = trim.in; } catch {}
      if (shouldPlay) media.play().catch(() => {});
    }
  }

  function updateTrimUI(index) {
    const trim = trims.get(index);
    const panel = videoLibrary.querySelector(`.clip-trim-strip[data-trim-index="${index}"]`);
    if (!trim || !panel) return;
    const inRange = panel.querySelector('[data-trim-range="in"]');
    const outRange = panel.querySelector('[data-trim-range="out"]');
    const readout = panel.querySelector('.clip-trim-readout');
    const usable = Math.max(0, trim.out - trim.in);

    [inRange, outRange].forEach(range => {
      range.max = String(trim.duration);
      range.step = trim.duration > 120 ? '0.1' : '0.05';
      range.disabled = !(trim.duration > MIN_GAP);
    });
    inRange.value = String(trim.in);
    outRange.value = String(trim.out);
    readout.textContent = `${format(trim.in)} → ${format(trim.out)} · ${format(usable)}`;

    panel.style.setProperty('--trim-in', `${(trim.in / trim.duration) * 100}%`);
    panel.style.setProperty('--trim-out', `${(trim.out / trim.duration) * 100}%`);
    updateTimelineOverlay();
  }

  function applyTrim(index, edge, rawValue, announce = true) {
    const panel = videoLibrary.querySelector(`.clip-trim-strip[data-trim-index="${index}"]`);
    const duration = trims.get(index)?.duration || Number(panel?.dataset.duration) || 0;
    const trim = ensureTrim(index, duration);
    if (!trim) return;
    const value = clamp(Number(rawValue) || 0, 0, trim.duration);

    if (edge === 'in') trim.in = Math.min(value, trim.out - MIN_GAP);
    else trim.out = Math.max(value, trim.in + MIN_GAP);

    updateTrimUI(index);

    if (index === activeIndex()) {
      if (sourceVideo.currentTime < trim.in || sourceVideo.currentTime >= trim.out) sourceVideo.currentTime = trim.in;
    }
    if (index === topIndex() && chromaVideo) {
      if (chromaVideo.currentTime < trim.in || chromaVideo.currentTime >= trim.out) chromaVideo.currentTime = trim.in;
    }
    if (announce) status(`clip ${edge.toUpperCase()} set to ${format(edge === 'in' ? trim.in : trim.out)}`);
  }

  function setEdgeFromPlayhead(index, edge) {
    let media = null;
    if (index === activeIndex()) media = sourceVideo;
    else if (index === topIndex()) media = chromaVideo;
    if (!media || !Number.isFinite(media.currentTime)) {
      status('select this clip first, then set the trim from the playhead');
      return;
    }
    applyTrim(index, edge, media.currentTime);
  }

  function resetTrim(index) {
    const trim = trims.get(index);
    if (!trim) return;
    trim.in = 0;
    trim.out = trim.duration;
    updateTrimUI(index);
    if (index === activeIndex()) sourceVideo.currentTime = 0;
    if (index === topIndex() && chromaVideo) chromaVideo.currentTime = 0;
    status('clip trim reset');
  }

  function buildTrimStrip(index, item) {
    if (item.parentElement?.classList.contains('clip-trim-card')) return;

    const card = document.createElement('div');
    card.className = 'clip-trim-card';
    card.dataset.trimCardIndex = String(index);
    item.before(card);
    card.appendChild(item);

    const strip = document.createElement('div');
    strip.className = 'clip-trim-strip';
    strip.dataset.trimIndex = String(index);
    strip.innerHTML = `
      <div class="clip-trim-head"><strong>TRIM</strong><span class="clip-trim-readout">LOADING…</span></div>
      <label class="clip-trim-row"><span>IN</span><input data-trim-range="in" type="range" min="0" max="1" step="0.05" value="0" disabled></label>
      <label class="clip-trim-row"><span>OUT</span><input data-trim-range="out" type="range" min="0" max="1" step="0.05" value="1" disabled></label>
      <div class="clip-trim-actions">
        <button type="button" data-trim-action="in">SET IN</button>
        <button type="button" data-trim-action="out">SET OUT</button>
        <button type="button" data-trim-action="reset">RESET</button>
      </div>`;
    card.appendChild(strip);

    strip.addEventListener('click', event => event.stopPropagation());
    strip.addEventListener('pointerdown', event => event.stopPropagation());

    strip.querySelector('[data-trim-range="in"]').addEventListener('input', event => applyTrim(index, 'in', event.target.value, false));
    strip.querySelector('[data-trim-range="out"]').addEventListener('input', event => applyTrim(index, 'out', event.target.value, false));
    strip.querySelector('[data-trim-range="in"]').addEventListener('change', event => applyTrim(index, 'in', event.target.value, true));
    strip.querySelector('[data-trim-range="out"]').addEventListener('change', event => applyTrim(index, 'out', event.target.value, true));
    strip.querySelector('[data-trim-action="in"]').addEventListener('click', () => setEdgeFromPlayhead(index, 'in'));
    strip.querySelector('[data-trim-action="out"]').addEventListener('click', () => setEdgeFromPlayhead(index, 'out'));
    strip.querySelector('[data-trim-action="reset"]').addEventListener('click', () => resetTrim(index));

    const known = trims.get(index);
    if (known) updateTrimUI(index);
  }

  function patchLibrary() {
    if (updatingLibrary) return;
    updatingLibrary = true;
    const items = [...videoLibrary.querySelectorAll('.video-item')];
    items.forEach((item, index) => buildTrimStrip(index, item));
    updatingLibrary = false;
  }

  function probeFiles(files) {
    const list = [...files];
    if (!list.length) return;
    queueMicrotask(() => {
      const total = itemCount();
      const baseIndex = Math.max(0, total - list.length);
      list.forEach((file, offset) => {
        const index = baseIndex + offset;
        const probe = document.createElement('video');
        const url = URL.createObjectURL(file);
        probe.preload = 'metadata';
        probe.muted = true;
        const cleanup = () => URL.revokeObjectURL(url);
        probe.addEventListener('loadedmetadata', () => {
          ensureTrim(index, probe.duration);
          patchLibrary();
          updateTrimUI(index);
          cleanup();
        }, { once: true });
        probe.addEventListener('error', cleanup, { once: true });
        probe.src = url;
      });
    });
  }

  function ensureTimelineOverlay() {
    if (!timelineWrap || timelineWrap.querySelector('.clip-trim-timeline')) return;
    const overlay = document.createElement('div');
    overlay.className = 'clip-trim-timeline';
    overlay.innerHTML = '<i class="trim-cut trim-cut-left"></i><i class="trim-cut trim-cut-right"></i><b class="trim-bound trim-bound-in">IN</b><b class="trim-bound trim-bound-out">OUT</b>';
    timelineWrap.appendChild(overlay);
  }

  function updateTimelineOverlay() {
    ensureTimelineOverlay();
    const overlay = timelineWrap?.querySelector('.clip-trim-timeline');
    if (!overlay) return;
    const index = activeIndex();
    const trim = trims.get(index);
    if (!trim || !trim.duration) {
      overlay.classList.remove('visible');
      return;
    }
    const left = clamp(trim.in / trim.duration * 100, 0, 100);
    const right = clamp(trim.out / trim.duration * 100, 0, 100);
    overlay.style.setProperty('--trim-left', `${left}%`);
    overlay.style.setProperty('--trim-right', `${right}%`);
    overlay.classList.toggle('visible', left > 0.01 || right < 99.99);
  }

  function patchHelp() {
    const quick = document.querySelector('[data-help="quick"] ol');
    if (quick && !quick.querySelector('[data-trim-help]')) {
      const li = document.createElement('li');
      li.dataset.trimHelp = 'true';
      li.textContent = 'Trim intros or outros directly under any uploaded clip: drag its IN / OUT controls, or play to a point and press Set In / Set Out.';
      quick.insertBefore(li, quick.children[3] || null);
    }
    const framing = document.querySelector('[data-help="framing"]');
    if (framing && !framing.querySelector('[data-trim-help]')) {
      const note = document.createElement('div');
      note.className = 'help-callout';
      note.dataset.trimHelp = 'true';
      note.textContent = 'Clip trimming is non-destructive. IN / OUT points live under each Media clip card, apply anywhere that clip is used, and the shaded timeline areas show what will be skipped.';
      framing.appendChild(note);
    }
  }

  function installStyles() {
    if (document.getElementById('distortion-clip-trim-style')) return;
    const style = document.createElement('style');
    style.id = 'distortion-clip-trim-style';
    style.textContent = `
      .clip-trim-card{display:grid;gap:0;border:1px solid transparent;background:#090d10}
      .clip-trim-card>.video-item{width:100%;border-bottom-left-radius:0;border-bottom-right-radius:0}
      .clip-trim-card:has(.video-item.active){border-color:var(--accent)}
      .clip-trim-card:has(.video-item.active)>.video-item{border-color:transparent;border-bottom:1px solid color-mix(in srgb,var(--accent) 45%,transparent)}
      .clip-trim-strip{padding:6px;background:#080c0f;border:1px solid #303940;border-top:0;--trim-in:0%;--trim-out:100%}
      .clip-trim-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:4px;color:var(--muted);font-size:8px;letter-spacing:.08em}
      .clip-trim-head strong{color:var(--accent);font-size:9px}
      .clip-trim-readout{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .clip-trim-row{display:grid;grid-template-columns:24px 1fr;gap:5px;align-items:center;margin:2px 0;font-size:8px;color:var(--muted)}
      .clip-trim-row input{margin:0;width:100%;height:12px;accent-color:var(--accent)}
      .clip-trim-actions{display:grid;grid-template-columns:1fr 1fr auto;gap:4px;margin-top:5px}
      .clip-trim-actions button{min-height:24px;padding:3px 5px;background:#10161a;color:var(--text);border:1px solid #39464e;font-size:8px;letter-spacing:.06em}
      .clip-trim-actions button:hover{border-color:var(--accent);color:var(--accent)}
      .clip-trim-timeline{position:absolute;left:0;right:0;top:31px;height:96px;z-index:4;pointer-events:none;display:none;overflow:hidden}
      .clip-trim-timeline.visible{display:block}
      .trim-cut{position:absolute;top:0;bottom:0;background:rgba(0,0,0,.62);background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 5px,transparent 5px 10px)}
      .trim-cut-left{left:0;width:var(--trim-left)}
      .trim-cut-right{left:var(--trim-right);right:0}
      .trim-bound{position:absolute;top:4px;transform:translateX(-50%);padding:2px 4px;background:#00170e;color:var(--accent);border:1px solid var(--accent);font-size:8px;line-height:1}
      .trim-bound-in{left:var(--trim-left)}
      .trim-bound-out{left:var(--trim-right)}
      @media(max-width:760px){.clip-trim-actions{grid-template-columns:1fr 1fr 1fr}.clip-trim-timeline{top:52px}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  videoInput.addEventListener('change', event => probeFiles(event.target.files));

  sourceVideo.addEventListener('loadedmetadata', () => {
    const index = activeIndex();
    ensureTrim(index, sourceVideo.duration);
    setTimeout(() => {
      syncMediaToTrim(sourceVideo, activeIndex(), true);
      updateTrimUI(activeIndex());
      updateTimelineOverlay();
    }, 0);
  });
  sourceVideo.addEventListener('timeupdate', () => {
    enforceLoop(sourceVideo, activeIndex());
    updateTimelineOverlay();
  });
  sourceVideo.addEventListener('ended', () => setTimeout(() => syncMediaToTrim(sourceVideo, activeIndex(), true), 0));

  if (chromaVideo) {
    chromaVideo.addEventListener('loadedmetadata', () => setTimeout(() => syncMediaToTrim(chromaVideo, topIndex(), true), 0));
    chromaVideo.addEventListener('timeupdate', () => enforceLoop(chromaVideo, topIndex()));
    chromaVideo.addEventListener('ended', () => setTimeout(() => syncMediaToTrim(chromaVideo, topIndex(), true), 0));
  }

  document.getElementById('chromaRestartBtn')?.addEventListener('click', () => setTimeout(() => syncMediaToTrim(chromaVideo, topIndex(), true), 0));

  if (timeline) {
    timeline.addEventListener('pointermove', () => updateTimelineOverlay());
    timeline.addEventListener('click', () => setTimeout(() => enforceLoop(sourceVideo, activeIndex()), 0));
  }

  const observer = new MutationObserver(() => {
    patchLibrary();
    updateTimelineOverlay();
  });
  observer.observe(videoLibrary, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  installStyles();
  ensureTimelineOverlay();
  patchLibrary();
  patchHelp();
  window.addEventListener('resize', updateTimelineOverlay);
})();
