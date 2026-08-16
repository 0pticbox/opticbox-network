(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('outputCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const sourceVideo = $('sourceVideo');
  const chromaVideo = $('chromaVideo');
  const song = $('song');
  const timeline = $('timelineCanvas');
  const tctx = timeline.getContext('2d');
  const bufferA = document.createElement('canvas');
  const bufferB = document.createElement('canvas');
  const bctxA = bufferA.getContext('2d');
  const bctxB = bufferB.getContext('2d');
  const pixelCanvas = document.createElement('canvas');
  const pctx = pixelCanvas.getContext('2d');
  // Dedicated ping-pong canvases let every numbered effect process the
  // completed result of the previous effect instead of erasing it.
  const fxStackA = document.createElement('canvas');
  const fxStackB = document.createElement('canvas');
  const fxctxA = fxStackA.getContext('2d');
  const fxctxB = fxStackB.getContext('2d');
  // Chroma keying runs on a capped-resolution buffer so two videos and the
  // full distortion stack can keep performing smoothly on typical laptops.
  const chromaSourceCanvas = document.createElement('canvas');
  const chromaKeyCanvas = document.createElement('canvas');
  const chromaSourceCtx = chromaSourceCanvas.getContext('2d', { willReadFrequently: true });
  const chromaKeyCtx = chromaKeyCanvas.getContext('2d');

  const cueKeys = ['q','w','e','r','a','s','d','f','z','x','c','v'];
  // Number row = performance effects. Scene/hot-cue keys stay on Q–V.
  const effects = [
    { id: 'datamosh', name: 'DATAMOSH DRIFT', key: '1' },
    { id: 'mirrorshards', name: 'MIRROR SHARDS', key: '2' },
    { id: 'mirrorgrid', name: 'MIRROR GRID', key: '3' },
    { id: 'crush', name: 'COLOR CRUSH', key: '4' },
    { id: 'splitzoom', name: 'SPLIT ZOOM+', key: '5' },
    { id: 'blocks', name: 'BLOCK DETONATOR', key: '6' },
    { id: 'videotear', name: 'VIDEO TEAR', key: '7' },
    { id: 'invert', name: 'NEGATIVE PULSE+', key: '8' },
    { id: 'colorsurge', name: 'COLOR SURGE', key: '9' },
    { id: 'strobe', name: 'NEGATIVE STROBE', key: '\\' }
  ];
  const fxKeySlots = effects.map(effect => effect.key);
  const defaultFxKeyMap = Object.fromEntries(effects.map(effect => [effect.key, effect.id]));
  const savedCustomFxKeyMap = (() => {
    const blank = Object.fromEntries(fxKeySlots.map(key => [key, '']));
    try {
      const saved = JSON.parse(localStorage.getItem('distortion-custom-fx-map-v1') || '{}');
      fxKeySlots.forEach(key => {
        const id = saved[key];
        blank[key] = effects.some(effect => effect.id === id) ? id : '';
      });
    } catch {}
    return blank;
  })();
  const savedTransitionKeys = (() => {
    try { return JSON.parse(localStorage.getItem('distortion-transition-keys-v2') || '{}'); }
    catch { return {}; }
  })();
  const defaultTransitionKeys = { flash: 't', shake: 'y', zoom: 'u', freeze: 'i', spin: 'o', black: 'p' };
  const transitions = [
    { id: 'flash', name: 'WHITE FLASH', key: savedTransitionKeys.flash || defaultTransitionKeys.flash },
    { id: 'shake', name: 'IMPACT SHAKE', key: savedTransitionKeys.shake || defaultTransitionKeys.shake },
    { id: 'zoom', name: 'ZOOM PUNCH', key: savedTransitionKeys.zoom || defaultTransitionKeys.zoom },
    { id: 'freeze', name: 'FRAME FREEZE', key: savedTransitionKeys.freeze || defaultTransitionKeys.freeze },
    { id: 'spin', name: 'SPIN CUT', key: savedTransitionKeys.spin || defaultTransitionKeys.spin },
    { id: 'black', name: 'BLACK DROP', key: savedTransitionKeys.black || defaultTransitionKeys.black }
  ];
  const savedDefaultTransition = (() => {
    try {
      const value = localStorage.getItem('distortion-default-transition') || 'flash';
      return value === 'none' || transitions.some(tr => tr.id === value) ? value : 'flash';
    } catch { return 'flash'; }
  })();


  // Container/codec choices are detected at runtime so unsupported formats
  // never appear in the recording menu.
  const recordingFormatCatalog = [
    {
      id: 'mp4-h264',
      label: 'MP4 — H.264 / AAC',
      extension: 'mp4',
      candidates: [
        'video/mp4;codecs=avc1.640028,mp4a.40.2',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4'
      ]
    },
    {
      id: 'webm-vp9',
      label: 'WEBM — VP9 / OPUS',
      extension: 'webm',
      candidates: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9']
    },
    {
      id: 'webm-vp8',
      label: 'WEBM — VP8 / OPUS',
      extension: 'webm',
      candidates: ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8']
    },
    {
      id: 'webm-default',
      label: 'WEBM — BROWSER DEFAULT',
      extension: 'webm',
      candidates: ['video/webm']
    }
  ];

  const recordingQualityProfiles = {
    maximum: { label: 'maximum quality', videoBitsPerSecond: 80000000, audioBitsPerSecond: 320000 },
    high: { label: 'high quality', videoBitsPerSecond: 40000000, audioBitsPerSecond: 256000 },
    standard: { label: 'standard quality', videoBitsPerSecond: 16000000, audioBitsPerSecond: 192000 }
  };

  let supportedRecordingFormats = [];

  const state = {
    videos: [],
    activeVideoIndex: -1,
    cues: Object.fromEntries(cueKeys.map(k => [k, null])),
    activeEffects: new Set(),
    heldEffects: new Set(),
    fxKeyMap: { ...defaultFxKeyMap },
    fxMapMode: 'default',
    armedCue: null,
    fxMode: 'hold',
    master: 0.45,
    audioReact: 0.35,
    transitionDuration: 0.16,
    transitionStrength: 0.85,
    defaultTransitionId: savedDefaultTransition,
    transition: null,
    hoverWasPlaying: false,
    baseFraming: new Map(),
    topFraming: new Map(),
    framingTarget: 'base',
    draggingFrame: false,
    frameDragStartX: 0,
    frameDragStartY: 0,
    frameDragOriginX: 0,
    frameDragOriginY: 0,
    logo: null,
    logoX: 0.82,
    logoY: 0.84,
    logoScale: 0.2,
    logoOpacity: 0.9,
    logoVisible: true,
    logoAffected: false,
    chromaVideoIndex: -1,
    chromaVisible: true,
    chromaKeyEnabled: true,
    chromaSync: true,
    chromaColor: '#00ff00',
    chromaTolerance: 0.18,
    chromaSoftness: 0.12,
    chromaSpill: 0.7,
    chromaOpacity: 1,
    chromaPicking: false,
    chromaDirty: true,
    chromaLastProcess: 0,
    draggingLogo: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    recorder: null,
    recordedChunks: [],
    recordStartedAt: 0,
    recordTimer: null,
    audioContext: null,
    songSource: null,
    analyser: null,
    audioDest: null,
    audioLevel: 0,
    freezeFrame: false,
    loopTimers: new Map(),
    channel: null,
    detachedWindow: null,
    lastFrameTime: performance.now(),
    feedbackReady: false,
    moshSeed: 1,
    moshNextAt: 0,
    moshSlices: []
  };

  function setStatus(text) {
    $('statusText').textContent = text.toUpperCase();
    if (state.channel) state.channel.postMessage({ type: 'status', text });
  }

  function firstSupportedMime(candidates) {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function setupRecordingFormatMenu() {
    const select = $('recordFormatSelect');
    const qualitySelect = $('recordQualitySelect');
    if (!select || !qualitySelect) return;

    select.innerHTML = '';
    supportedRecordingFormats = recordingFormatCatalog
      .map(format => ({ ...format, mimeType: firstSupportedMime(format.candidates) }))
      .filter(format => format.mimeType);

    if (!window.MediaRecorder) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'RECORDING NOT SUPPORTED';
      select.appendChild(option);
      select.disabled = true;
      qualitySelect.disabled = true;
      $('recordBtn').disabled = true;
      $('recordFormatNote').textContent = 'This browser does not expose MediaRecorder.';
      return;
    }

    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = 'AUTO — BEST AVAILABLE';
    select.appendChild(auto);

    supportedRecordingFormats.forEach(format => {
      const option = document.createElement('option');
      option.value = format.id;
      option.textContent = format.label;
      select.appendChild(option);
    });

    let savedFormat = 'auto';
    let savedQuality = 'maximum';
    try {
      savedFormat = localStorage.getItem('distortion-record-format') || 'auto';
      savedQuality = localStorage.getItem('distortion-record-quality') || 'maximum';
    } catch {}
    select.value = [...select.options].some(option => option.value === savedFormat) ? savedFormat : 'auto';
    qualitySelect.value = Object.hasOwn(recordingQualityProfiles, savedQuality) ? savedQuality : 'maximum';
    updateRecordingFormatNote();
  }

  function selectedRecordingFormat() {
    const requested = $('recordFormatSelect')?.value || 'auto';
    if (requested !== 'auto') {
      const exact = supportedRecordingFormats.find(format => format.id === requested);
      if (exact) return exact;
    }
    return supportedRecordingFormats.find(format => format.id === 'mp4-h264')
      || supportedRecordingFormats.find(format => format.id === 'webm-vp9')
      || supportedRecordingFormats[0]
      || { id: 'browser-default', label: 'BROWSER DEFAULT', extension: 'webm', mimeType: '' };
  }

  function updateRecordingFormatNote() {
    const note = $('recordFormatNote');
    if (!note) return;
    const format = selectedRecordingFormat();
    const quality = recordingQualityProfiles[$('recordQualitySelect')?.value] || recordingQualityProfiles.maximum;
    const mbps = Math.round(quality.videoBitsPerSecond / 1000000);
    const resolution = `${canvas.width}×${canvas.height}`;
    note.textContent = `${format.label} · ${resolution} · 60 FPS · target ${mbps} Mbps video / ${Math.round(quality.audioBitsPerSecond / 1000)} kbps audio`;
  }

  function setRecordingControlsDisabled(disabled) {
    ['recordFormatSelect','recordQualitySelect','aspectSelect'].forEach(id => {
      const control = $(id);
      if (control) control.disabled = disabled;
    });
  }


  const themeNames = {
    studio: 'STUDIO',
    acid: 'ACID BUNKER',
    punk: 'PUNK DISTRICT',
    corrupted: 'CORRUPTED SIGNAL'
  };

  const legacyThemeMap = { magenta: 'punk', ice: 'studio' };

  function applyTheme(theme, announce = false) {
    const migratedTheme = legacyThemeMap[theme] || theme;
    const safeTheme = Object.hasOwn(themeNames, migratedTheme) ? migratedTheme : 'studio';
    document.documentElement.dataset.theme = safeTheme;
    $('themeSelect').value = safeTheme;
    try { localStorage.setItem('distortion-theme', safeTheme); } catch {}
    if (announce) setStatus(`theme changed: ${themeNames[safeTheme]}`);
  }

  function activateControlWindow(controlWindow, target, announce = false) {
    const buttons = [...controlWindow.querySelectorAll('[data-panel-target]')];
    const pages = [...controlWindow.querySelectorAll('[data-panel-page]')];
    const validTargets = new Set(pages.map(page => page.dataset.panelPage));
    const fallback = controlWindow.dataset.defaultPanel || buttons[0]?.dataset.panelTarget;
    const safeTarget = validTargets.has(target) ? target : fallback;
    if (!safeTarget) return;

    buttons.forEach(button => {
      const selected = button.dataset.panelTarget === safeTarget;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    pages.forEach(page => page.classList.toggle('active', page.dataset.panelPage === safeTarget));
    controlWindow.dataset.activePanel = safeTarget;
    if (controlWindow.dataset.controlWindow === 'source') updateFramingUI();
    try { localStorage.setItem(`distortion-control-window-${controlWindow.dataset.controlWindow}`, safeTarget); } catch {}
    if (announce) setStatus(`${safeTarget} control window open`);
    requestAnimationFrame(rebuildTimeline);
  }

  function initControlWindows() {
    document.querySelectorAll('[data-control-window]').forEach(controlWindow => {
      let initial = controlWindow.dataset.defaultPanel;
      try { initial = localStorage.getItem(`distortion-control-window-${controlWindow.dataset.controlWindow}`) || initial; } catch {}
      activateControlWindow(controlWindow, initial);
      controlWindow.querySelectorAll('[data-panel-target]').forEach(button => {
        button.addEventListener('click', () => activateControlWindow(controlWindow, button.dataset.panelTarget, true));
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          const buttons = [...controlWindow.querySelectorAll('[data-panel-target]')];
          const index = buttons.indexOf(button);
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const next = buttons[(index + direction + buttons.length) % buttons.length];
          activateControlWindow(controlWindow, next.dataset.panelTarget, true);
          next.focus();
        });
      });
    });
  }

  function formatTime(seconds, ms = false) {
    if (!Number.isFinite(seconds)) return ms ? '00:00.000' : '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${ms ? '.' + String(millis).padStart(3,'0') : ''}`;
  }

  function activeVideoRecord() {
    return state.videos[state.activeVideoIndex] || null;
  }

  function safePlay(media) {
    const p = media.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function setupAudioGraph() {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 256;
      state.audioDest = state.audioContext.createMediaStreamDestination();
      state.songSource = state.audioContext.createMediaElementSource(song);
      state.songSource.connect(state.analyser);
      state.analyser.connect(state.audioContext.destination);
      state.analyser.connect(state.audioDest);
    }
    if (state.audioContext.state === 'suspended') state.audioContext.resume();
  }

  function updateAudioLevel() {
    if (!state.analyser) { state.audioLevel *= 0.9; return; }
    const data = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    state.audioLevel = (sum / data.length) / 255;
  }

  function setCanvasAspect(aspect) {
    const dims = aspect === '9:16' ? [720,1280] : aspect === '1:1' ? [1080,1080] : [1280,720];
    canvas.width = dims[0]; canvas.height = dims[1];
    bufferA.width = dims[0]; bufferA.height = dims[1];
    bufferB.width = dims[0]; bufferB.height = dims[1];
    fxStackA.width = dims[0]; fxStackA.height = dims[1];
    fxStackB.width = dims[0]; fxStackB.height = dims[1];
    const chromaScale = Math.min(1, 640 / Math.max(dims[0], dims[1]));
    chromaSourceCanvas.width = Math.max(1, Math.round(dims[0] * chromaScale));
    chromaSourceCanvas.height = Math.max(1, Math.round(dims[1] * chromaScale));
    chromaKeyCanvas.width = chromaSourceCanvas.width;
    chromaKeyCanvas.height = chromaSourceCanvas.height;
    state.chromaDirty = true;
    state.feedbackReady = false;
    if ($('recordFormatNote')) updateRecordingFormatNote();
  }

  function drawCover(targetCtx, media, w, h, dx = 0, dy = 0, scale = 1, rotation = 0, panX = 0, panY = 0) {
    const sw = media.videoWidth || media.naturalWidth || w;
    const sh = media.videoHeight || media.naturalHeight || h;
    if (!sw || !sh) return;
    const sourceRatio = sw / sh;
    const targetRatio = w / h;
    let dw, dh;
    if (sourceRatio > targetRatio) { dh = h * scale; dw = dh * sourceRatio; }
    else { dw = w * scale; dh = dw / sourceRatio; }
    const maxPanX = Math.max(0, (dw - w) / 2);
    const maxPanY = Math.max(0, (dh - h) / 2);
    targetCtx.save();
    targetCtx.translate(w / 2 + dx + panX * maxPanX, h / 2 + dy + panY * maxPanY);
    targetCtx.rotate(rotation);
    targetCtx.drawImage(media, -dw / 2, -dh / 2, dw, dh);
    targetCtx.restore();
  }

  function framingVideoIndex(target = state.framingTarget) {
    return target === 'top' ? state.chromaVideoIndex : state.activeVideoIndex;
  }

  function framingMap(target = state.framingTarget) {
    return target === 'top' ? state.topFraming : state.baseFraming;
  }

  function getFraming(target = state.framingTarget, create = true) {
    const index = framingVideoIndex(target);
    if (index < 0 || !state.videos[index]) return null;
    const map = framingMap(target);
    if (!map.has(index) && create) map.set(index, { zoom: 1, x: 0, y: 0 });
    return map.get(index) || null;
  }

  function updateFramingUI() {
    const target = state.framingTarget;
    const index = framingVideoIndex(target);
    const record = state.videos[index];
    const frame = getFraming(target);
    const hasVideo = Boolean(record && frame);
    const topOption = $('framingTarget').querySelector('option[value="top"]');
    if (topOption) topOption.disabled = state.chromaVideoIndex < 0;
    $('framingTarget').value = target;
    $('framingStatus').textContent = hasVideo
      ? `${target === 'top' ? 'TOP CHROMA' : 'BASE'}: ${record.name}`
      : `${target === 'top' ? 'TOP CHROMA VIDEO' : 'BASE VIDEO'} — LOAD A CLIP`;
    ['frameZoom','frameX','frameY','frameResetBtn'].forEach(id => { $(id).disabled = !hasVideo; });
    const safeFrame = frame || { zoom: 1, x: 0, y: 0 };
    $('frameZoom').value = safeFrame.zoom;
    $('frameX').value = safeFrame.x;
    $('frameY').value = safeFrame.y;
    $('frameZoomValue').textContent = `${safeFrame.zoom.toFixed(2)}×`;
    $('frameXValue').textContent = `${Math.round(safeFrame.x * 100)}%`;
    $('frameYValue').textContent = `${Math.round(safeFrame.y * 100)}%`;
    canvas.classList.toggle('frame-drag-ready', hasVideo && document.querySelector('[data-control-window="source"]')?.dataset.activePanel === 'frame');
  }

  function isFramePanelActive() {
    return document.querySelector('[data-control-window="source"]')?.dataset.activePanel === 'frame';
  }

  function hexToRgb(hex) {
    const clean = String(hex || '#00ff00').replace('#', '');
    const value = Number.parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
    if (!Number.isFinite(value)) return { r: 0, g: 255, b: 0 };
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
  }

  function smoothstep(edge0, edge1, value) {
    const width = Math.max(0.0001, edge1 - edge0);
    const t = Math.max(0, Math.min(1, (value - edge0) / width));
    return t * t * (3 - 2 * t);
  }

  function drawChromaLayer(targetCtx, w, h, dx, dy, scale, rotation, now) {
    if (!state.chromaVisible || state.chromaVideoIndex < 0 || chromaVideo.readyState < 2) return;
    const frame = getFraming('top') || { zoom: 1, x: 0, y: 0 };

    if (!state.chromaKeyEnabled) {
      targetCtx.save();
      targetCtx.globalAlpha = state.chromaOpacity;
      drawCover(targetCtx, chromaVideo, w, h, dx, dy, scale * frame.zoom, rotation, frame.x, frame.y);
      targetCtx.restore();
      return;
    }

    // Refresh the keyed buffer at video cadence, or immediately after any
    // chroma control changes. It is then upscaled into the full-resolution mix.
    if (state.chromaDirty || now - state.chromaLastProcess >= 33) {
      const cw = chromaSourceCanvas.width;
      const ch = chromaSourceCanvas.height;
      const sx = cw / w;
      const sy = ch / h;
      chromaSourceCtx.clearRect(0, 0, cw, ch);
      drawCover(chromaSourceCtx, chromaVideo, cw, ch, dx * sx, dy * sy, scale * frame.zoom, rotation, frame.x, frame.y);

      try {
        const frame = chromaSourceCtx.getImageData(0, 0, cw, ch);
        const pixels = frame.data;
        const key = hexToRgb(state.chromaColor);
        const keySum = Math.max(1, key.r + key.g + key.b);
        const kr = key.r / keySum;
        const kg = key.g / keySum;
        const kb = key.b / keySum;
        const dominant = key.g >= key.r && key.g >= key.b ? 1 : key.b >= key.r ? 2 : 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const sum = Math.max(1, r + g + b);
          const dr = r / sum - kr;
          const dg = g / sum - kg;
          const db = b / sum - kb;
          const colorDistance = Math.sqrt(dr * dr + dg * dg + db * db);
          const keep = smoothstep(state.chromaTolerance, state.chromaTolerance + state.chromaSoftness, colorDistance);
          const spillAmount = state.chromaSpill * (1 - keep);

          if (spillAmount > 0) {
            const dominantValue = pixels[i + dominant];
            const otherA = pixels[i + ((dominant + 1) % 3)];
            const otherB = pixels[i + ((dominant + 2) % 3)];
            const neutral = Math.max(otherA, otherB);
            if (dominantValue > neutral) pixels[i + dominant] = dominantValue - (dominantValue - neutral) * spillAmount;
          }
          pixels[i + 3] = Math.round(pixels[i + 3] * keep * state.chromaOpacity);
        }
        chromaKeyCtx.putImageData(frame, 0, 0);
        state.chromaDirty = false;
        state.chromaLastProcess = now;
      } catch (error) {
        console.warn('Chroma frame could not be processed.', error);
        state.chromaKeyEnabled = false;
        $('chromaKeyEnabled').checked = false;
        setStatus('chroma key unavailable for this video — showing full top layer');
      }
    }

    targetCtx.drawImage(chromaKeyCanvas, 0, 0, w, h);
  }

  function drawLogo(targetCtx) {
    if (!state.logo || !state.logoVisible) return;
    const maxW = canvas.width * state.logoScale;
    const ratio = state.logo.naturalWidth / state.logo.naturalHeight || 1;
    const w = maxW;
    const h = w / ratio;
    const x = state.logoX * canvas.width - w / 2;
    const y = state.logoY * canvas.height - h / 2;
    targetCtx.save();
    targetCtx.globalAlpha = state.logoOpacity;
    targetCtx.drawImage(state.logo, x, y, w, h);
    targetCtx.restore();
  }

  function applyLiquid(src, out, amount, time) {
    out.clearRect(0,0,canvas.width,canvas.height);
    const slice = Math.max(3, Math.floor(canvas.height / 90));
    for (let y = 0; y < canvas.height; y += slice) {
      const dx = Math.sin(y * 0.035 + time * 0.004) * 28 * amount;
      out.drawImage(src, 0, y, canvas.width, slice, dx, y, canvas.width, slice);
    }
  }

  function applyGlitch(src, out, amount, time) {
    out.clearRect(0,0,canvas.width,canvas.height);
    out.drawImage(src,0,0);
    const count = Math.floor(6 + amount * 22);
    for (let i=0;i<count;i++) {
      const h = 4 + Math.random() * 35;
      const y = Math.random() * (canvas.height-h);
      const xoff = (Math.random()-.5) * 160 * amount;
      out.drawImage(src, 0,y,canvas.width,h, xoff,y,canvas.width,h);
    }
  }

  function applyKaleido(src, out, amount) {
    out.clearRect(0,0,canvas.width,canvas.height);
    const w = canvas.width, h = canvas.height;
    const zoom = 1 + amount * .35;
    const quadrants = [
      [0,0,false,false],[w/2,0,true,false],[0,h/2,false,true],[w/2,h/2,true,true]
    ];
    for (const [x,y,fx,fy] of quadrants) {
      out.save();
      out.translate(x + w/4, y + h/4);
      out.scale(fx ? -1 : 1, fy ? -1 : 1);
      out.drawImage(src, -w/4*zoom, -h/4*zoom, w/2*zoom, h/2*zoom);
      out.restore();
    }
  }


  function drawMirrorShards(src, target, amount, now) {
    const w = canvas.width, h = canvas.height;
    const shards = 7;
    const pulse = .05 + amount * .22 + Math.sin(now * .006) * .025;
    target.clearRect(0, 0, w, h);
    target.fillStyle = '#000';
    target.fillRect(0, 0, w, h);

    for (let i = 0; i < shards; i++) {
      const left = i * w / shards;
      const right = (i + 1) * w / shards;
      const lean = ((i % 2 ? 1 : -1) * (22 + amount * 72));
      target.save();
      target.beginPath();
      target.moveTo(left - lean, 0);
      target.lineTo(right + lean, 0);
      target.lineTo(right - lean, h);
      target.lineTo(left + lean, h);
      target.closePath();
      target.clip();
      target.translate((left + right) / 2, h / 2);
      target.scale(i % 2 ? -1 : 1, i % 3 === 0 ? -1 : 1);
      target.rotate((i - 3) * .012 * amount);
      const zoom = 1.08 + pulse + (i % 3) * .035;
      target.drawImage(src, -w * zoom / 2, -h * zoom / 2, w * zoom, h * zoom);
      target.restore();
    }

    target.save();
    target.globalCompositeOperation = 'difference';
    target.globalAlpha = .08 + amount * .12;
    target.fillStyle = '#fff';
    for (let i = 1; i < shards; i++) target.fillRect(i * w / shards - 2, 0, 4, h);
    target.restore();
  }

  function drawMirrorHall(src, target, amount, now) {
    const w = canvas.width, h = canvas.height;
    const centerW = w * (.42 - amount * .08);
    const centerH = h * (.56 - amount * .08);
    const drift = Math.sin(now * .0037) * w * .035 * amount;
    target.clearRect(0, 0, w, h);
    target.fillStyle = '#000';
    target.fillRect(0, 0, w, h);

    // Central signal window.
    target.drawImage(src, 0, 0, w, h, (w - centerW) / 2 + drift, (h - centerH) / 2, centerW, centerH);

    // Repeating mirrored walls, ceiling, and floor.
    const layers = 5;
    for (let layer = 0; layer < layers; layer++) {
      const alpha = .58 - layer * .085;
      const sideW = Math.max(22, (w - centerW) / 2 / layers + layer * 5);
      const sideH = Math.max(18, (h - centerH) / 2 / layers + layer * 4);
      const lx = layer * sideW;
      const rx = w - (layer + 1) * sideW;
      const ty = layer * sideH;
      const by = h - (layer + 1) * sideH;
      target.save();
      target.globalAlpha = alpha;

      target.save();
      target.translate(lx + sideW, 0);
      target.scale(-1, 1);
      target.drawImage(src, 0, 0, w, h, 0, 0, sideW, h);
      target.restore();

      target.save();
      target.translate(rx, 0);
      target.scale(-1, 1);
      target.drawImage(src, 0, 0, w, h, -sideW, 0, sideW, h);
      target.restore();

      target.save();
      target.translate(0, ty + sideH);
      target.scale(1, -1);
      target.drawImage(src, 0, 0, w, h, 0, 0, w, sideH);
      target.restore();

      target.save();
      target.translate(0, by);
      target.scale(1, -1);
      target.drawImage(src, 0, 0, w, h, 0, -sideH, w, sideH);
      target.restore();

      target.restore();
    }

    target.save();
    target.globalCompositeOperation = 'screen';
    target.globalAlpha = .08 + amount * .16;
    const echoScale = 1 + .018 + amount * .045;
    target.translate(w / 2, h / 2);
    target.scale(echoScale, echoScale);
    target.drawImage(target.canvas, -w / 2, -h / 2);
    target.restore();
  }

  function drawVideoTear(src, target, amount, now) {
    const w = canvas.width, h = canvas.height;
    const phase = Math.floor(now / 68);

    // Every visible block is sampled from the live video. No solid-color fills.
    const tears = 8 + Math.floor(amount * 15);
    for (let i = 0; i < tears; i++) {
      const bandH = 5 + ((phase * 19 + i * 31) % Math.max(10, Math.floor(h * .11)));
      const y = (phase * 43 + i * 101) % Math.max(1, h - bandH);
      const shift = (((phase + i * 5) % 9) - 4) * (15 + amount * 42);
      const stretch = 1 + ((i % 4) - 1.5) * .025 * amount;
      target.save();
      target.globalAlpha = .62 + (i % 3) * .12;
      target.filter = i % 4 === 0
        ? `invert(${.35 + amount * .45}) contrast(${1.15 + amount * .7}) saturate(${1.2 + amount * 1.5})`
        : `contrast(${1.04 + amount * .4}) saturate(${1.05 + amount * .75})`;
      target.drawImage(src, 0, y, w, bandH, shift, y, w * stretch, bandH + 1);
      target.restore();
    }

    // A diagonal tear made from the video itself rather than a colored slash.
    const slashX = ((phase * 79) % Math.max(1, Math.floor(w * 1.45))) - w * .22;
    const slashW = 26 + amount * 70;
    target.save();
    target.beginPath();
    target.translate(slashX, h / 2);
    target.rotate(-.30);
    target.rect(-slashW / 2, -h, slashW, h * 2);
    target.clip();
    target.rotate(.30);
    target.translate(-slashX, -h / 2);
    target.globalAlpha = .72 + amount * .24;
    target.filter = `invert(${.18 + amount * .55}) hue-rotate(${Math.floor((now * .08) % 360)}deg) contrast(${1.15 + amount})`;
    target.drawImage(src, -w * .045 * amount, 0, w * (1 + .09 * amount), h);
    target.restore();
  }

  function drawColorSurge(src, target, amount, now) {
    const w = canvas.width, h = canvas.height;
    const hue = (now * .075) % 360;
    const pulse = .5 + .5 * Math.sin(now * .009);

    target.save();
    target.globalAlpha = .74 + amount * .24;
    target.filter = `hue-rotate(${hue}deg) saturate(${2.1 + amount * 5.2}) contrast(${1.15 + amount * 1.35}) brightness(${.88 + pulse * .24})`;
    target.drawImage(src, 0, 0, w, h);
    target.restore();

    // Offset color echoes, still derived entirely from the live video.
    const offset = (8 + amount * 34) * Math.sin(now * .013);
    target.save();
    target.globalCompositeOperation = 'screen';
    target.globalAlpha = .18 + amount * .22;
    target.filter = `sepia(1) saturate(${4 + amount * 7}) hue-rotate(${hue + 70}deg)`;
    target.drawImage(src, offset, 0, w, h);
    target.filter = `sepia(1) saturate(${4 + amount * 7}) hue-rotate(${hue + 215}deg)`;
    target.drawImage(src, -offset, 0, w, h);
    target.restore();

    // Thin color bands give it a harder VJ hit without covering the picture.
    target.save();
    target.globalCompositeOperation = 'color';
    target.globalAlpha = .12 + amount * .22;
    for (let i = 0; i < 5; i++) {
      const y = ((phaseSeed(now, i) * h) % h);
      const bh = 5 + ((i * 17 + Math.floor(now / 90)) % 34);
      target.filter = `hue-rotate(${hue + i * 55}deg) saturate(${3 + amount * 5})`;
      target.drawImage(src, 0, y, w, Math.min(bh, h - y), (i % 2 ? -1 : 1) * offset * .55, y, w, Math.min(bh, h - y));
    }
    target.restore();
  }

  function phaseSeed(now, index) {
    return ((Math.floor(now / 83) * 37 + index * 71) % 997) / 997;
  }

  function refreshMoshPattern(now, intensity = 1) {
    if (now < state.moshNextAt && state.moshSlices.length) return;
    state.moshNextAt = now + 45 + Math.random() * (170 - intensity * 70);
    const count = Math.floor(7 + intensity * 24 + Math.random() * 12);
    state.moshSlices = Array.from({length: count}, () => ({
      x: Math.random(), y: Math.random(),
      w: .04 + Math.random() * (.18 + intensity * .18),
      h: .008 + Math.random() * (.035 + intensity * .08),
      dx: (Math.random() - .5) * (110 + intensity * 420),
      dy: (Math.random() - .5) * (12 + intensity * 80),
      scale: .85 + Math.random() * (.3 + intensity * .65),
      alpha: .35 + Math.random() * .65
    }));
  }

  function applyRandomMosh(src, out, amount, now, intensity = 1) {
    refreshMoshPattern(now, intensity);
    const w=canvas.width, h=canvas.height;
    out.clearRect(0,0,w,h);
    out.globalAlpha = .78 - intensity * .12;
    out.drawImage(src,0,0);
    out.globalAlpha = 1;
    for (const s of state.moshSlices) {
      const sx=Math.floor(s.x*w), sy=Math.floor(s.y*h);
      const sw=Math.max(8,Math.floor(s.w*w)), sh=Math.max(3,Math.floor(s.h*h));
      const dw=sw*s.scale, dh=sh*(.9+Math.random()*.25);
      out.globalAlpha=s.alpha;
      out.drawImage(src,sx,sy,sw,sh,sx+s.dx*amount,sy+s.dy*amount,dw,dh);
    }
    out.globalAlpha=1;
  }

  function resetEffectContext(target) {
    const w = canvas.width, h = canvas.height;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
    target.filter = 'none';
    target.imageSmoothingEnabled = true;
    target.clearRect(0, 0, w, h);
    target.fillStyle = '#000';
    target.fillRect(0, 0, w, h);
  }

  function drawMirrorGridPass(src, target, amount) {
    const w = canvas.width, h = canvas.height;
    const cols = 3, rows = 3, cw = w / cols, ch = h / rows;
    resetEffectContext(target);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      target.save();
      target.beginPath();
      target.rect(gx * cw, gy * ch, cw, ch);
      target.clip();
      target.translate(gx * cw + cw / 2, gy * ch + ch / 2);
      target.scale(gx % 2 ? -1 : 1, gy % 2 ? -1 : 1);
      const z = 1.15 + amount * .6;
      target.drawImage(src, -cw * z / 2, -ch * z / 2, cw * z, ch * z);
      target.restore();
    }
  }

  function applyNumberedEffect(id, src, target, amount, now) {
    const w = canvas.width, h = canvas.height;
    resetEffectContext(target);

    if (id === 'datamosh') {
      applyRandomMosh(src, target, amount, now, .88);
      return;
    }

    if (id === 'mirrorshards') {
      drawMirrorShards(src, target, amount, now);
      return;
    }

    if (id === 'mirrorgrid') {
      drawMirrorGridPass(src, target, amount);
      return;
    }

    if (id === 'crush') {
      target.save();
      target.globalAlpha = .88;
      target.filter = `contrast(${1.8 + amount * 3}) saturate(${2 + amount * 5}) brightness(${.8 + amount * .4})`;
      target.drawImage(src, 0, 0, w, h);
      target.restore();
      return;
    }

    // Overlay-style effects start with the previous completed pass.
    target.drawImage(src, 0, 0, w, h);

    if (id === 'splitzoom') {
      const pulse = .08 + amount * .2;
      target.save(); target.beginPath(); target.rect(0, 0, w * .34, h); target.clip();
      target.drawImage(src, -w * pulse / 2, -h * pulse / 2, w * (1 + pulse), h * (1 + pulse)); target.restore();
      target.save(); target.beginPath(); target.rect(w * .34, 0, w * .16, h); target.clip();
      target.drawImage(src, -w * .08, h * pulse * .35, w * (1 + pulse * .55), h * (1 - pulse * .1)); target.restore();
      target.save(); target.beginPath(); target.rect(w / 2, 0, w / 2, h); target.clip();
      target.drawImage(src, w * pulse / 2, h * pulse / 2, w * (1 - pulse), h * (1 - pulse)); target.restore();
      return;
    }

    if (id === 'blocks') {
      const size = Math.max(28, 90 - amount * 55);
      for (let n = 0; n < 22; n++) {
        const sx = Math.floor(Math.random() * w / size) * size;
        const sy = Math.floor(Math.random() * h / size) * size;
        const dx = sx + (Math.random() - .5) * 180 * amount;
        const dy = sy + (Math.random() - .5) * 130 * amount;
        target.drawImage(src, sx, sy, size, size, dx, dy, size, size);
      }
      return;
    }

    if (id === 'videotear') {
      drawVideoTear(src, target, amount, now);
      return;
    }

    if (id === 'invert') {
      const pulse = .46 + .38 * Math.abs(Math.sin(now * .012));
      target.save();
      target.globalCompositeOperation = 'difference';
      target.globalAlpha = Math.min(.92, pulse + amount * .24);
      target.fillStyle = '#fff';
      target.fillRect(0, 0, w, h);
      target.restore();
      target.save();
      target.globalAlpha = .18 + amount * .28;
      target.filter = `contrast(${1.4 + amount * 1.5}) saturate(${1.5 + amount * 2.5})`;
      const jump = Math.sin(now * .021) * 26 * amount;
      target.drawImage(src, jump, 0, w, h);
      target.restore();
      return;
    }

    if (id === 'colorsurge') {
      drawColorSurge(src, target, amount, now);
      return;
    }

    if (id === 'strobe') {
      const hit = Math.floor(now / 48) % 3 !== 1;
      if (hit) {
        target.save();
        target.globalCompositeOperation = 'difference';
        target.fillStyle = '#fff';
        target.fillRect(0, 0, w, h);
        const bands = 4 + Math.floor(amount * 7);
        for (let i = 0; i < bands; i++) {
          const bh = 3 + Math.random() * 32;
          const by = Math.random() * (h - bh);
          target.fillRect((Math.random() - .5) * 90 * amount, by, w, bh);
        }
        target.restore();
      }
    }
  }

  function renderFrame(now) {
    requestAnimationFrame(renderFrame);
    updateAudioLevel();
    const rec = activeVideoRecord();
    const w = canvas.width, h = canvas.height;
    const reactive = 1 + state.audioLevel * state.audioReact * 1.8;
    const amount = Math.min(1, state.master * reactive);

    if (!rec || sourceVideo.readyState < 2) {
      ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
      return;
    }

    if (!state.freezeFrame) {
      bctxA.fillStyle = '#000'; bctxA.fillRect(0,0,w,h);
      let shakeX = 0, shakeY = 0, zoom = 1, rotation = 0;
      if (state.transition) {
        const p = Math.min(1, (now - state.transition.started) / (state.transitionDuration * 1000));
        const s = Math.pow(1 - p, 2.4);
        const hit = state.transitionStrength;
        if (state.transition.id === 'shake') { shakeX = (Math.random()-.5)*110*s*hit; shakeY = (Math.random()-.5)*76*s*hit; }
        if (state.transition.id === 'zoom') zoom = 1 + .72*s*hit;
        if (state.transition.id === 'spin') rotation = s * .62 * hit;
        if (p >= 1) state.transition = null;
      }
      const frame = getFraming('base') || { zoom: 1, x: 0, y: 0 };
      drawCover(bctxA, sourceVideo, w, h, shakeX, shakeY, zoom * frame.zoom, rotation, frame.x, frame.y);
      drawChromaLayer(bctxA, w, h, shakeX, shakeY, zoom, rotation, now);
      if (state.logoAffected) drawLogo(bctxA);
    }

    // Build one composited signal by feeding each active numbered effect
    // into the next. The bank order is stable, so 3+8 and 8+3 produce the
    // same combined result and no effect can silently wipe out an earlier one.
    let srcCanvas = bufferA;
    let nextFxCtx = fxctxA;
    for (const fx of effects) {
      if (!state.activeEffects.has(fx.id)) continue;
      applyNumberedEffect(fx.id, srcCanvas, nextFxCtx, amount, now);
      srcCanvas = nextFxCtx.canvas;
      nextFxCtx = nextFxCtx === fxctxA ? fxctxB : fxctxA;
    }

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(srcCanvas, 0, 0, w, h);

    if (!state.logoAffected) drawLogo(ctx);

    if (state.transition) {
      const p = Math.min(1, (now - state.transition.started) / (state.transitionDuration * 1000));
      const s = Math.pow(1-p, 2.4);
      const hit = state.transitionStrength;
      if (state.transition.id === 'flash') {
        ctx.fillStyle=`rgba(255,255,255,${Math.min(1,s*1.15*hit)})`; ctx.fillRect(0,0,w,h);
        ctx.globalCompositeOperation='difference';
        for (let n=0;n<5;n++) { const y=Math.random()*h, hh=8+Math.random()*70; ctx.drawImage(canvas,0,y,w,hh,(Math.random()-.5)*140*hit,y,w,hh); }
        ctx.globalCompositeOperation='source-over';
      }
      if (state.transition.id === 'black') {
        ctx.fillStyle=`rgba(0,0,0,${Math.min(1,s*1.2*hit)})`; ctx.fillRect(0,0,w,h);
        if (s>.38) { ctx.fillStyle=`rgba(255,255,255,${s*.18})`; for(let n=0;n<4;n++)ctx.fillRect(0,Math.random()*h,w,2+Math.random()*12); }
      }
    }
    ctx.restore();
  }

  function rebuildTimeline() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = timeline.getBoundingClientRect();
    timeline.width = Math.max(600, Math.floor(rect.width*dpr));
    timeline.height = Math.floor(96*dpr);
    tctx.setTransform(dpr,0,0,dpr,0,0);
    drawTimeline();
  }

  function drawTimeline() {
    const rect = timeline.getBoundingClientRect();
    const w = rect.width, h = 96;
    tctx.fillStyle = '#080b0d'; tctx.fillRect(0,0,w,h);
    const rec = activeVideoRecord();
    if (!rec || !Number.isFinite(sourceVideo.duration)) {
      tctx.fillStyle = '#58636b'; tctx.font = '12px Alsina, Impact, sans-serif'; tctx.fillText('NO ACTIVE VIDEO', 12, 52); return;
    }
    const grad = tctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0,'#182229'); grad.addColorStop(.5,'#26333b'); grad.addColorStop(1,'#11191e');
    tctx.fillStyle = grad; tctx.fillRect(0,0,w,h);
    tctx.strokeStyle = '#3d4a53';
    for (let i=0;i<=12;i++) { const x=i*w/12; tctx.beginPath(); tctx.moveTo(x,0); tctx.lineTo(x,h); tctx.stroke(); }
    const progress = sourceVideo.duration ? sourceVideo.currentTime/sourceVideo.duration : 0;
    tctx.fillStyle = 'rgba(0,239,154,.14)'; tctx.fillRect(0,0,w*progress,h);
    tctx.strokeStyle = '#00ef9a'; tctx.beginPath(); tctx.moveTo(w*progress,0); tctx.lineTo(w*progress,h); tctx.stroke();
    for (const key of cueKeys) {
      const cue = state.cues[key];
      if (!cue || cue.videoIndex !== state.activeVideoIndex) continue;
      const x = (cue.time/sourceVideo.duration)*w;
      tctx.fillStyle = '#00ef9a'; tctx.fillRect(x-1,0,2,h);
      tctx.fillStyle = '#00170e'; tctx.fillRect(x-10,6,20,18);
      tctx.fillStyle = '#00ef9a'; tctx.font = 'bold 12px Alsina, Impact, sans-serif'; tctx.fillText(key.toUpperCase(),x-4,20);
    }
  }

  function buildCuePads() {
    $('cueKeySelect').innerHTML = `<option value="">NO CUE SELECTED</option>` + cueKeys.map(k => `<option value="${k}">${k.toUpperCase()}</option>`).join('');
    $('cueKeySelect').value = state.armedCue || '';
    $('cuePads').innerHTML = '';
    cueKeys.forEach(key => {
      const b = document.createElement('button');
      b.className = 'cue-pad'; b.dataset.key = key;
      b.addEventListener('click', (event) => {
        if (event.shiftKey) { triggerCue(key, true); return; }
        state.armedCue = state.armedCue === key ? null : key;
        $('cueKeySelect').value = state.armedCue || '';
        updateCuePads();
        setStatus(state.armedCue ? `cue ${key.toUpperCase()} selected — shift click timeline to replace it` : 'cue selection cleared');
      });
      b.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        state.cues[key] = null;
        if (state.armedCue === key) state.armedCue = null;
        $('cueKeySelect').value = state.armedCue || '';
        updateCuePads(); drawTimeline(); setStatus(`cue ${key.toUpperCase()} cleared`);
      });
      $('cuePads').appendChild(b);
    });
    updateCuePads();
  }

  function updateCuePads() {
    document.querySelectorAll('.cue-pad').forEach(pad => {
      const key = pad.dataset.key;
      const cue = state.cues[key];
      pad.classList.toggle('armed', key === state.armedCue);
      pad.innerHTML = `<div class="cue-key">${key.toUpperCase()}</div><div class="cue-time">${cue ? formatTime(cue.time,true) : 'EMPTY'}</div><div class="cue-mode">${cue ? 'SHIFT+CLICK: PLAY · RIGHT-CLICK: REMOVE' : 'SHIFT-CLICK TIMELINE: AUTO ADD'}</div>`;
    });
  }

  function assignedFxKeys(effectId) {
    return fxKeySlots.filter(key => state.fxKeyMap[key] === effectId);
  }

  function effectForPerformanceKey(key) {
    const id = state.fxKeyMap[key];
    return effects.find(effect => effect.id === id) || null;
  }

  function applyFxKeyMap(mode, customMap = null, announce = true) {
    state.fxMapMode = mode === 'custom' ? 'custom' : 'default';
    state.fxKeyMap = state.fxMapMode === 'default'
      ? { ...defaultFxKeyMap }
      : Object.fromEntries(fxKeySlots.map(key => {
          const id = customMap?.[key];
          return [key, effects.some(effect => effect.id === id) ? id : ''];
        }));
    clearEffects();
    buildFxButtons();
    if (announce) setStatus(`${state.fxMapMode} FX key mapping active`);
  }

  function buildCustomFxMapRows(map = savedCustomFxKeyMap) {
    const container = $('customFxMapRows');
    container.innerHTML = '';
    fxKeySlots.forEach(key => {
      const row = document.createElement('label');
      row.className = 'custom-fx-map-row';
      const keyLabel = document.createElement('strong');
      keyLabel.textContent = displayKey(key);
      const select = document.createElement('select');
      select.dataset.fxMapKey = key;
      select.setAttribute('aria-label', `Effect assigned to ${displayKey(key)}`);
      select.innerHTML = '<option value="">BLANK — NO EFFECT</option>' + effects
        .map(effect => `<option value="${effect.id}">${effect.name}</option>`).join('');
      select.value = effects.some(effect => effect.id === map[key]) ? map[key] : '';
      row.append(keyLabel, select);
      container.appendChild(row);
    });
  }

  function readCustomFxMapRows() {
    return Object.fromEntries(fxKeySlots.map(key => {
      const select = [...document.querySelectorAll('[data-fx-map-key]')].find(input => input.dataset.fxMapKey === key);
      return [key, select?.value || ''];
    }));
  }

  function showFxMapChoice() {
    $('mapModeChoice').classList.remove('hidden');
    $('customMapEditor').classList.add('hidden');
    const dialog = $('startupMapDialog');
    if (!dialog.open) dialog.showModal();
  }

  function showCustomFxMapEditor() {
    buildCustomFxMapRows(savedCustomFxKeyMap);
    $('mapModeChoice').classList.add('hidden');
    $('customMapEditor').classList.remove('hidden');
  }

  function closeFxMapSetup() {
    const dialog = $('startupMapDialog');
    if (dialog.open) dialog.close();
  }

  function buildFxButtons() {
    $('fxButtons').innerHTML = '';
    effects.forEach(fx => {
      const b = document.createElement('button');
      b.className = 'fx-btn'; b.dataset.fx = fx.id;
      const keys = assignedFxKeys(fx.id);
      b.innerHTML = `<strong>${fx.name}</strong><span>${keys.length ? keys.map(displayKey).join(' · ') : 'UNMAPPED'}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); activateEffect(fx.id, true); });
      b.addEventListener('pointerup', () => deactivateEffect(fx.id));
      b.addEventListener('pointerleave', () => { if (state.fxMode === 'hold') deactivateEffect(fx.id); });
      $('fxButtons').appendChild(b);
    });
    $('transitionButtons').innerHTML = '';
    $('transitionKeyMap').innerHTML = '';
    transitions.forEach(tr => {
      const b = document.createElement('button');
      b.className = 'fx-btn'; b.innerHTML = `<strong>${tr.name}</strong><span>${displayKey(tr.key)}</span>`;
      b.dataset.transition = tr.id;
      b.addEventListener('click', () => triggerTransition(tr.id));
      $('transitionButtons').appendChild(b);

      const row = document.createElement('div');
      row.className = 'key-map-row';
      const label = document.createElement('label');
      label.textContent = tr.name;
      const input = document.createElement('input');
      input.className = 'key-capture';
      input.type = 'text'; input.readOnly = true; input.value = displayKey(tr.key);
      input.setAttribute('aria-label', `Key for ${tr.name}`);
      input.addEventListener('focus', () => { input.classList.add('listening'); input.value = '...'; });
      input.addEventListener('blur', () => { input.classList.remove('listening'); input.value = displayKey(tr.key); });
      input.addEventListener('keydown', e => {
        e.preventDefault(); e.stopPropagation();
        if (['Shift','Control','Alt','Meta'].includes(e.key)) return;
        const next = normalizeKey(e.key);
        const conflict = transitions.filter(t => t !== tr).find(item => item.key === next);
        if (cueKeys.includes(next) || fxKeySlots.includes(next) || conflict) {
          setStatus(`key ${displayKey(next)} is already assigned`);
          input.value = displayKey(tr.key);
          input.blur(); return;
        }
        tr.key = next;
        saveTransitionKeys();
        input.value = displayKey(next);
        b.querySelector('span').textContent = displayKey(next);
        updateDefaultTransitionUI();
        input.blur();
        setStatus(`${tr.name} mapped to ${displayKey(next)}`);
      });
      row.append(label, input);
      $('transitionKeyMap').appendChild(row);
    });
    updateDefaultTransitionUI();
  }


  function normalizeKey(key) {
    if (key === ' ') return 'space';
    return key.toLowerCase();
  }
  function displayKey(key) {
    if (key === ' ') return 'SPACE';
    if (key === '\\') return '\\';
    return String(key).toUpperCase();
  }
  function saveTransitionKeys() {
    try { localStorage.setItem('distortion-transition-keys-v2', JSON.stringify(Object.fromEntries(transitions.map(t => [t.id, t.key])))); }
    catch {}
  }

  function saveDefaultTransition() {
    try { localStorage.setItem('distortion-default-transition', state.defaultTransitionId); }
    catch {}
  }

  function updateDefaultTransitionUI() {
    const select = $('defaultTransitionSelect');
    if (!select) return;
    const selected = state.defaultTransitionId;
    select.innerHTML = '<option value="none">NONE — HARD CUT</option>' + transitions.map(tr =>
      `<option value="${tr.id}">${tr.name} — ${displayKey(tr.key)}</option>`
    ).join('');
    select.value = selected === 'none' || transitions.some(tr => tr.id === selected) ? selected : 'flash';
    state.defaultTransitionId = select.value;
    document.querySelectorAll('[data-transition]').forEach(button => {
      button.classList.toggle('default-transition', button.dataset.transition === state.defaultTransitionId);
      const existing = button.querySelector('.default-badge');
      if (existing) existing.remove();
      if (button.dataset.transition === state.defaultTransitionId) {
        const badge = document.createElement('em');
        badge.className = 'default-badge';
        badge.textContent = 'DEFAULT';
        button.appendChild(badge);
      }
    });
  }

  function resetTransitionKeyMap() {
    transitions.forEach(tr => { tr.key = defaultTransitionKeys[tr.id]; });
    saveTransitionKeys();
    buildFxButtons();
    setStatus('transition keys reset to T Y U I O P');
  }

  function updateFxButtons() {
    document.querySelectorAll('[data-fx]').forEach(b => b.classList.toggle('active', state.activeEffects.has(b.dataset.fx)));
    if (state.channel) state.channel.postMessage({ type: 'fxState', active: [...state.activeEffects] });
  }

  function activateEffect(id, fromPointer = false) {
    if (state.fxMode === 'latch' && fromPointer) {
      if (state.activeEffects.has(id)) state.activeEffects.delete(id); else state.activeEffects.add(id);
    } else {
      state.activeEffects.add(id); state.heldEffects.add(id);
    }
    updateFxButtons();
    setStatus(`${id} effect active`);
  }

  function deactivateEffect(id) {
    if (state.fxMode === 'hold' && state.heldEffects.has(id)) {
      state.heldEffects.delete(id); state.activeEffects.delete(id); updateFxButtons();
    }
  }

  function clearEffects() {
    state.activeEffects.clear(); state.heldEffects.clear(); updateFxButtons(); setStatus('signal clean');
  }

  function randomizeEffects() {
    clearEffects();
    const shuffled = [...effects].sort(() => Math.random()-.5).slice(0, 2 + Math.floor(Math.random()*3));
    shuffled.forEach(f => state.activeEffects.add(f.id));
    state.master = .45 + Math.random()*.45;
    $('masterDistortion').value = state.master;
    $('masterValue').textContent = `${Math.round(state.master*100)}%`;
    updateFxButtons();
    triggerTransition(['flash','shake','zoom'][Math.floor(Math.random()*3)]);
    setStatus(`destroy signal: ${shuffled.map(f=>f.name).join(' + ')}`);
  }

  function triggerTransition(id) {
    state.transition = { id, started: performance.now(), seed: Math.random() };
    const btn = document.querySelector(`[data-transition="${id}"]`);
    if (btn) { btn.classList.remove('snap-hit'); void btn.offsetWidth; btn.classList.add('snap-hit'); setTimeout(()=>btn.classList.remove('snap-hit'),140); }
    if (id === 'freeze') {
      state.freezeFrame = true;
      setTimeout(() => { state.freezeFrame = false; }, Math.max(80, state.transitionDuration*1000*.78));
    }
    setStatus(`${id} transition`);
  }

  function refreshChromaVideoSelect() {
    const select = $('chromaVideoSelect');
    const selected = state.chromaVideoIndex >= 0 ? String(state.chromaVideoIndex) : '';
    select.innerHTML = '<option value="">NO TOP VIDEO</option>' + state.videos
      .map((video, index) => `<option value="${index}">${escapeHtml(video.name)}</option>`)
      .join('');
    select.value = state.videos[state.chromaVideoIndex] ? selected : '';
  }

  function updateChromaValueLabels() {
    $('chromaOpacityValue').textContent = `${Math.round(state.chromaOpacity * 100)}%`;
    $('chromaToleranceValue').textContent = `${Math.round(state.chromaTolerance * 100)}%`;
    $('chromaSoftnessValue').textContent = `${Math.round(state.chromaSoftness * 100)}%`;
    $('chromaSpillValue').textContent = `${Math.round(state.chromaSpill * 100)}%`;
  }

  function updateChromaUI() {
    const record = state.videos[state.chromaVideoIndex];
    const hasVideo = Boolean(record);
    $('chromaStatus').textContent = hasVideo ? `TOP: ${record.name}` : 'NO CHROMA LAYER LOADED';
    $('chromaVideoSelect').value = hasVideo ? String(state.chromaVideoIndex) : '';
    ['chromaVisible','chromaKeyEnabled','chromaSync','chromaColor','chromaOpacity','chromaTolerance','chromaSoftness','chromaSpill','chromaPickBtn','chromaPlayBtn','chromaRestartBtn','chromaClearBtn']
      .forEach(id => { $(id).disabled = !hasVideo; });
    $('chromaPickBtn').classList.toggle('active', state.chromaPicking);
    $('chromaPickBtn').setAttribute('aria-pressed', String(state.chromaPicking));
    $('chromaPickNote').textContent = state.chromaPicking
      ? 'CLICK THE KEY COLOR IN THE TOP CLIP ON THE OUTPUT — PRESS PICK COLOR AGAIN TO CANCEL.'
      : 'Use the color box, or press PICK COLOR and click that color in the top clip on the output.';
    canvas.classList.toggle('chroma-picking', state.chromaPicking);
    updateChromaValueLabels();
  }

  function clearChromaVideo(announce = true) {
    chromaVideo.pause();
    chromaVideo.removeAttribute('src');
    chromaVideo.load();
    state.chromaVideoIndex = -1;
    if (state.framingTarget === 'top') state.framingTarget = 'base';
    state.chromaPicking = false;
    state.chromaDirty = true;
    refreshChromaVideoSelect();
    updateChromaUI(); updateFramingUI();
    if (announce) setStatus('top chroma layer cleared');
  }

  function loadChromaVideo(index) {
    const record = state.videos[index];
    if (!record) { clearChromaVideo(); return; }
    state.chromaVideoIndex = index;
    state.chromaVisible = true;
    state.chromaPicking = false;
    state.chromaDirty = true;
    $('chromaVisible').checked = true;
    chromaVideo.src = record.url;
    chromaVideo.loop = true;
    chromaVideo.load();
    chromaVideo.onloadedmetadata = () => {
      chromaVideo.currentTime = 0;
      if (!state.chromaSync || !sourceVideo.paused) safePlay(chromaVideo);
      state.chromaDirty = true;
      updateChromaUI(); updateFramingUI();
      setStatus(`top chroma video loaded: ${record.name}`);
    };
    updateChromaUI();
  }

  function setChromaPicking(enabled) {
    if (state.chromaVideoIndex < 0) return;
    state.chromaPicking = enabled;
    updateChromaUI();
    setStatus(enabled ? 'chroma picker ready — click the key color on the output' : 'chroma color picker cancelled');
  }

  function sampleChromaColor(event) {
    if (!state.chromaPicking || chromaVideo.readyState < 2) return false;
    const cw = chromaSourceCanvas.width;
    const ch = chromaSourceCanvas.height;
    chromaSourceCtx.clearRect(0, 0, cw, ch);
    const frame = getFraming('top') || { zoom: 1, x: 0, y: 0 };
    drawCover(chromaSourceCtx, chromaVideo, cw, ch, 0, 0, frame.zoom, 0, frame.x, frame.y);
    const point = pointerToCanvas(event);
    const x = Math.max(0, Math.min(cw - 1, Math.floor(point.x / canvas.width * cw)));
    const y = Math.max(0, Math.min(ch - 1, Math.floor(point.y / canvas.height * ch)));
    try {
      const pixel = chromaSourceCtx.getImageData(x, y, 1, 1).data;
      state.chromaColor = rgbToHex(pixel[0], pixel[1], pixel[2]);
      $('chromaColor').value = state.chromaColor;
      state.chromaDirty = true;
      state.chromaPicking = false;
      updateChromaUI();
      setStatus(`chroma key color picked: ${state.chromaColor}`);
    } catch (error) {
      console.warn('Chroma color could not be sampled.', error);
      setChromaPicking(false);
      setStatus('could not sample that chroma color');
    }
    return true;
  }

  function loadVideo(index) {
    if (!state.videos[index]) return;
    state.activeVideoIndex = index;
    sourceVideo.src = state.videos[index].url;
    sourceVideo.load();
    sourceVideo.onloadedmetadata = () => {
      sourceVideo.currentTime = 0;
      safePlay(sourceVideo);
      $('dropHint').classList.add('hidden');
      document.querySelectorAll('.video-item').forEach((el,i)=>el.classList.toggle('active',i===index));
      drawTimeline(); updateCuePads(); updateFramingUI(); setStatus(`video loaded: ${state.videos[index].name}`);
    };
  }

  function addVideos(files) {
    [...files].forEach(file => {
      const url = URL.createObjectURL(file);
      const temp = document.createElement('video');
      temp.src = url; temp.muted = true; temp.preload = 'metadata';
      const record = { file, url, name: file.name, duration: 0, thumb: '' };
      state.videos.push(record);
      const index = state.videos.length - 1;
      temp.onloadedmetadata = () => {
        record.duration = temp.duration;
        temp.currentTime = Math.min(1, temp.duration/10 || 0);
      };
      temp.onseeked = () => {
        const c = document.createElement('canvas'); c.width=160; c.height=90;
        c.getContext('2d').drawImage(temp,0,0,160,90);
        try { record.thumb = c.toDataURL('image/jpeg',.7); } catch (_) {}
        renderVideoLibrary();
      };
      renderVideoLibrary();
      if (state.activeVideoIndex < 0) loadVideo(index);
    });
  }

  function renderVideoLibrary() {
    $('videoLibrary').innerHTML = '';
    state.videos.forEach((v,i) => {
      const item = document.createElement('button');
      item.className = `video-item${i===state.activeVideoIndex?' active':''}`;
      item.innerHTML = `${v.thumb ? `<img class="video-thumb" src="${v.thumb}" alt="">` : '<div class="video-thumb"></div>'}<div class="video-meta"><div class="video-name">${escapeHtml(v.name)}</div><div class="video-duration">${formatTime(v.duration)}</div></div>`;
      item.addEventListener('click', () => loadVideo(i));
      $('videoLibrary').appendChild(item);
    });
    refreshChromaVideoSelect();
  }

  function escapeHtml(text) { return text.replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }

  function timelinePosition(evt) {
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, evt.clientX - rect.left));
    return { x, ratio: rect.width ? x / rect.width : 0, rect };
  }

  function triggerCue(key, fromClick = false) {
    const cue = state.cues[key];
    if (!cue) { state.armedCue = key; $('cueKeySelect').value = key; updateCuePads(); setStatus(`cue ${key.toUpperCase()} armed`); return; }
    if (cue.videoIndex !== state.activeVideoIndex) loadVideo(cue.videoIndex);
    const run = () => {
      const oldTime = sourceVideo.currentTime;
      sourceVideo.currentTime = cue.time;
      safePlay(sourceVideo);
      if (cue.mode === 'hold') cue.returnTime = oldTime;
      if (cue.mode === 'loop') {
        clearInterval(state.loopTimers.get(key));
        const timer = setInterval(() => { if (sourceVideo.currentTime >= cue.time + 2) sourceVideo.currentTime = cue.time; }, 50);
        state.loopTimers.set(key,timer);
      }
      if (state.defaultTransitionId !== 'none') triggerTransition(state.defaultTransitionId);
      setStatus(`cue ${key.toUpperCase()} — ${formatTime(cue.time,true)}${state.defaultTransitionId === 'none' ? ' · hard cut' : ` · ${transitions.find(tr => tr.id === state.defaultTransitionId)?.name || 'transition'}`}`);
    };
    if (sourceVideo.readyState >= 1) run(); else sourceVideo.addEventListener('loadedmetadata',run,{once:true});
  }

  function releaseCue(key) {
    const cue = state.cues[key];
    if (!cue) return;
    if (cue.mode === 'hold' && Number.isFinite(cue.returnTime)) { sourceVideo.currentTime = cue.returnTime; safePlay(sourceVideo); }
    if (cue.mode === 'freeze') sourceVideo.pause();
    if (cue.mode === 'loop') { clearInterval(state.loopTimers.get(key)); state.loopTimers.delete(key); }
  }

  function pointerToCanvas(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x:(evt.clientX-rect.left)/rect.width*canvas.width, y:(evt.clientY-rect.top)/rect.height*canvas.height };
  }

  function logoBounds() {
    if (!state.logo) return null;
    const w=canvas.width*state.logoScale, h=w/(state.logo.naturalWidth/state.logo.naturalHeight||1);
    return { x:state.logoX*canvas.width-w/2, y:state.logoY*canvas.height-h/2, w, h };
  }

  async function startRecording() {
    try {
      if (!window.MediaRecorder) throw new Error('MediaRecorder is not available in this browser.');
      setupAudioGraph();
      const canvasStream = canvas.captureStream(60);
      const tracks = [...canvasStream.getVideoTracks()];
      if (state.audioDest) tracks.push(...state.audioDest.stream.getAudioTracks());
      const stream = new MediaStream(tracks);
      const format = selectedRecordingFormat();
      const quality = recordingQualityProfiles[$('recordQualitySelect').value] || recordingQualityProfiles.maximum;
      const options = {
        videoBitsPerSecond: quality.videoBitsPerSecond,
        audioBitsPerSecond: quality.audioBitsPerSecond
      };
      if (format.mimeType) options.mimeType = format.mimeType;

      state.recordedChunks = [];
      state.recorder = new MediaRecorder(stream, options);
      const actualMimeType = state.recorder.mimeType || format.mimeType || 'video/webm';
      const extension = actualMimeType.includes('mp4') ? 'mp4' : format.extension || 'webm';
      state.recorder.ondataavailable = event => {
        if (event.data && event.data.size) state.recordedChunks.push(event.data);
      };
      state.recorder.onerror = event => {
        console.error('MediaRecorder error', event.error || event);
        setStatus('recording encoder error');
      };
      state.recorder.onstop = () => {
        const blob = new Blob(state.recordedChunks, { type: actualMimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `distortion-performance-${Date.now()}.${extension}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setStatus(`recording saved — ${extension.toUpperCase()} / ${quality.label}`);
      };
      state.recorder.start(1000);
      state.recordStartedAt = Date.now();
      setRecordingControlsDisabled(true);
      $('recordBtn').disabled = true;
      $('stopRecordBtn').disabled = false;
      $('recordBadge').classList.remove('hidden');
      state.recordTimer = setInterval(() => {
        $('recordTimer').textContent = formatTime((Date.now() - state.recordStartedAt) / 1000);
      }, 250);
      setStatus(`recording ${format.label} — ${quality.label}`);
    } catch (err) {
      console.error(err);
      setRecordingControlsDisabled(false);
      alert(`Recording could not start: ${err.message}`);
      setStatus('recording failed');
    }
  }

  function stopRecording() {
    if (!state.recorder || state.recorder.state === 'inactive') return;
    state.recorder.stop();
    clearInterval(state.recordTimer);
    state.recordTimer = null;
    setRecordingControlsDisabled(false);
    $('recordBtn').disabled = false;
    $('stopRecordBtn').disabled = true;
    $('recordBadge').classList.add('hidden');
    setStatus('finalizing recording');
  }

  function openDetachedControls() {
    const win = window.open('', 'DISTORTION_CONTROLS', 'width=460,height=820,resizable=yes');
    if (!win) { alert('The detached controls window was blocked. Allow pop-ups for this page.'); return; }
    state.detachedWindow = win;
    const fxMarkup = effects.map(f=>`<button data-command="fx" data-value="${f.id}">${assignedFxKeys(f.id).map(displayKey).join('/') || '—'}<small>${f.name}</small></button>`).join('');
    const cueMarkup = cueKeys.map(k=>`<button data-command="cue" data-value="${k}">${k.toUpperCase()}<small>HOT CUE</small></button>`).join('');
    win.document.open();
    win.document.write(`<!doctype html><html><head><title>DISTORTION Controls</title><style>
      @font-face{font-family:'Alsina Ultrajada';src:url('https://db.onlinewebfonts.com/t/38635a91a1d7b6ab9e66cfdebf6f5a13.woff2') format('woff2');font-display:swap}body{margin:0;background:#090b0d;color:#e9f0f3;font-family:'Alsina Ultrajada',Impact,sans-serif;padding:12px}h1{letter-spacing:.14em;margin:0 0 4px}p{color:#8e9ba3;margin:0 0 14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}button{min-height:58px;background:#11171b;color:#e9f0f3;border:1px solid #3d4850;font:inherit}button:hover{border-color:#00ef9a}small{display:block;color:#8e9ba3;font-size:8px;margin-top:5px}.wide{width:100%;margin-bottom:6px}.status{border:1px solid #313b43;padding:9px;color:#00ef9a;margin:8px 0 12px}</style></head><body>
      <h1>DISTORTION</h1><p>DETACHED PERFORMANCE CONTROL</p><div id="status" class="status">CONNECTED</div>
      <h3>HOT CUES</h3><div class="grid">${cueMarkup}</div>
      <h3>DISTORTION</h3><div class="grid">${fxMarkup}</div>
      <button class="wide" data-command="audio">PLAY / PAUSE SONG</button>
      <button class="wide" data-command="chroma-visible">SHOW / HIDE CHROMA LAYER</button>
      <button class="wide" data-command="chroma-play">PLAY / PAUSE TOP VIDEO</button>
      <button class="wide" data-command="chroma-restart">RESTART TOP VIDEO</button>
      <button class="wide" data-command="random">DESTROY SIGNAL</button>
      <button class="wide" data-command="panic">CLEAR ALL FX</button>
      <button class="wide" data-command="record">START / STOP RECORDING</button>
      <script>
        const channel=new BroadcastChannel('distortion-control');
        document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>channel.postMessage({type:'command',command:b.dataset.command,value:b.dataset.value||''})));
        channel.onmessage=e=>{if(e.data.type==='status')document.getElementById('status').textContent=e.data.text.toUpperCase()};
      <\/script></body></html>`);
    win.document.close();
    setStatus('controls detached');
  }

  function resetPerformanceControls() {
    clearEffects(); state.master=.45; state.audioReact=.35; state.transitionDuration=.16; state.transitionStrength=.85; state.defaultTransitionId='flash'; state.fxMode='hold';
    state.baseFraming.clear(); state.topFraming.clear(); state.framingTarget='base'; state.draggingFrame=false;
    state.chromaVisible=true; state.chromaKeyEnabled=true; state.chromaSync=true; state.chromaColor='#00ff00'; state.chromaTolerance=.18; state.chromaSoftness=.12; state.chromaSpill=.7; state.chromaOpacity=1; state.chromaPicking=false; state.chromaDirty=true;
    $('masterDistortion').value=.45; $('audioReact').value=.35; $('transitionDuration').value=.16; $('transitionStrength').value=.85; $('fxModeSelect').value='hold';
    $('chromaVisible').checked=true; $('chromaKeyEnabled').checked=true; $('chromaSync').checked=true; $('chromaColor').value='#00ff00'; $('chromaTolerance').value=.18; $('chromaSoftness').value=.12; $('chromaSpill').value=.7; $('chromaOpacity').value=1;
    $('masterValue').textContent='45%'; $('reactValue').textContent='35%'; $('transitionValue').textContent='0.16s'; $('transitionStrengthValue').textContent='85%';
    saveDefaultTransition(); updateDefaultTransitionUI(); updateChromaUI(); updateFramingUI();
    setStatus('performance controls reset');
  }

  function resetEntireProject() {
    if (!confirm('Clear all loaded media, cue points, effects, and logo settings?')) return;
    clearChromaVideo(false);
    state.videos.forEach(v=>URL.revokeObjectURL(v.url));
    state.videos=[]; state.activeVideoIndex=-1; sourceVideo.removeAttribute('src'); sourceVideo.load(); song.removeAttribute('src'); song.load();
    state.baseFraming.clear(); state.topFraming.clear(); state.framingTarget='base'; state.draggingFrame=false;
    state.cues=Object.fromEntries(cueKeys.map(k=>[k,null])); state.logo=null; clearEffects();
    $('videoLibrary').innerHTML=''; $('audioName').textContent='NO SONG LOADED'; $('dropHint').classList.remove('hidden'); refreshChromaVideoSelect(); updateChromaUI(); updateFramingUI(); updateCuePads(); drawTimeline();
    setStatus('project reset');
  }

  // Inputs
  $('videoInput').addEventListener('change', e => addVideos(e.target.files));
  $('framingTarget').addEventListener('change', e => {
    state.framingTarget = e.target.value === 'top' ? 'top' : 'base';
    state.draggingFrame = false;
    updateFramingUI();
    setStatus(`${state.framingTarget === 'top' ? 'top chroma' : 'base video'} framing selected — drag the output to reposition`);
  });
  $('frameZoom').addEventListener('input', e => {
    const frame = getFraming(); if (!frame) return;
    frame.zoom = Number(e.target.value);
    if (state.framingTarget === 'top') state.chromaDirty = true;
    updateFramingUI();
  });
  $('frameX').addEventListener('input', e => {
    const frame = getFraming(); if (!frame) return;
    frame.x = Number(e.target.value);
    if (state.framingTarget === 'top') state.chromaDirty = true;
    updateFramingUI();
  });
  $('frameY').addEventListener('input', e => {
    const frame = getFraming(); if (!frame) return;
    frame.y = Number(e.target.value);
    if (state.framingTarget === 'top') state.chromaDirty = true;
    updateFramingUI();
  });
  $('frameResetBtn').addEventListener('click', () => {
    const frame = getFraming(); if (!frame) return;
    frame.zoom = 1; frame.x = 0; frame.y = 0;
    if (state.framingTarget === 'top') state.chromaDirty = true;
    updateFramingUI();
    setStatus(`${state.framingTarget === 'top' ? 'top chroma' : 'base video'} frame reset`);
  });
  $('chromaVideoSelect').addEventListener('change', e => {
    if (e.target.value === '') clearChromaVideo();
    else loadChromaVideo(Number(e.target.value));
  });
  $('chromaVisible').addEventListener('change', e => {
    state.chromaVisible = e.target.checked;
    state.chromaDirty = true;
    if (state.chromaVisible && state.chromaVideoIndex >= 0 && (!state.chromaSync || !sourceVideo.paused)) safePlay(chromaVideo);
    setStatus(state.chromaVisible ? 'top chroma layer visible' : 'top chroma layer hidden');
  });
  $('chromaKeyEnabled').addEventListener('change', e => {
    state.chromaKeyEnabled = e.target.checked;
    state.chromaDirty = true;
    setStatus(state.chromaKeyEnabled ? 'chroma key enabled' : 'chroma key bypassed — full top video visible');
  });
  $('chromaSync').addEventListener('change', e => {
    state.chromaSync = e.target.checked;
    if (state.chromaSync) {
      if (sourceVideo.paused) chromaVideo.pause(); else safePlay(chromaVideo);
    }
    setStatus(state.chromaSync ? 'top video follows base play and pause' : 'top video transport is independent');
  });
  $('chromaColor').addEventListener('input', e => {
    state.chromaColor = e.target.value;
    state.chromaDirty = true;
    setStatus(`chroma key color: ${state.chromaColor}`);
  });
  $('chromaOpacity').addEventListener('input', e => {
    state.chromaOpacity = Number(e.target.value);
    state.chromaDirty = true;
    updateChromaValueLabels();
  });
  $('chromaTolerance').addEventListener('input', e => {
    state.chromaTolerance = Number(e.target.value);
    state.chromaDirty = true;
    updateChromaValueLabels();
  });
  $('chromaSoftness').addEventListener('input', e => {
    state.chromaSoftness = Number(e.target.value);
    state.chromaDirty = true;
    updateChromaValueLabels();
  });
  $('chromaSpill').addEventListener('input', e => {
    state.chromaSpill = Number(e.target.value);
    state.chromaDirty = true;
    updateChromaValueLabels();
  });
  $('chromaPickBtn').addEventListener('click', () => setChromaPicking(!state.chromaPicking));
  $('chromaPlayBtn').addEventListener('click', () => {
    if (chromaVideo.paused) safePlay(chromaVideo); else chromaVideo.pause();
    setStatus(chromaVideo.paused ? 'top video paused' : 'top video playing');
  });
  $('chromaRestartBtn').addEventListener('click', () => {
    if (state.chromaVideoIndex < 0) return;
    chromaVideo.currentTime = 0;
    safePlay(chromaVideo);
    state.chromaDirty = true;
    setStatus('top video restarted');
  });
  $('chromaClearBtn').addEventListener('click', () => clearChromaVideo());
  $('audioInput').addEventListener('change', e => {
    const file=e.target.files[0]; if(!file)return;
    song.src=URL.createObjectURL(file); $('audioName').textContent=file.name; song.load(); setupAudioGraph(); setStatus(`song loaded: ${file.name}`);
  });
  $('logoInput').addEventListener('change', e=>{
    const file=e.target.files[0]; if(!file)return;
    const img=new Image(); img.onload=()=>{state.logo=img; state.logoX=.82; state.logoY=.84; setStatus('logo loaded — drag it on the output');}; img.src=URL.createObjectURL(file);
  });
  $('audioPlayBtn').addEventListener('click',()=>{setupAudioGraph(); if(song.paused)safePlay(song);else song.pause();});
  $('audioStopBtn').addEventListener('click',()=>{song.pause();song.currentTime=0;});
  $('audioSeek').addEventListener('input',()=>{if(song.duration)song.currentTime=Number($('audioSeek').value)/1000*song.duration;});
  song.addEventListener('timeupdate',()=>{$('audioTime').textContent=formatTime(song.currentTime);$('audioDuration').textContent=formatTime(song.duration); if(song.duration)$('audioSeek').value=Math.floor(song.currentTime/song.duration*1000);});
  sourceVideo.addEventListener('timeupdate', drawTimeline);
  sourceVideo.addEventListener('ended',()=>{sourceVideo.currentTime=0;safePlay(sourceVideo);});
  sourceVideo.addEventListener('play', () => { if (state.chromaSync && state.chromaVideoIndex >= 0) safePlay(chromaVideo); });
  sourceVideo.addEventListener('pause', () => { if (state.chromaSync && state.chromaVideoIndex >= 0) chromaVideo.pause(); });
  chromaVideo.addEventListener('seeked', () => { state.chromaDirty = true; });

  $('cueKeySelect').addEventListener('change',e=>{
    state.armedCue=e.target.value || null;
    updateCuePads();
    setStatus(state.armedCue ? `cue ${state.armedCue.toUpperCase()} selected` : 'cue selection cleared');
  });
  $('deselectCueBtn').addEventListener('click',()=>{
    state.armedCue=null;
    $('cueKeySelect').value='';
    updateCuePads();
    setStatus('cue selection cleared');
  });
  $('cueModeSelect').addEventListener('change',()=>updateCuePads());
  $('clearCuesBtn').addEventListener('click',()=>{state.cues=Object.fromEntries(cueKeys.map(k=>[k,null]));state.armedCue=null;$('cueKeySelect').value='';updateCuePads();drawTimeline();setStatus('all cues cleared');});

  timeline.addEventListener('pointerenter',()=>{state.hoverWasPlaying=!sourceVideo.paused;});
  timeline.addEventListener('pointermove',e=>{
    if (!sourceVideo.duration) return;
    const pos=timelinePosition(e); const time=pos.ratio*sourceVideo.duration;
    $('hoverTime').classList.remove('hidden'); $('hoverTime').style.left=`${pos.x}px`; $('hoverTime').textContent=formatTime(time,true);
    if($('hoverPlayToggle').checked){sourceVideo.currentTime=time;safePlay(sourceVideo);}
  });
  timeline.addEventListener('pointerleave',()=>{$('hoverTime').classList.add('hidden'); if(!state.hoverWasPlaying && $('hoverPlayToggle').checked)sourceVideo.pause();});
  timeline.addEventListener('click',e=>{
    if(!sourceVideo.duration||state.activeVideoIndex<0)return;
    const pos=timelinePosition(e); const time=pos.ratio*sourceVideo.duration;

    // A normal click only jumps playback. Shift + click creates a new hot cue.
    if(!e.shiftKey){
      sourceVideo.currentTime=time;
      safePlay(sourceVideo);
      setStatus(`video jumped to ${formatTime(time,true)} — hold shift and click to add a cue`);
      return;
    }

    // Shift-click automatically fills the next empty cue. If the user explicitly
    // selected a letter first, that one is replaced once and then deselected.
    const replacingSelectedCue = Boolean(state.armedCue);
    let key = state.armedCue || cueKeys.find(candidate => !state.cues[candidate]) || null;
    if(!key){
      setStatus('all scene slots are full — right-click a letter to remove it, or select one to replace it');
      return;
    }

    state.cues[key]={time,videoIndex:state.activeVideoIndex,mode:$('cueModeSelect').value};
    state.armedCue=null;
    $('cueKeySelect').value='';
    updateCuePads();
    drawTimeline();
    setStatus(`${replacingSelectedCue ? 'scene replaced' : 'hot cue added'}: ${key.toUpperCase()} at ${formatTime(time,true)} — shift-click again for the next letter`);
  });

  $('masterDistortion').addEventListener('input',e=>{state.master=Number(e.target.value);$('masterValue').textContent=`${Math.round(state.master*100)}%`;});
  $('audioReact').addEventListener('input',e=>{state.audioReact=Number(e.target.value);$('reactValue').textContent=`${Math.round(state.audioReact*100)}%`;});
  $('transitionDuration').addEventListener('input',e=>{state.transitionDuration=Number(e.target.value);$('transitionValue').textContent=`${state.transitionDuration.toFixed(2)}s`;});
  $('transitionStrength').addEventListener('input',e=>{state.transitionStrength=Number(e.target.value);$('transitionStrengthValue').textContent=`${Math.round(state.transitionStrength*100)}%`;});
  $('defaultTransitionSelect').addEventListener('change',e=>{
    state.defaultTransitionId=e.target.value;
    saveDefaultTransition();
    updateDefaultTransitionUI();
    const selected=transitions.find(tr=>tr.id===state.defaultTransitionId);
    setStatus(state.defaultTransitionId==='none'?'default cue transition: hard cut':`default cue transition: ${selected.name} (${displayKey(selected.key)})`);
  });
  $('resetTransitionKeysBtn').addEventListener('click',resetTransitionKeyMap);
  $('fxModeSelect').addEventListener('change',e=>{state.fxMode=e.target.value;});
  $('panicBtn').addEventListener('click',clearEffects); $('randomBtn').addEventListener('click',randomizeEffects);
  $('logoOpacity').addEventListener('input',e=>state.logoOpacity=Number(e.target.value));
  $('logoScale').addEventListener('input',e=>state.logoScale=Number(e.target.value));
  $('logoVisible').addEventListener('change',e=>state.logoVisible=e.target.checked);
  $('logoAffected').addEventListener('change',e=>state.logoAffected=e.target.checked);
  $('logoResetBtn').addEventListener('click',()=>{state.logoX=.82;state.logoY=.84;state.logoScale=.2;$('logoScale').value=.2;});

  canvas.addEventListener('pointerdown',e=>{
    if (sampleChromaColor(e)) return;
    const p=pointerToCanvas(e);
    const b=logoBounds();
    if(b&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h){state.draggingLogo=true;state.dragOffsetX=p.x-state.logoX*canvas.width;state.dragOffsetY=p.y-state.logoY*canvas.height;canvas.setPointerCapture(e.pointerId);return;}
    const frame = isFramePanelActive() ? getFraming() : null;
    if(frame){state.draggingFrame=true;state.frameDragStartX=p.x;state.frameDragStartY=p.y;state.frameDragOriginX=frame.x;state.frameDragOriginY=frame.y;canvas.classList.add('frame-dragging');canvas.setPointerCapture(e.pointerId);}
  });
  canvas.addEventListener('pointermove',e=>{
    const p=pointerToCanvas(e);
    if(state.draggingLogo){state.logoX=Math.max(0,Math.min(1,(p.x-state.dragOffsetX)/canvas.width));state.logoY=Math.max(0,Math.min(1,(p.y-state.dragOffsetY)/canvas.height));return;}
    if(!state.draggingFrame)return;
    const frame=getFraming();if(!frame)return;
    frame.x=Math.max(-1,Math.min(1,state.frameDragOriginX+(p.x-state.frameDragStartX)/canvas.width*2));
    frame.y=Math.max(-1,Math.min(1,state.frameDragOriginY+(p.y-state.frameDragStartY)/canvas.height*2));
    if(state.framingTarget==='top')state.chromaDirty=true;
    updateFramingUI();
  });
  const stopCanvasDrag=()=>{state.draggingLogo=false;state.draggingFrame=false;canvas.classList.remove('frame-dragging');};
  canvas.addEventListener('pointerup',stopCanvasDrag);
  canvas.addEventListener('pointercancel',stopCanvasDrag);

  $('themeSelect').addEventListener('change', e => applyTheme(e.target.value, true));
  $('aspectSelect').addEventListener('change',e=>setCanvasAspect(e.target.value));
  $('recordFormatSelect').addEventListener('change', e => {
    try { localStorage.setItem('distortion-record-format', e.target.value); } catch {}
    updateRecordingFormatNote();
  });
  $('recordQualitySelect').addEventListener('change', e => {
    try { localStorage.setItem('distortion-record-quality', e.target.value); } catch {}
    updateRecordingFormatNote();
  });
  $('recordBtn').addEventListener('click',startRecording); $('stopRecordBtn').addEventListener('click',stopRecording);
  $('fullscreenBtn').addEventListener('click',()=>{$('outputFrame').requestFullscreen?.();});
  $('detachBtn').addEventListener('click',openDetachedControls);
  $('keyMapBtn').addEventListener('click',showFxMapChoice);
  $('useDefaultMapBtn').addEventListener('click',()=>{applyFxKeyMap('default');closeFxMapSetup();});
  $('openCustomMapBtn').addEventListener('click',showCustomFxMapEditor);
  $('backToMapChoiceBtn').addEventListener('click',()=>{$('customMapEditor').classList.add('hidden');$('mapModeChoice').classList.remove('hidden');});
  $('clearCustomMapBtn').addEventListener('click',()=>{document.querySelectorAll('[data-fx-map-key]').forEach(select=>select.value='');setStatus('custom FX slots cleared — save to apply');});
  $('saveCustomMapBtn').addEventListener('click',()=>{
    const map=readCustomFxMapRows();
    Object.assign(savedCustomFxKeyMap,map);
    try{localStorage.setItem('distortion-custom-fx-map-v1',JSON.stringify(map));}catch{}
    applyFxKeyMap('custom',map);
    closeFxMapSetup();
  });
  $('startupMapDialog').addEventListener('cancel',e=>e.preventDefault());

  $('helpBtn').addEventListener('click',()=>$('helpDialog').showModal()); $('closeHelpBtn').addEventListener('click',()=>$('helpDialog').close());
  $('helpTabs').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(!tab)return;document.querySelectorAll('#helpTabs button').forEach(b=>b.classList.toggle('active',b===tab));document.querySelectorAll('[data-help]').forEach(s=>s.classList.toggle('active',s.dataset.help===tab.dataset.tab));});
  $('resetControlsBtn').addEventListener('click',resetPerformanceControls); $('resetProjectBtn').addEventListener('click',resetEntireProject);

  document.addEventListener('keydown',e=>{
    if($('startupMapDialog').open||$('helpDialog').open)return;
    const tag=document.activeElement?.tagName; if(['INPUT','SELECT','TEXTAREA'].includes(tag))return;
    const key=normalizeKey(e.key);
    if(key===' '){e.preventDefault();setupAudioGraph();if(song.paused)safePlay(song);else song.pause();return;}
    if(key==='f1'||key==='?'){e.preventDefault();$('helpDialog').showModal();return;}
    if(cueKeys.includes(key)){if(!e.repeat)triggerCue(key);return;}
    const fx=effectForPerformanceKey(key);if(fx&&!e.repeat){activateEffect(fx.id,state.fxMode==='latch');return;}
    const tr=transitions.find(t=>t.key===key);if(tr&&!e.repeat){triggerTransition(tr.id);return;}
  });
  document.addEventListener('keyup',e=>{
    const key=normalizeKey(e.key); if(cueKeys.includes(key))releaseCue(key);
    const fx=effectForPerformanceKey(key); if(fx&&state.fxMode==='hold')deactivateEffect(fx.id);
  });

  if ('BroadcastChannel' in window) {
    state.channel=new BroadcastChannel('distortion-control');
    state.channel.onmessage=e=>{
      const m=e.data;if(m.type!=='command')return;
      if(m.command==='cue')triggerCue(m.value,true);
      if(m.command==='fx'){if(state.activeEffects.has(m.value))state.activeEffects.delete(m.value);else state.activeEffects.add(m.value);updateFxButtons();}
      if(m.command==='audio'){$('audioPlayBtn').click();}
      if(m.command==='chroma-visible'){$('chromaVisible').click();}
      if(m.command==='chroma-play'){$('chromaPlayBtn').click();}
      if(m.command==='chroma-restart'){$('chromaRestartBtn').click();}
      if(m.command==='random')randomizeEffects();
      if(m.command==='panic')clearEffects();
      if(m.command==='record'){if(state.recorder&&state.recorder.state==='recording')stopRecording();else startRecording();}
    };
  }

  document.querySelectorAll('.panel-resizer').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      if (window.innerWidth <= 1100) return;
      e.preventDefault();
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      const side = handle.dataset.resize;
      const panel = side === 'left' ? document.querySelector('.media-panel') : document.querySelector('.fx-panel');
      const startX = e.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      const move = ev => {
        const delta = ev.clientX - startX;
        const width = side === 'left' ? startWidth + delta : startWidth - delta;
        panel.style.flexBasis = `${Math.max(side === 'left' ? 210 : 230, Math.min(window.innerWidth*.46, width))}px`;
        rebuildTimeline();
      };
      const stop = () => {
        handle.classList.remove('dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', stop);
        handle.removeEventListener('pointercancel', stop);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
    });
  });

  window.addEventListener('resize',rebuildTimeline);
  let initialTheme = 'studio';
  try { initialTheme = localStorage.getItem('distortion-theme') || 'studio'; } catch {}
  applyTheme(initialTheme);
  buildCuePads(); buildFxButtons(); setCanvasAspect('16:9'); initControlWindows(); refreshChromaVideoSelect(); updateChromaUI(); updateFramingUI(); setupRecordingFormatMenu(); rebuildTimeline(); requestAnimationFrame(renderFrame); requestAnimationFrame(showFxMapChoice);
})();
