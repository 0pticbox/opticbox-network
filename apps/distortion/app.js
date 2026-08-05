(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('outputCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const sourceVideo = $('sourceVideo');
  const song = $('song');
  const timeline = $('timelineCanvas');
  const tctx = timeline.getContext('2d');
  const bufferA = document.createElement('canvas');
  const bufferB = document.createElement('canvas');
  const bctxA = bufferA.getContext('2d');
  const bctxB = bufferB.getContext('2d');
  const pixelCanvas = document.createElement('canvas');
  const pctx = pixelCanvas.getContext('2d');

  const cueKeys = ['q','w','e','r','a','s','d','f','z','x','c','v'];
  const effects = [
    { id: 'vhs', name: 'VHS TRACKING', key: 'y' },
    { id: 'rgb', name: 'RGB SPLIT', key: 'u' },
    { id: 'liquid', name: 'LIQUID WARP', key: 'i' },
    { id: 'datamosh', name: 'DATAMOSH', key: 'o' },
    { id: 'tear', name: 'SCREEN TEAR', key: 'h' },
    { id: 'feedback', name: 'FEEDBACK', key: 'j' },
    { id: 'kaleido', name: 'KALEIDOSCOPE', key: 'k' },
    { id: 'lens', name: 'LENS WARP', key: 'l' },
    { id: 'pixel', name: 'PIXEL BREAK', key: '7' },
    { id: 'invert', name: 'SOLAR INVERT', key: '8' },
    { id: 'echo', name: 'FRAME ECHO', key: '9' },
    { id: 'scan', name: 'SCAN ROLL', key: '0' },
    { id: 'mirrorgrid', name: 'MIRROR GRID', key: '[' },
    { id: 'vortex', name: 'VORTEX SHREDDER', key: ']' },
    { id: 'slicer', name: 'RANDOM SLICER', key: ';' },
    { id: 'crush', name: 'COLOR CRUSH', key: "'" },
    { id: 'tunnel', name: 'INFINITE TUNNEL', key: ',' },
    { id: 'splitzoom', name: 'SPLIT ZOOM', key: '.' },
    { id: 'blocks', name: 'BLOCK DETONATOR', key: '/' },
    { id: 'strobe', name: 'NEGATIVE STROBE', key: '\\' }
  ];
  const transitions = [
    { id: 'flash', name: 'WHITE FLASH', key: '1' },
    { id: 'shake', name: 'IMPACT SHAKE', key: '2' },
    { id: 'zoom', name: 'ZOOM PUNCH', key: '3' },
    { id: 'freeze', name: 'FRAME FREEZE', key: '4' },
    { id: 'spin', name: 'SPIN CUT', key: '5' },
    { id: 'black', name: 'BLACK DROP', key: '6' }
  ];

  const state = {
    videos: [],
    activeVideoIndex: -1,
    cues: Object.fromEntries(cueKeys.map(k => [k, null])),
    activeEffects: new Set(),
    heldEffects: new Set(),
    armedCue: null,
    fxMode: 'hold',
    master: 0.45,
    audioReact: 0.35,
    transitionDuration: 0.12,
    transition: null,
    hoverWasPlaying: false,
    logo: null,
    logoX: 0.82,
    logoY: 0.84,
    logoScale: 0.2,
    logoOpacity: 0.9,
    logoVisible: true,
    logoAffected: false,
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
    feedbackReady: false
  };

  function setStatus(text) {
    $('statusText').textContent = text.toUpperCase();
    if (state.channel) state.channel.postMessage({ type: 'status', text });
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
    state.feedbackReady = false;
  }

  function drawCover(targetCtx, media, w, h, dx = 0, dy = 0, scale = 1, rotation = 0) {
    const sw = media.videoWidth || media.naturalWidth || w;
    const sh = media.videoHeight || media.naturalHeight || h;
    if (!sw || !sh) return;
    const sourceRatio = sw / sh;
    const targetRatio = w / h;
    let dw, dh;
    if (sourceRatio > targetRatio) { dh = h * scale; dw = dh * sourceRatio; }
    else { dw = w * scale; dh = dw / sourceRatio; }
    targetCtx.save();
    targetCtx.translate(w / 2 + dx, h / 2 + dy);
    targetCtx.rotate(rotation);
    targetCtx.drawImage(media, -dw / 2, -dh / 2, dw, dh);
    targetCtx.restore();
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
        if (state.transition.id === 'shake') { shakeX = (Math.random()-.5)*32*s; shakeY = (Math.random()-.5)*22*s; }
        if (state.transition.id === 'zoom') zoom = 1 + .28*s;
        if (state.transition.id === 'spin') rotation = s * .18;
        if (p >= 1) state.transition = null;
      }
      drawCover(bctxA, sourceVideo, w, h, shakeX, shakeY, zoom, rotation);
      if (state.logoAffected) drawLogo(bctxA);
    }

    let srcCanvas = bufferA;
    let outCtx = bctxB;
    const active = state.activeEffects;

    if (active.has('liquid')) { applyLiquid(srcCanvas, outCtx, amount, now); srcCanvas = bufferB; outCtx = bctxA; }
    if (active.has('datamosh') || active.has('tear')) { applyGlitch(srcCanvas, outCtx, amount, now); srcCanvas = outCtx.canvas; outCtx = srcCanvas === bufferA ? bctxB : bctxA; }
    if (active.has('kaleido')) { applyKaleido(srcCanvas, outCtx, amount); srcCanvas = outCtx.canvas; outCtx = srcCanvas === bufferA ? bctxB : bctxA; }

    ctx.save();
    ctx.fillStyle = '#000';
    if (!active.has('feedback') && !active.has('echo')) ctx.fillRect(0,0,w,h);
    else {
      ctx.globalAlpha = active.has('feedback') ? 0.86 - amount * .18 : 0.72;
      ctx.drawImage(canvas, -w*.01*amount, -h*.01*amount, w*(1+.02*amount), h*(1+.02*amount));
      ctx.globalAlpha = 1;
    }

    if (active.has('pixel')) {
      const pw = Math.max(40, Math.floor(w * (0.18 - amount * .12)));
      const ph = Math.max(24, Math.floor(h * (0.18 - amount * .12)));
      pixelCanvas.width = pw; pixelCanvas.height = ph;
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(srcCanvas,0,0,pw,ph);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixelCanvas,0,0,w,h);
      ctx.imageSmoothingEnabled = true;
    } else if (active.has('lens')) {
      const strips = 40;
      const sh = h / strips;
      for (let i=0;i<strips;i++) {
        const y = i*sh;
        const center = Math.abs((i/(strips-1))-.5)*2;
        const expand = (1-center*center) * 80 * amount;
        ctx.drawImage(srcCanvas,0,y,w,sh,-expand/2,y,w+expand,sh+1);
      }
    } else {
      ctx.drawImage(srcCanvas,0,0);
    }

    if (active.has('rgb')) {
      const shift = 4 + 26 * amount;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .35;
      ctx.filter = 'hue-rotate(100deg) saturate(2)';
      ctx.drawImage(srcCanvas, shift, 0);
      ctx.filter = 'hue-rotate(250deg) saturate(2)';
      ctx.drawImage(srcCanvas, -shift, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (active.has('invert')) ctx.filter = 'invert(1) contrast(1.35) saturate(1.7)';
    if (active.has('invert')) { ctx.globalAlpha=.35+.35*amount; ctx.drawImage(srcCanvas,0,0); ctx.globalAlpha=1; ctx.filter='none'; }

    if (active.has('mirrorgrid')) {
      const cols = 3, rows = 3, cw = w/cols, ch = h/rows;
      ctx.clearRect(0,0,w,h);
      for (let gy=0; gy<rows; gy++) for (let gx=0; gx<cols; gx++) {
        ctx.save(); ctx.beginPath(); ctx.rect(gx*cw,gy*ch,cw,ch); ctx.clip();
        ctx.translate(gx*cw+cw/2,gy*ch+ch/2);
        ctx.scale(gx%2 ? -1 : 1, gy%2 ? -1 : 1);
        const z=1.15+amount*.6; ctx.drawImage(srcCanvas,-cw*z/2,-ch*z/2,cw*z,ch*z); ctx.restore();
      }
    }
    if (active.has('vortex')) {
      ctx.globalAlpha=.45; ctx.globalCompositeOperation='screen';
      for (let n=1;n<=5;n++){ ctx.save(); ctx.translate(w/2,h/2); ctx.rotate((now*.0015+n*.45)*amount); const z=1-n*.055*amount; ctx.scale(z,z); ctx.drawImage(srcCanvas,-w/2,-h/2); ctx.restore(); }
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
    }
    if (active.has('slicer')) {
      const slices=18; for(let n=0;n<slices;n++){ const sy=n*h/slices; const sh=h/slices+2; const jump=((n%3)-1)*70*amount + Math.sin(now*.01+n)*35*amount; ctx.drawImage(srcCanvas,0,sy,w,sh,jump,sy,w,sh); }
    }
    if (active.has('crush')) {
      ctx.globalAlpha=.72; ctx.filter=`contrast(${1.8+amount*3}) saturate(${2+amount*5}) brightness(${.8+amount*.4})`; ctx.drawImage(srcCanvas,0,0); ctx.filter='none'; ctx.globalAlpha=1;
    }
    if (active.has('tunnel')) {
      ctx.globalCompositeOperation='screen';
      for(let n=1;n<=7;n++){ const z=1-n*.085*amount; const rot=(n%2?-1:1)*n*.025*amount; ctx.save(); ctx.globalAlpha=.14; ctx.translate(w/2,h/2); ctx.rotate(rot); ctx.scale(z,z); ctx.drawImage(srcCanvas,-w/2,-h/2); ctx.restore(); }
      ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
    }
    if (active.has('splitzoom')) {
      const pulse=.08+amount*.2; ctx.save(); ctx.beginPath(); ctx.rect(0,0,w/2,h); ctx.clip(); ctx.drawImage(srcCanvas,-w*pulse/2,-h*pulse/2,w*(1+pulse),h*(1+pulse)); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(w/2,0,w/2,h); ctx.clip(); ctx.drawImage(srcCanvas,w*pulse/2,h*pulse/2,w*(1-pulse),h*(1-pulse)); ctx.restore();
    }
    if (active.has('blocks')) {
      const size=Math.max(28,90-amount*55); for(let n=0;n<22;n++){ const sx=Math.floor(Math.random()*w/size)*size, sy=Math.floor(Math.random()*h/size)*size; const dx=sx+(Math.random()-.5)*180*amount, dy=sy+(Math.random()-.5)*130*amount; ctx.drawImage(srcCanvas,sx,sy,size,size,dx,dy,size,size); }
    }
    if (active.has('strobe') && Math.floor(now/55)%2===0) { ctx.globalCompositeOperation='difference'; ctx.fillStyle='white'; ctx.fillRect(0,0,w,h); ctx.globalCompositeOperation='source-over'; }

    if (active.has('vhs') || active.has('scan')) {
      ctx.globalAlpha = .18 + amount * .18;
      ctx.fillStyle = '#000';
      const offset = active.has('scan') ? Math.floor((now*.2) % 18) : 0;
      for (let y=offset;y<h;y+=6) ctx.fillRect(0,y,w,2);
      ctx.globalAlpha = 1;
      if (active.has('vhs') && Math.random() < .18 + amount*.3) {
        const y = Math.random()*h, hh = 4 + Math.random()*22;
        ctx.drawImage(canvas,0,y,w,hh,(Math.random()-.5)*70*amount,y,w,hh);
      }
    }

    if (!state.logoAffected) drawLogo(ctx);

    if (state.transition) {
      const p = Math.min(1, (now - state.transition.started) / (state.transitionDuration * 1000));
      const s = Math.pow(1-p, 2.4);
      if (state.transition.id === 'flash') { ctx.fillStyle=`rgba(255,255,255,${s*.85})`; ctx.fillRect(0,0,w,h); }
      if (state.transition.id === 'black') { ctx.fillStyle=`rgba(0,0,0,${s*.9})`; ctx.fillRect(0,0,w,h); }
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
      tctx.fillStyle = '#58636b'; tctx.font = '12px Consolas'; tctx.fillText('NO ACTIVE VIDEO', 12, 52); return;
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
      tctx.fillStyle = '#00ef9a'; tctx.font = 'bold 12px Consolas'; tctx.fillText(key.toUpperCase(),x-4,20);
    }
  }

  function buildCuePads() {
    $('cueKeySelect').innerHTML = `<option value="">NO CUE SELECTED</option>` + cueKeys.map(k => `<option value="${k}">${k.toUpperCase()}</option>`).join('');
    $('cueKeySelect').value = state.armedCue || '';
    $('cuePads').innerHTML = '';
    cueKeys.forEach(key => {
      const b = document.createElement('button');
      b.className = 'cue-pad'; b.dataset.key = key;
      b.addEventListener('click', () => triggerCue(key, true));
      $('cuePads').appendChild(b);
    });
    updateCuePads();
  }

  function updateCuePads() {
    document.querySelectorAll('.cue-pad').forEach(pad => {
      const key = pad.dataset.key;
      const cue = state.cues[key];
      pad.classList.toggle('armed', key === state.armedCue);
      pad.innerHTML = `<div class="cue-key">${key.toUpperCase()}</div><div class="cue-time">${cue ? formatTime(cue.time,true) : 'EMPTY'}</div><div class="cue-mode">${cue ? cue.mode.toUpperCase() : 'SHIFT + CLICK TIMELINE'}</div>`;
    });
  }

  function buildFxButtons() {
    $('fxButtons').innerHTML = '';
    effects.forEach(fx => {
      const b = document.createElement('button');
      b.className = 'fx-btn'; b.dataset.fx = fx.id;
      b.innerHTML = `<strong>${fx.name}</strong><span>${fx.key.toUpperCase()}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); activateEffect(fx.id, true); });
      b.addEventListener('pointerup', () => deactivateEffect(fx.id));
      b.addEventListener('pointerleave', () => { if (state.fxMode === 'hold') deactivateEffect(fx.id); });
      $('fxButtons').appendChild(b);
    });
    $('transitionButtons').innerHTML = '';
    transitions.forEach(tr => {
      const b = document.createElement('button');
      b.className = 'fx-btn'; b.innerHTML = `<strong>${tr.name}</strong><span>${tr.key}</span>`;
      b.dataset.transition = tr.id;
      b.addEventListener('click', () => triggerTransition(tr.id));
      $('transitionButtons').appendChild(b);
    });
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
    state.transition = { id, started: performance.now() };
    const btn = document.querySelector(`[data-transition="${id}"]`);
    if (btn) { btn.classList.remove('snap-hit'); void btn.offsetWidth; btn.classList.add('snap-hit'); setTimeout(()=>btn.classList.remove('snap-hit'),140); }
    if (id === 'freeze') {
      state.freezeFrame = true;
      setTimeout(() => { state.freezeFrame = false; }, state.transitionDuration*1000);
    }
    setStatus(`${id} transition`);
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
      drawTimeline(); updateCuePads(); setStatus(`video loaded: ${state.videos[index].name}`);
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
      triggerTransition('zoom');
      setStatus(`cue ${key.toUpperCase()} — ${formatTime(cue.time,true)}`);
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
      setupAudioGraph();
      const canvasStream = canvas.captureStream(60);
      const tracks = [...canvasStream.getVideoTracks()];
      if (state.audioDest) tracks.push(...state.audioDest.stream.getAudioTracks());
      const stream = new MediaStream(tracks);
      const candidates = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
      const mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
      state.recordedChunks = [];
      state.recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12000000 } : undefined);
      state.recorder.ondataavailable = e => { if (e.data.size) state.recordedChunks.push(e.data); };
      state.recorder.onstop = () => {
        const blob = new Blob(state.recordedChunks,{type:state.recorder.mimeType||'video/webm'});
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`distortion-performance-${Date.now()}.webm`; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      };
      state.recorder.start(1000);
      state.recordStartedAt=Date.now();
      $('recordBtn').disabled=true; $('stopRecordBtn').disabled=false; $('recordBadge').classList.remove('hidden');
      state.recordTimer=setInterval(()=>{$('recordTimer').textContent=formatTime((Date.now()-state.recordStartedAt)/1000);},250);
      setStatus('recording started');
    } catch (err) { console.error(err); alert(`Recording could not start: ${err.message}`); setStatus('recording failed'); }
  }

  function stopRecording() {
    if (!state.recorder || state.recorder.state === 'inactive') return;
    state.recorder.stop(); clearInterval(state.recordTimer); state.recordTimer=null;
    $('recordBtn').disabled=false; $('stopRecordBtn').disabled=true; $('recordBadge').classList.add('hidden');
    setStatus('recording saved');
  }

  function openDetachedControls() {
    const win = window.open('', 'DISTORTION_CONTROLS', 'width=460,height=820,resizable=yes');
    if (!win) { alert('The detached controls window was blocked. Allow pop-ups for this page.'); return; }
    state.detachedWindow = win;
    const fxMarkup = effects.map(f=>`<button data-command="fx" data-value="${f.id}">${f.key.toUpperCase()}<small>${f.name}</small></button>`).join('');
    const cueMarkup = cueKeys.map(k=>`<button data-command="cue" data-value="${k}">${k.toUpperCase()}<small>HOT CUE</small></button>`).join('');
    win.document.open();
    win.document.write(`<!doctype html><html><head><title>DISTORTION Controls</title><style>
      body{margin:0;background:#090b0d;color:#e9f0f3;font-family:Consolas,monospace;padding:12px}h1{letter-spacing:.14em;margin:0 0 4px}p{color:#8e9ba3;margin:0 0 14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}button{min-height:58px;background:#11171b;color:#e9f0f3;border:1px solid #3d4850;font:inherit}button:hover{border-color:#00ef9a}small{display:block;color:#8e9ba3;font-size:8px;margin-top:5px}.wide{width:100%;margin-bottom:6px}.status{border:1px solid #313b43;padding:9px;color:#00ef9a;margin:8px 0 12px}</style></head><body>
      <h1>DISTORTION</h1><p>DETACHED PERFORMANCE CONTROL</p><div id="status" class="status">CONNECTED</div>
      <h3>HOT CUES</h3><div class="grid">${cueMarkup}</div>
      <h3>DISTORTION</h3><div class="grid">${fxMarkup}</div>
      <button class="wide" data-command="audio">PLAY / PAUSE SONG</button>
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
    clearEffects(); state.master=.45; state.audioReact=.35; state.transitionDuration=.12; state.fxMode='hold';
    $('masterDistortion').value=.45; $('audioReact').value=.35; $('transitionDuration').value=.12; $('fxModeSelect').value='hold';
    $('masterValue').textContent='45%'; $('reactValue').textContent='35%'; $('transitionValue').textContent='0.12s';
    setStatus('performance controls reset');
  }

  function resetEntireProject() {
    if (!confirm('Clear all loaded media, cue points, effects, and logo settings?')) return;
    state.videos.forEach(v=>URL.revokeObjectURL(v.url));
    state.videos=[]; state.activeVideoIndex=-1; sourceVideo.removeAttribute('src'); sourceVideo.load(); song.removeAttribute('src'); song.load();
    state.cues=Object.fromEntries(cueKeys.map(k=>[k,null])); state.logo=null; clearEffects();
    $('videoLibrary').innerHTML=''; $('audioName').textContent='NO SONG LOADED'; $('dropHint').classList.remove('hidden'); updateCuePads(); drawTimeline();
    setStatus('project reset');
  }

  // Inputs
  $('videoInput').addEventListener('change', e => addVideos(e.target.files));
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

    let key = state.armedCue && !state.cues[state.armedCue] ? state.armedCue : null;
    if(!key) key = cueKeys.find(candidate => !state.cues[candidate]) || null;
    if(!key){
      setStatus('all hot cue slots are full — clear a cue before adding another');
      return;
    }

    state.cues[key]={time,videoIndex:state.activeVideoIndex,mode:$('cueModeSelect').value};
    state.armedCue=key;
    $('cueKeySelect').value=key;
    updateCuePads();drawTimeline();setStatus(`new cue ${key.toUpperCase()} set at ${formatTime(time,true)}`);
  });

  $('masterDistortion').addEventListener('input',e=>{state.master=Number(e.target.value);$('masterValue').textContent=`${Math.round(state.master*100)}%`;});
  $('audioReact').addEventListener('input',e=>{state.audioReact=Number(e.target.value);$('reactValue').textContent=`${Math.round(state.audioReact*100)}%`;});
  $('transitionDuration').addEventListener('input',e=>{state.transitionDuration=Number(e.target.value);$('transitionValue').textContent=`${state.transitionDuration.toFixed(2)}s`;});
  $('fxModeSelect').addEventListener('change',e=>{state.fxMode=e.target.value;});
  $('panicBtn').addEventListener('click',clearEffects); $('randomBtn').addEventListener('click',randomizeEffects);
  $('logoOpacity').addEventListener('input',e=>state.logoOpacity=Number(e.target.value));
  $('logoScale').addEventListener('input',e=>state.logoScale=Number(e.target.value));
  $('logoVisible').addEventListener('change',e=>state.logoVisible=e.target.checked);
  $('logoAffected').addEventListener('change',e=>state.logoAffected=e.target.checked);
  $('logoResetBtn').addEventListener('click',()=>{state.logoX=.82;state.logoY=.84;state.logoScale=.2;$('logoScale').value=.2;});

  canvas.addEventListener('pointerdown',e=>{const b=logoBounds();if(!b)return;const p=pointerToCanvas(e);if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h){state.draggingLogo=true;state.dragOffsetX=p.x-state.logoX*canvas.width;state.dragOffsetY=p.y-state.logoY*canvas.height;canvas.setPointerCapture(e.pointerId);}});
  canvas.addEventListener('pointermove',e=>{if(!state.draggingLogo)return;const p=pointerToCanvas(e);state.logoX=Math.max(0,Math.min(1,(p.x-state.dragOffsetX)/canvas.width));state.logoY=Math.max(0,Math.min(1,(p.y-state.dragOffsetY)/canvas.height));});
  canvas.addEventListener('pointerup',()=>state.draggingLogo=false);

  $('aspectSelect').addEventListener('change',e=>setCanvasAspect(e.target.value));
  $('recordBtn').addEventListener('click',startRecording); $('stopRecordBtn').addEventListener('click',stopRecording);
  $('fullscreenBtn').addEventListener('click',()=>{$('outputFrame').requestFullscreen?.();});
  $('detachBtn').addEventListener('click',openDetachedControls);

  $('helpBtn').addEventListener('click',()=>$('helpDialog').showModal()); $('closeHelpBtn').addEventListener('click',()=>$('helpDialog').close());
  $('helpTabs').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(!tab)return;document.querySelectorAll('#helpTabs button').forEach(b=>b.classList.toggle('active',b===tab));document.querySelectorAll('[data-help]').forEach(s=>s.classList.toggle('active',s.dataset.help===tab.dataset.tab));});
  $('resetControlsBtn').addEventListener('click',resetPerformanceControls); $('resetProjectBtn').addEventListener('click',resetEntireProject);

  document.addEventListener('keydown',e=>{
    const tag=document.activeElement?.tagName; if(['INPUT','SELECT','TEXTAREA'].includes(tag))return;
    const key=e.key.toLowerCase();
    if(key===' '){e.preventDefault();setupAudioGraph();if(song.paused)safePlay(song);else song.pause();return;}
    if(key==='f1'||key==='?'){e.preventDefault();$('helpDialog').showModal();return;}
    if(cueKeys.includes(key)){if(!e.repeat)triggerCue(key);return;}
    const fx=effects.find(f=>f.key===key);if(fx&&!e.repeat){activateEffect(fx.id,state.fxMode==='latch');return;}
    const tr=transitions.find(t=>t.key===key);if(tr&&!e.repeat){triggerTransition(tr.id);return;}
  });
  document.addEventListener('keyup',e=>{
    const key=e.key.toLowerCase(); if(cueKeys.includes(key))releaseCue(key);
    const fx=effects.find(f=>f.key===key); if(fx&&state.fxMode==='hold')deactivateEffect(fx.id);
  });

  if ('BroadcastChannel' in window) {
    state.channel=new BroadcastChannel('distortion-control');
    state.channel.onmessage=e=>{
      const m=e.data;if(m.type!=='command')return;
      if(m.command==='cue')triggerCue(m.value,true);
      if(m.command==='fx'){if(state.activeEffects.has(m.value))state.activeEffects.delete(m.value);else state.activeEffects.add(m.value);updateFxButtons();}
      if(m.command==='audio'){$('audioPlayBtn').click();}
      if(m.command==='random')randomizeEffects();
      if(m.command==='panic')clearEffects();
      if(m.command==='record'){if(state.recorder&&state.recorder.state==='recording')stopRecording();else startRecording();}
    };
  }

  window.addEventListener('resize',rebuildTimeline);
  buildCuePads(); buildFxButtons(); setCanvasAspect('16:9'); rebuildTimeline(); requestAnimationFrame(renderFrame);
})();
