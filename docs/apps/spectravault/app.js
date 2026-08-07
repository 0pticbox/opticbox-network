(() => {
  'use strict';

  const canvas = document.getElementById('visualCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const stageWrap = document.getElementById('stageWrap');
  const stageHint = document.getElementById('stageHint');
  const statusText = document.getElementById('statusText');
  const fpsReadout = document.getElementById('fpsReadout');
  const audioMeterFill = document.getElementById('audioMeterFill');
  const presetSelect = document.getElementById('presetSelect');
  const sensitivityInput = document.getElementById('sensitivityInput');
  const motionInput = document.getElementById('motionInput');
  const feedbackInput = document.getElementById('feedbackInput');
  const logoSizeInput = document.getElementById('logoSizeInput');
  const logoOpacityInput = document.getElementById('logoOpacityInput');
  const logoSpinInput = document.getElementById('logoSpinInput');
  const recordTimer = document.getElementById('recordTimer');
  const recordState = document.getElementById('recordState');
  const recordBtn = document.getElementById('recordBtn');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  const resolutionSelect = document.getElementById('resolutionSelect');
  const audioPlayer = document.getElementById('audioPlayer');
  const visualsTab = document.getElementById('visualsTab');
  const helpTab = document.getElementById('helpTab');
  const navTabs = document.querySelectorAll('.nav-tab');
  const themeButtons = document.querySelectorAll('[data-theme-choice]');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const flowToggleBtn = document.getElementById('flowToggleBtn');
  const autoFeedbackBtn = document.getElementById('autoFeedbackBtn');
  const pipBtn = document.getElementById('pipBtn');
  const pipVideo = document.getElementById('pipVideo');

  const corePresets = ['kaleido', 'tunnel', 'water', 'scope', 'aurora', 'rings', 'matrix', 'pyramid'];

  let audioContext = null;
  let analyser = null;
  let frequencyData = new Uint8Array(256);
  let waveformData = new Uint8Array(512);
  let audioSourceNode = null;
  let audioInputStream = null;
  let mediaElementSource = null;
  let recordDestination = null;
  let monitorGain = null;

  let mediaRecorder = null;
  let recordedChunks = [];
  let recordStartedAt = 0;
  let recordTimerInterval = null;
  let isRecording = false;

  let logoImage = null;
  let logoX = 0.5;
  let logoY = 0.5;
  let logoRotation = 0;
  let draggingLogo = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const activeFx = new Set();
  const particles = [];
  let previousFrame = document.createElement('canvas');
  let previousCtx = previousFrame.getContext('2d');
  let pixelBuffer = document.createElement('canvas');
  let pixelCtx = pixelBuffer.getContext('2d');
  let fxBuffer = document.createElement('canvas');
  let fxCtx = fxBuffer.getContext('2d');

  let pipStream = null;

  let autoFlowEnabled = true;
  let autoFeedbackEnabled = true;
  let autoFeedbackTarget = Number(feedbackInput.value);
  let nextFeedbackChangeAt = 0;

  let lastTime = performance.now();
  let fpsTime = lastTime;
  let fpsFrames = 0;
  let elapsed = 0;
  let bass = 0;
  let mids = 0;
  let treble = 0;
  let level = 0;
  let recentFps = 60;
  let pulseRingsQuality = 1;
  let pulseRingsQualityHold = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setStatus(message) {
    statusText.textContent = message.toUpperCase();
  }

  function applyTheme(theme, announce = true) {
    const selectedTheme = theme === 'rave' ? 'rave' : 'chrome';
    document.body.dataset.theme = selectedTheme;
    themeButtons.forEach(button => {
      const active = button.dataset.themeChoice === selectedTheme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (themeColorMeta) {
      themeColorMeta.content = selectedTheme === 'rave' ? '#160d1b' : '#0b0a18';
    }
    try { localStorage.setItem('spectravault-theme', selectedTheme); } catch (_) {}
    if (announce) setStatus(selectedTheme === 'rave' ? 'RAVE WORM THEME' : 'CHROME BUBBLE THEME');
  }

  function showTab(tabName) {
    const showHelp = tabName === 'help';
    visualsTab.classList.toggle('active', !showHelp);
    helpTab.classList.toggle('active', showHelp);
    helpTab.setAttribute('aria-hidden', String(!showHelp));
    navTabs.forEach(button => {
      const selected = button.dataset.tab === tabName;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    setStatus(showHelp ? 'HELP OPEN' : 'READY');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setToggleButtonState(button, enabled, onLabel, offLabel) {
    if (!button) return;
    button.classList.toggle('active', enabled);
    button.textContent = enabled ? onLabel : offLabel;
  }

  function syncAutomationButtons() {
    setToggleButtonState(flowToggleBtn, autoFlowEnabled, 'AUTO FLOW: ON', 'AUTO FLOW: OFF');
    setToggleButtonState(autoFeedbackBtn, autoFeedbackEnabled, 'AUTO FEEDBACK: ON', 'AUTO FEEDBACK: OFF');
  }

  function applyResolution(value) {
    const [w, h] = value.split('x').map(Number);
    canvas.width = w;
    canvas.height = h;
    previousFrame.width = w;
    previousFrame.height = h;
    pixelBuffer.width = Math.max(48, Math.round(w / 18));
    pixelBuffer.height = Math.max(27, Math.round(h / 18));
    fxBuffer.width = w;
    fxBuffer.height = h;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }

  async function ensureAudioGraph() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
      waveformData = new Uint8Array(analyser.fftSize);
      recordDestination = audioContext.createMediaStreamDestination();
      monitorGain = audioContext.createGain();
      monitorGain.gain.value = 0;
      analyser.connect(recordDestination);
      analyser.connect(monitorGain);
      monitorGain.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
  }

  function disconnectCurrentAudio() {
    try { audioSourceNode?.disconnect(); } catch (_) {}
    audioSourceNode = null;
    if (audioInputStream) {
      audioInputStream.getTracks().forEach(track => track.stop());
      audioInputStream = null;
    }
    audioPlayer.pause();
    audioPlayer.removeAttribute('src');
    audioPlayer.load();
    setStatus('AUDIO STOPPED');
    stageHint.style.display = 'block';
  }

  function connectSource(node, alsoToSpeakers = false) {
    audioSourceNode = node;
    node.connect(analyser);
    if (monitorGain) monitorGain.gain.value = alsoToSpeakers ? 1 : 0;
    stageHint.style.display = 'none';
  }

  function syncPipButtonState(active = false) {
    if (!pipBtn) return;
    pipBtn.classList.toggle('active', active);
    pipBtn.textContent = active ? 'EXIT PIP' : 'PICTURE IN PICTURE';
  }

  function ensurePipStream() {
    if (!pipVideo) return null;
    if (!pipStream) {
      pipStream = canvas.captureStream(60);
      pipVideo.srcObject = pipStream;
      pipVideo.muted = true;
      pipVideo.playsInline = true;
    }
    return pipStream;
  }

  async function togglePictureInPicture() {
    if (!pipVideo || !document.pictureInPictureEnabled || typeof pipVideo.requestPictureInPicture !== 'function') {
      setStatus('PIP UNSUPPORTED');
      alert('Picture-in-Picture is not supported in this browser for the visual canvas. Try a current Chrome, Edge, or Safari build.');
      return;
    }

    try {
      ensurePipStream();
      if (document.pictureInPictureElement === pipVideo) {
        await document.exitPictureInPicture();
        return;
      }
      await pipVideo.play().catch(() => {});
      await pipVideo.requestPictureInPicture();
      setStatus('PIP ACTIVE');
    } catch (error) {
      console.error(error);
      setStatus('PIP FAILED');
    }
  }

  async function startMic() {
    try {
      disconnectCurrentAudio();
      await ensureAudioGraph();
      audioInputStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false
      });
      connectSource(audioContext.createMediaStreamSource(audioInputStream), false);
      setStatus('MIC LIVE');
    } catch (error) {
      console.error(error);
      setStatus('MIC BLOCKED');
      alert('Microphone access was not available. Check the browser permission and try again.');
    }
  }

  async function startDesktopAudio() {
    try {
      disconnectCurrentAudio();
      await ensureAudioGraph();
      audioInputStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = audioInputStream.getAudioTracks();
      if (!audioTracks.length) {
        audioInputStream.getTracks().forEach(track => track.stop());
        audioInputStream = null;
        setStatus('NO SHARED AUDIO');
        alert('No audio track was shared. Choose a browser tab or screen and enable “Share audio.”');
        return;
      }
      connectSource(audioContext.createMediaStreamSource(audioInputStream), false);
      setStatus('DESKTOP AUDIO LIVE');
    } catch (error) {
      console.error(error);
      setStatus('SHARE CANCELLED');
    }
  }

  async function loadAudioFile(file) {
    if (!file) return;
    try {
      disconnectCurrentAudio();
      await ensureAudioGraph();
      const url = URL.createObjectURL(file);
      audioPlayer.src = url;
      audioPlayer.hidden = false;
      if (!mediaElementSource) mediaElementSource = audioContext.createMediaElementSource(audioPlayer);
      connectSource(mediaElementSource, true);
      await audioPlayer.play();
      setStatus(`PLAYING ${file.name}`);
    } catch (error) {
      console.error(error);
      setStatus('FILE ERROR');
      alert('The selected audio file could not be played.');
    }
  }

  function averageRange(array, startRatio, endRatio) {
    const start = Math.floor(array.length * startRatio);
    const end = Math.max(start + 1, Math.floor(array.length * endRatio));
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += array[i];
    return (sum / (end - start)) / 255;
  }

  function updateAudioData() {
    if (!analyser) {
      bass *= 0.93;
      mids *= 0.93;
      treble *= 0.93;
      level *= 0.93;
      return;
    }
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(waveformData);
    const sensitivity = Number(sensitivityInput.value);
    bass = Math.min(1.8, averageRange(frequencyData, 0.0, 0.08) * sensitivity);
    mids = Math.min(1.8, averageRange(frequencyData, 0.08, 0.35) * sensitivity);
    treble = Math.min(1.8, averageRange(frequencyData, 0.35, 0.95) * sensitivity);
    level = Math.min(1.8, (bass * 0.48 + mids * 0.34 + treble * 0.18));
    audioMeterFill.style.width = `${Math.min(100, level * 75)}%`;
  }

  function clearBase(feedback) {
    const w = canvas.width;
    const h = canvas.height;
    if (feedback > 0.001) {
      ctx.save();
      ctx.globalAlpha = feedback;
      ctx.translate(w / 2, h / 2);
      const zoom = 1.005 + bass * 0.012;
      ctx.scale(zoom, zoom);
      ctx.rotate(Math.sin(elapsed * 0.00022) * 0.004 * Number(motionInput.value));
      ctx.drawImage(previousFrame, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.03, 1 - feedback)})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
  }

  function spectrumValue(i, count) {
    if (!frequencyData.length) return 0;
    const index = Math.min(frequencyData.length - 1, Math.floor((i / count) * frequencyData.length * 0.8));
    return frequencyData[index] / 255;
  }

  function drawKaleido() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const slices = 12;
    const rings = 58;
    const motion = Number(motionInput.value);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < slices; s += 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((Math.PI * 2 * s) / slices + elapsed * 0.00008 * motion);
      if (s % 2) ctx.scale(1, -1);
      for (let i = 0; i < rings; i += 1) {
        const amp = spectrumValue(i, rings);
        const r = (i / rings) * Math.min(w, h) * (0.58 + bass * 0.09);
        const a = elapsed * 0.0008 * motion + i * 0.34;
        const x = Math.cos(a) * r + Math.sin(a * 1.7) * 18 * amp;
        const y = Math.sin(a * 0.63) * r * 0.32;
        const size = 2 + amp * 20 + bass * 4;
        const hue = (i * 8 + elapsed * 0.04 + s * 12) % 360;
        ctx.fillStyle = `hsla(${hue},100%,${52 + amp * 30}%,${0.08 + amp * 0.25})`;
        ctx.fillRect(x, y, size, size * (0.4 + treble));
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTunnel() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const motion = Number(motionInput.value);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    const rings = 42;
    for (let i = rings; i >= 0; i -= 1) {
      const z = ((i / rings) + (elapsed * 0.00013 * motion)) % 1;
      const radius = Math.pow(z, 2.2) * Math.max(w, h) * 0.64;
      const amp = spectrumValue(i, rings);
      const sides = 5 + Math.floor(mids * 5);
      const spin = elapsed * 0.0003 * motion + i * 0.08;
      ctx.beginPath();
      for (let p = 0; p <= sides; p += 1) {
        const angle = (p / sides) * Math.PI * 2 + spin;
        const wobble = 1 + Math.sin(angle * 3 + elapsed * 0.002) * 0.08 * (1 + amp);
        const x = Math.cos(angle) * radius * wobble;
        const y = Math.sin(angle) * radius * wobble * (0.68 + treble * 0.2);
        if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const hue = (elapsed * 0.035 + i * 11) % 360;
      ctx.strokeStyle = `hsla(${hue},100%,${52 + amp * 28}%,${0.05 + (1 - z) * 0.55})`;
      ctx.lineWidth = 1 + amp * 5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScope() {
    const w = canvas.width;
    const h = canvas.height;
    const motion = Number(motionInput.value);
    const cubeSize = Math.min(w, h) * 0.22;
    const vertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    function rotatePoint(x, y, z, ax, ay, az) {
      let px = x;
      let py = y;
      let pz = z;

      let cy = Math.cos(ax), sy = Math.sin(ax);
      let ny = py * cy - pz * sy;
      let nz = py * sy + pz * cy;
      py = ny; pz = nz;

      cy = Math.cos(ay); sy = Math.sin(ay);
      let nx = px * cy + pz * sy;
      nz = -px * sy + pz * cy;
      px = nx; pz = nz;

      cy = Math.cos(az); sy = Math.sin(az);
      nx = px * cy - py * sy;
      ny = px * sy + py * cy;
      px = nx; py = ny;

      return { x: px, y: py, z: pz };
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = 'lighter';

    for (let layer = 0; layer < 5; layer += 1) {
      const hue = (elapsed * 0.04 + layer * 52) % 360;
      const alpha = 0.34 - layer * 0.05;
      const rotX = elapsed * 0.00028 * motion + layer * 0.12 + bass * 0.12;
      const rotY = elapsed * 0.00034 * motion + layer * 0.18 + mids * 0.18;
      const rotZ = Math.sin(elapsed * 0.00021 + layer * 0.7) * 0.38 + treble * 0.08;
      const layerScale = 1 + layer * 0.08 + level * 0.05;
      const depth = 4.4 + layer * 0.18;

      const projected = vertices.map((vertex, index) => {
        const sample = (waveformData[(index * 59 + layer * 23) % waveformData.length] - 128) / 128;
        const pulse = 1 + sample * 0.12 + bass * 0.04;
        const point = rotatePoint(
          vertex[0] * cubeSize * layerScale * pulse,
          vertex[1] * cubeSize * layerScale * pulse,
          vertex[2] * cubeSize * layerScale * pulse,
          rotX,
          rotY,
          rotZ
        );
        const perspective = depth / (point.z / cubeSize + depth);
        return {
          x: point.x * perspective,
          y: point.y * perspective,
          p: perspective
        };
      });

      ctx.strokeStyle = `hsla(${hue}, 100%, 68%, ${alpha})`;
      ctx.lineWidth = 1.2 + bass * 2.4;

      for (const [a, b] of edges) {
        ctx.beginPath();
        ctx.moveTo(projected[a].x, projected[a].y);
        ctx.lineTo(projected[b].x, projected[b].y);
        ctx.stroke();
      }

      for (let i = 0; i < projected.length; i += 1) {
        const point = projected[i];
        const glow = 1.6 + point.p * 2.8 + treble * 1.2;
        ctx.fillStyle = `hsla(${(hue + 18) % 360}, 100%, 74%, ${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, glow, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawWaterParticles() {
    const w = canvas.width;
    const h = canvas.height;
    const motion = Number(motionInput.value);
    const targetCount = Math.max(180, Math.floor((w * h) / 5200));

    while (particles.length < targetCount) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: 0.8 + Math.random() * 3.6,
        phase: Math.random() * Math.PI * 2
      });
    }
    if (particles.length > targetCount) particles.length = targetCount;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(24,78,120,0.16)');
    bg.addColorStop(1, 'rgba(4,14,28,0.08)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const amp = spectrumValue(i % 64, 64);
      p.phase += 0.012 + amp * 0.02 + motion * 0.003;
      p.vx += (Math.random() - 0.5) * 0.028 + Math.sin(elapsed * 0.00045 + p.phase) * 0.003;
      p.vy += (Math.random() - 0.5) * 0.028 + Math.cos(elapsed * 0.00035 + p.phase) * 0.003;
      p.vx *= 0.988;
      p.vy *= 0.988;

      p.x += p.vx * (0.85 + motion * 0.7) + Math.sin(p.phase) * 0.18;
      p.y += p.vy * (0.85 + motion * 0.7) + Math.cos(p.phase * 0.8) * 0.18;

      if (p.x < -8) p.x = w + 8;
      if (p.x > w + 8) p.x = -8;
      if (p.y < -8) p.y = h + 8;
      if (p.y > h + 8) p.y = -8;

      const radius = p.size + amp * 4 + bass * 1.5;
      const hue = 180 + Math.sin(p.phase + elapsed * 0.00018) * 36 + amp * 28;
      const alpha = 0.06 + amp * 0.22 + treble * 0.06;

      ctx.beginPath();
      ctx.fillStyle = `hsla(${hue}, 100%, ${65 + amp * 18}%, ${alpha})`;
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (radius > 2.5) {
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue + 20}, 100%, 88%, ${alpha * 0.45})`;
        ctx.arc(p.x - radius * 0.25, p.y - radius * 0.25, radius * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawLiquidDrift() {
    const w = canvas.width;
    const h = canvas.height;
    const motion = Number(motionInput.value);
    const particleCount = 1450;

    while (particles.length < particleCount) {
      const tiny = Math.random() < 0.72;
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * (tiny ? 1.2 : 0.9),
        vy: (Math.random() - 0.5) * (tiny ? 1.2 : 0.9),
        seed: Math.random() * Math.PI * 2,
        size: tiny ? 0.28 + Math.random() * 0.95 : 0.8 + Math.random() * 1.8,
        drift: 0.45 + Math.random() * 2.3,
        jitter: 0.4 + Math.random() * 1.8,
        hue: Math.random() < 0.5
          ? 290 + Math.random() * 50
          : 20 + Math.random() * 55
      });
    }
    if (particles.length > particleCount) particles.length = particleCount;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const wash = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
    wash.addColorStop(0, `rgba(255, 120, 210, ${0.010 + bass * 0.02})`);
    wash.addColorStop(0.42, `rgba(255, 170, 80, ${0.012 + mids * 0.022})`);
    wash.addColorStop(0.72, `rgba(160, 110, 255, ${0.014 + treble * 0.018})`);
    wash.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const flow = Math.sin(elapsed * 0.00082 * motion + p.seed + p.y * 0.014) * 0.65
        + Math.cos(elapsed * 0.00063 * motion + p.seed * 1.9 + p.x * 0.011) * 0.58;
      const swirl = Math.sin(elapsed * 0.00051 + p.seed * 1.3 + i * 0.061) * 0.42;
      const jitterX = (Math.random() - 0.5) * 0.055 * p.jitter * (0.55 + treble + level * 0.2);
      const jitterY = (Math.random() - 0.5) * 0.055 * p.jitter * (0.55 + mids + level * 0.2);
      const kick = bass > 0.68 && Math.random() < 0.035 ? (Math.random() - 0.5) * 0.85 : 0;

      p.vx += (Math.cos(flow + p.seed) * 0.028 + swirl * 0.016 + jitterX + kick) * p.drift;
      p.vy += (Math.sin(flow * 1.55 + p.seed) * 0.028 + swirl * 0.012 + jitterY - kick * 0.25) * p.drift;

      p.vx *= 0.972;
      p.vy *= 0.972;

      p.x += p.vx * motion * (0.9 + level * 0.95);
      p.y += p.vy * motion * (0.9 + level * 0.95);

      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      const hueShift = Math.sin(elapsed * 0.00021 + p.seed) * 18 + treble * 8;
      const tint = p.hue + hueShift;
      const alpha = (p.size < 0.8 ? 0.035 : 0.06) + p.size * 0.04 + bass * 0.02;
      const size = p.size + level * (p.size < 0.8 ? 0.35 : 0.9);

      ctx.fillStyle = `hsla(${tint}, 100%, ${68 + treble * 12}%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();

      if (p.size > 0.75 && i % 11 === 0) {
        ctx.strokeStyle = `hsla(${tint + 10}, 100%, 78%, ${0.018 + bass * 0.045})`;
        ctx.lineWidth = 0.4 + size * 0.16;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 7, p.y - p.vy * 7);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawAuroraRibbons() {
    const w = canvas.width;
    const h = canvas.height;
    const motion = Number(motionInput.value);
    const ribbonCount = 10;
    const points = 90;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let ribbon = 0; ribbon < ribbonCount; ribbon += 1) {
      const amp = spectrumValue(ribbon * 5 + 3, ribbonCount * 6);
      const baseY = h * (0.12 + (ribbon / (ribbonCount - 1)) * 0.76);
      const phase = elapsed * (0.00022 + ribbon * 0.000012) * motion + ribbon * 0.72;
      const hue = (elapsed * 0.018 + ribbon * 31) % 360;
      const thickness = 1.2 + amp * 4.2 + bass * 0.8;

      ctx.beginPath();
      for (let i = 0; i < points; i += 1) {
        const t = i / (points - 1);
        const x = t * w;
        const sample = (waveformData[Math.floor(t * (waveformData.length - 1))] - 128) / 128;
        const waveA = Math.sin(t * Math.PI * (3.2 + ribbon * 0.14) + phase) * h * (0.025 + amp * 0.035);
        const waveB = Math.sin(t * Math.PI * 8.5 - phase * 0.72 + ribbon) * h * 0.012;
        const audioLift = sample * h * (0.025 + mids * 0.035);
        const y = baseY + waveA + waveB + audioLift;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }

      ctx.shadowColor = `hsla(${hue}, 100%, 65%, 0.55)`;
      ctx.shadowBlur = 9 + amp * 15;
      ctx.strokeStyle = `hsla(${hue}, 100%, ${58 + amp * 18}%, ${0.12 + amp * 0.28})`;
      ctx.lineWidth = thickness;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `hsla(${(hue + 24) % 360}, 100%, 82%, ${0.05 + treble * 0.08})`;
      ctx.lineWidth = Math.max(0.6, thickness * 0.28);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPulseRings() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const motion = Number(motionInput.value);
    const maxRadius = Math.min(w, h) * 0.58;
    const pixelLoad = Math.sqrt((w * h) / (1280 * 720));
    const resolutionScale = clamp(1 / Math.max(1, pixelLoad * 0.86), 0.72, 1);
    const quality = pulseRingsQuality * resolutionScale;
    const ringCount = Math.max(22, Math.round(34 * quality));
    const maxSegments = quality < 0.78 ? 6 : 8;
    const twoPi = Math.PI * 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.shadowBlur = 0;

    for (let ring = 0; ring < ringCount; ring += 1) {
      const amp = spectrumValue(ring, ringCount);
      const travel = ((ring / ringCount) + elapsed * 0.000045 * motion) % 1;
      const radius = 18 + Math.pow(travel, 1.35) * maxRadius
        + Math.sin(elapsed * 0.0007 + ring * 0.55) * 5 * mids;
      const hue = (elapsed * 0.025 + ring * 10) % 360;
      const segments = Math.min(maxSegments, 5 + Math.floor(treble * 3));
      const gap = 0.12 + (1 - amp) * 0.06;
      const rotation = elapsed * 0.00016 * motion * (ring % 2 ? 1 : -1) + ring * 0.13;
      const alpha = 0.06 + (1 - travel) * 0.36 + amp * 0.12;
      const lineWidth = 0.8 + amp * 4.6 + bass * 0.6;
      const section = twoPi / segments;

      // One path per ring instead of one stroke per segment.
      ctx.beginPath();
      for (let segment = 0; segment < segments; segment += 1) {
        const startAngle = rotation + segment * section + gap;
        const endAngle = rotation + (segment + 1) * section - gap;
        ctx.moveTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
        ctx.arc(0, 0, radius, startAngle, endAngle);
      }

      // Cheap glow pass: much faster than Canvas shadowBlur.
      ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha * 0.24})`;
      ctx.lineWidth = lineWidth + 4 + amp * 2;
      ctx.stroke();

      // Bright detail pass.
      ctx.strokeStyle = `hsla(${hue}, 100%, ${56 + amp * 25}%, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // Lightweight center glow without rebuilding a radial gradient every frame.
    const coreRadius = 10 + bass * 24;
    const coreHue = (elapsed * 0.04) % 360;
    ctx.fillStyle = `hsla(${coreHue}, 100%, 62%, ${0.07 + mids * 0.08})`;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius * 2.25, 0, twoPi);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.12 + bass * 0.16})`;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius * 0.72, 0, twoPi);
    ctx.fill();

    ctx.restore();
  }

  function drawCubeMatrix() {
    const w = canvas.width;
    const h = canvas.height;
    const motion = Number(motionInput.value);
    const cubeSize = Math.min(w, h) * 0.12;
    const vertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    function rotatePoint(x, y, z, ax, ay, az) {
      let px = x;
      let py = y;
      let pz = z;

      let c = Math.cos(ax), s = Math.sin(ax);
      let ny = py * c - pz * s;
      let nz = py * s + pz * c;
      py = ny; pz = nz;

      c = Math.cos(ay); s = Math.sin(ay);
      let nx = px * c + pz * s;
      nz = -px * s + pz * c;
      px = nx; pz = nz;

      c = Math.cos(az); s = Math.sin(az);
      nx = px * c - py * s;
      ny = px * s + py * c;
      px = nx; py = ny;

      return { x: px, y: py, z: pz };
    }

    const cubes = 4;
    const orbitRadius = Math.min(w, h) * 0.16;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = 'lighter';

    for (let c = 0; c < cubes; c += 1) {
      const orbitAngle = elapsed * 0.00018 * motion + (Math.PI * 2 * c) / cubes;
      const offsetX = Math.cos(orbitAngle) * orbitRadius * (0.55 + bass * 0.18);
      const offsetY = Math.sin(orbitAngle * 1.12) * orbitRadius * 0.5 * (0.65 + treble * 0.2);
      const scaleBoost = 1 + spectrumValue(c * 7 + 5, 48) * 0.26 + mids * 0.08;

      for (let layer = 0; layer < 3; layer += 1) {
        const hue = (elapsed * 0.03 + c * 58 + layer * 22) % 360;
        const alpha = 0.18 - layer * 0.03 + bass * 0.05;
        const rotX = elapsed * 0.00022 * motion + c * 0.38 + layer * 0.1;
        const rotY = elapsed * 0.0003 * motion + c * 0.45 + mids * 0.15;
        const rotZ = elapsed * 0.00017 * motion + layer * 0.28 + treble * 0.1;
        const size = cubeSize * (1 + layer * 0.26) * scaleBoost;
        const depth = 4.6 + layer * 0.3;

        const projected = vertices.map((vertex, index) => {
          const sample = (waveformData[(index * 47 + c * 31 + layer * 13) % waveformData.length] - 128) / 128;
          const pulse = 1 + sample * 0.1 + bass * 0.06;
          const point = rotatePoint(
            vertex[0] * size * pulse,
            vertex[1] * size * pulse,
            vertex[2] * size * pulse,
            rotX, rotY, rotZ
          );
          const perspective = depth / (point.z / size + depth);
          return {
            x: offsetX + point.x * perspective,
            y: offsetY + point.y * perspective,
            p: perspective
          };
        });

        ctx.strokeStyle = `hsla(${hue}, 100%, ${64 + layer * 5}%, ${alpha})`;
        ctx.lineWidth = 1 + layer * 0.6 + treble * 1.3;
        for (const [a, b] of edges) {
          ctx.beginPath();
          ctx.moveTo(projected[a].x, projected[a].y);
          ctx.lineTo(projected[b].x, projected[b].y);
          ctx.stroke();
        }

        if (layer === 0 && c < cubes - 1) {
          const nextIdx = (c + 1) % cubes;
          const nextAngle = elapsed * 0.00018 * motion + (Math.PI * 2 * nextIdx) / cubes;
          const nx = Math.cos(nextAngle) * orbitRadius * (0.55 + bass * 0.18);
          const ny = Math.sin(nextAngle * 1.12) * orbitRadius * 0.5 * (0.65 + treble * 0.2);
          ctx.strokeStyle = `hsla(${(hue + 30) % 360}, 100%, 74%, ${0.08 + mids * 0.08})`;
          ctx.lineWidth = 0.9 + treble * 0.8;
          ctx.beginPath();
          ctx.moveTo(offsetX, offsetY);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  function drawPyramidSpire() {
    const w = canvas.width;
    const h = canvas.height;
    const motion = Number(motionInput.value);
    const baseSize = Math.min(w, h) * 0.14;
    const vertices = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [0, 0, 1.35]
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [0, 4], [1, 4], [2, 4], [3, 4]
    ];

    function rotatePoint(x, y, z, ax, ay, az) {
      let px = x;
      let py = y;
      let pz = z;

      let c = Math.cos(ax), s = Math.sin(ax);
      let ny = py * c - pz * s;
      let nz = py * s + pz * c;
      py = ny; pz = nz;

      c = Math.cos(ay); s = Math.sin(ay);
      let nx = px * c + pz * s;
      nz = -px * s + pz * c;
      px = nx; pz = nz;

      c = Math.cos(az); s = Math.sin(az);
      nx = px * c - py * s;
      ny = px * s + py * c;
      px = nx; py = ny;

      return { x: px, y: py, z: pz };
    }

    const pyramids = 3;
    const orbitRadius = Math.min(w, h) * 0.17;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = 'lighter';

    for (let p = 0; p < pyramids; p += 1) {
      const orbitAngle = elapsed * 0.00022 * motion + (Math.PI * 2 * p) / pyramids;
      const offsetX = Math.cos(orbitAngle) * orbitRadius * (0.52 + bass * 0.18);
      const offsetY = Math.sin(orbitAngle * 1.15) * orbitRadius * 0.58 * (0.68 + treble * 0.18);
      const scaleBoost = 1 + spectrumValue(p * 9 + 4, 48) * 0.32 + mids * 0.08;

      for (let layer = 0; layer < 3; layer += 1) {
        const hue = (elapsed * 0.032 + p * 72 + layer * 18) % 360;
        const alpha = 0.18 - layer * 0.028 + bass * 0.06;
        const rotX = elapsed * 0.00024 * motion + p * 0.42 + layer * 0.14;
        const rotY = elapsed * 0.00033 * motion + p * 0.51 + mids * 0.18;
        const rotZ = elapsed * 0.00019 * motion + layer * 0.3 + treble * 0.12;
        const size = baseSize * (1 + layer * 0.24) * scaleBoost;
        const depth = 4.8 + layer * 0.34;

        const projected = vertices.map((vertex, index) => {
          const sample = (waveformData[(index * 61 + p * 27 + layer * 17) % waveformData.length] - 128) / 128;
          const pulse = 1 + sample * 0.11 + bass * 0.08;
          const point = rotatePoint(
            vertex[0] * size * pulse,
            vertex[1] * size * pulse,
            vertex[2] * size * pulse,
            rotX, rotY, rotZ
          );
          const perspective = depth / (point.z / size + depth);
          return {
            x: offsetX + point.x * perspective,
            y: offsetY + point.y * perspective,
            p: perspective
          };
        });

        ctx.strokeStyle = `hsla(${hue}, 100%, ${65 + layer * 6}%, ${alpha})`;
        ctx.lineWidth = 1 + layer * 0.7 + treble * 1.2;
        for (const [a, b] of edges) {
          ctx.beginPath();
          ctx.moveTo(projected[a].x, projected[a].y);
          ctx.lineTo(projected[b].x, projected[b].y);
          ctx.stroke();
        }

        // Base diagonals for extra structure.
        ctx.strokeStyle = `hsla(${(hue + 22) % 360}, 100%, 76%, ${0.08 + mids * 0.08})`;
        ctx.lineWidth = 0.8 + layer * 0.4;
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        ctx.lineTo(projected[2].x, projected[2].y);
        ctx.moveTo(projected[1].x, projected[1].y);
        ctx.lineTo(projected[3].x, projected[3].y);
        ctx.stroke();

        for (let i = 0; i < projected.length; i += 1) {
          const point = projected[i];
          const glow = 1.4 + point.p * 2.3 + bass * 1.0;
          ctx.fillStyle = `hsla(${(hue + 14) % 360}, 100%, 80%, ${alpha * 0.9})`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, glow, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Central halo so it reads similarly to the cube visual family.
    const halo = 14 + bass * 22;
    ctx.fillStyle = `hsla(${(elapsed * 0.05) % 360}, 100%, 62%, ${0.05 + mids * 0.06})`;
    ctx.beginPath();
    ctx.arc(0, 0, halo * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function applyMirror() {
    const w = canvas.width;
    const h = canvas.height;
    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(previousFrame, 0, 0, w / 2, h, 0, 0, w / 2, h);
    ctx.restore();
  }

  function applyVhs() {
    const w = canvas.width;
    const h = canvas.height;
    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);
    const slices = 28;
    const sliceH = h / slices;
    for (let i = 0; i < slices; i += 1) {
      const jitter = (Math.random() - 0.5) * (3 + treble * 32);
      ctx.drawImage(previousFrame, 0, i * sliceH, w, sliceH + 1, jitter, i * sliceH, w, sliceH + 1);
    }
    ctx.fillStyle = `rgba(255,255,255,${0.01 + treble * 0.03})`;
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }

  function applyPrismShift() {
    const w = canvas.width;
    const h = canvas.height;
    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);

    const shift = 2 + Math.round(level * 9);
    const drift = Math.sin(elapsed * 0.0022) * shift;

    // Preserve the original frame clearly underneath.
    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.drawImage(previousFrame, 0, 0, w, h);
    ctx.restore();

    // Two low-opacity, hue-shifted ghost layers create an iridescent prism look.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    ctx.globalAlpha = 0.22 + treble * 0.05;
    ctx.filter = 'hue-rotate(95deg) saturate(1.35)';
    ctx.drawImage(previousFrame, -shift + drift, -shift * 0.18, w, h);

    ctx.globalAlpha = 0.20 + mids * 0.04;
    ctx.filter = 'hue-rotate(-95deg) saturate(1.35)';
    ctx.drawImage(previousFrame, shift - drift, shift * 0.18, w, h);

    ctx.restore();

    // Add a few moving refracted bands instead of tinting the whole screen.
    const bands = 10;
    const bandH = h / bands;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 + bass * 0.04;
    for (let i = 0; i < bands; i += 1) {
      const offset = Math.sin(elapsed * 0.003 + i * 1.7) * shift * 0.75;
      if (Math.abs(offset) < 0.5) continue;
      ctx.drawImage(
        previousFrame,
        0, i * bandH, w, bandH + 1,
        offset, i * bandH, w, bandH + 1
      );
    }
    ctx.restore();
  }

  function applyPixel() {
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.max(8, Math.round(22 - level * 10));
    pixelBuffer.width = Math.max(32, Math.round(w / scale));
    pixelBuffer.height = Math.max(18, Math.round(h / scale));
    pixelCtx.imageSmoothingEnabled = false;
    pixelCtx.drawImage(canvas, 0, 0, pixelBuffer.width, pixelBuffer.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelBuffer, 0, 0, w, h);
    ctx.restore();
  }

  function applyWave() {
    const w = canvas.width;
    const h = canvas.height;
    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);
    const bands = 80;
    const bandH = h / bands;
    for (let i = 0; i < bands; i += 1) {
      const offset = Math.sin(i * 0.32 + elapsed * 0.005) * (4 + mids * 30);
      ctx.drawImage(previousFrame, 0, i * bandH, w, bandH + 1, offset, i * bandH, w, bandH + 1);
    }
  }

  function applyKaleidoFx() {
    const w = canvas.width;
    const h = canvas.height;
    const slices = 8;
    const radius = Math.hypot(w, h);
    const halfSlice = Math.PI / slices;

    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.filter = 'brightness(1.08) contrast(1.03)';

    for (let i = 0; i < slices; i += 1) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * i) / slices);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius, -Math.tan(halfSlice) * radius);
      ctx.lineTo(radius, Math.tan(halfSlice) * radius);
      ctx.closePath();
      ctx.clip();

      if (i % 2) ctx.scale(1, -1);
      ctx.drawImage(previousFrame, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    ctx.restore();
  }

  function applyScanPulse() {
    const w = canvas.width;
    const h = canvas.height;
    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);

    const bandHeight = Math.max(18, h * (0.035 + mids * 0.025));
    const travel = (elapsed * (0.055 + Number(motionInput.value) * 0.035)) % (h + bandHeight * 2);
    const centerY = travel - bandHeight;
    const sourceY = clamp(centerY - bandHeight * 0.5, 0, h - bandHeight);
    const destinationY = sourceY - bass * 4;
    const bend = Math.sin(elapsed * 0.0045) * (3 + mids * 10);

    // Refract only the moving scan band.
    ctx.save();
    ctx.globalAlpha = 0.42 + level * 0.08;
    ctx.drawImage(
      previousFrame,
      0, sourceY, w, bandHeight,
      bend, destinationY, w, bandHeight * (1.05 + bass * 0.08)
    );
    ctx.restore();

    // Soft colored edge around the moving band, never a full-screen flash.
    const glow = ctx.createLinearGradient(0, centerY - bandHeight, 0, centerY + bandHeight);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(0.42, `rgba(90,255,220,${0.025 + treble * 0.04})`);
    glow.addColorStop(0.5, `rgba(255,245,160,${0.08 + bass * 0.08})`);
    glow.addColorStop(0.58, `rgba(255,90,210,${0.025 + mids * 0.04})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, centerY - bandHeight, w, bandHeight * 2);
  }

  function applyEcho() {
    const w = canvas.width;
    const h = canvas.height;
    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(0.018 + bass * 0.02);
    ctx.scale(1.025, 1.025);
    ctx.drawImage(previousFrame, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function applyThermalMap() {
    const w = canvas.width;
    const h = canvas.height;
    previousCtx.clearRect(0, 0, w, h);
    previousCtx.drawImage(canvas, 0, 0);

    const angle = elapsed * 0.00018;
    const cx = w * (0.5 + Math.sin(angle * 2.1) * 0.22);
    const cy = h * (0.5 + Math.cos(angle * 1.7) * 0.22);
    const radius = Math.max(w, h) * (0.52 + bass * 0.08);
    const heat = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    heat.addColorStop(0, `hsla(${50 + treble * 18},100%,65%,0.88)`);
    heat.addColorStop(0.24, `hsla(${18 + bass * 16},100%,55%,0.84)`);
    heat.addColorStop(0.5, `hsla(${326 + mids * 16},100%,55%,0.76)`);
    heat.addColorStop(0.76, 'hsla(250,100%,55%,0.68)');
    heat.addColorStop(1, 'hsla(190,100%,48%,0.58)');

    // Colorize the existing luminance without reversing the whole image.
    ctx.save();
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = 0.48 + level * 0.08;
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Gentle contrast layer keeps line work readable.
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.18 + bass * 0.05;
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawLogo(deltaSeconds) {
    if (!logoImage) return;
    const w = canvas.width;
    const h = canvas.height;
    const maxSize = Math.min(w, h) * Number(logoSizeInput.value);
    const ratio = logoImage.naturalWidth / logoImage.naturalHeight || 1;
    const drawW = ratio >= 1 ? maxSize : maxSize * ratio;
    const drawH = ratio >= 1 ? maxSize / ratio : maxSize;
    logoRotation += Number(logoSpinInput.value) * deltaSeconds;
    ctx.save();
    ctx.translate(logoX * w, logoY * h);
    ctx.rotate(logoRotation);
    ctx.globalAlpha = Number(logoOpacityInput.value);
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = Math.min(w, h) * 0.018;
    ctx.drawImage(logoImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  function drawPreset(presetName, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    switch (presetName) {
      case 'tunnel':
        drawTunnel();
        break;
      case 'scope':
        drawScope();
        break;
      case 'water':
        drawWaterParticles();
        break;
      case 'aurora':
        drawAuroraRibbons();
        break;
      case 'rings':
        drawPulseRings();
        break;
      case 'matrix':
        drawCubeMatrix();
        break;
      case 'pyramid':
        drawPyramidSpire();
        break;
      default:
        drawKaleido();
        break;
    }
    ctx.restore();
  }

  function getFlowOrder() {
    const startIndex = Math.max(0, corePresets.indexOf(presetSelect.value));
    return corePresets.map((_, index) => corePresets[(startIndex + index) % corePresets.length]);
  }

  function getFlowState() {
    const order = getFlowOrder();
    const segmentMs = 24000;
    const total = elapsed / segmentMs;
    const index = Math.floor(total) % order.length;
    const localProgress = total - Math.floor(total);
    const blendStart = 0.28;
    const rawBlend = clamp((localProgress - blendStart) / (1 - blendStart), 0, 1);
    const easedBlend = rawBlend * rawBlend * (3 - 2 * rawBlend);
    return {
      current: order[index],
      next: order[(index + 1) % order.length],
      currentAlpha: Math.cos(easedBlend * Math.PI * 0.5),
      nextAlpha: Math.sin(easedBlend * Math.PI * 0.5)
    };
  }

  function updateFeedbackAutomation(now, delta) {
    let feedback = Number(feedbackInput.value);
    if (!autoFeedbackEnabled) return feedback;

    if (!nextFeedbackChangeAt) {
      nextFeedbackChangeAt = now + 1400;
      autoFeedbackTarget = clamp(0.68 + Math.random() * 0.18, 0.5, 0.95);
    }

    if (now >= nextFeedbackChangeAt) {
      autoFeedbackTarget = clamp(0.54 + Math.random() * 0.34 + level * 0.08, 0.42, 0.95);
      nextFeedbackChangeAt = now + 1800 + Math.random() * 3600;
    }

    const drift = (autoFeedbackTarget - feedback) * Math.min(1, delta * 1.35);
    const beatPulse = bass > 0.72 ? (0.015 + bass * 0.02) : 0;
    feedback = clamp(feedback + drift + beatPulse, 0.34, 0.96);
    feedbackInput.value = feedback.toFixed(2);
    return feedback;
  }

  function render(now) {
    const delta = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    elapsed += delta * 1000;
    updateAudioData();

    const coreFeedbackScale = activeFx.has('3') ? 0.62 : 0.85;
    const feedback = updateFeedbackAutomation(now, delta) * coreFeedbackScale;
    clearBase(feedback);

    if (autoFlowEnabled) {
      const flow = getFlowState();
      drawPreset(flow.current, flow.currentAlpha);
      if (flow.nextAlpha > 0.001) drawPreset(flow.next, flow.nextAlpha);
    } else {
      drawPreset(presetSelect.value, 1);
    }

    if (activeFx.has('1')) applyKaleidoFx();
    if (activeFx.has('2')) applyVhs();
    if (activeFx.has('3')) applyPrismShift();
    if (activeFx.has('4')) applyPixel();
    if (activeFx.has('5')) applyMirror();
    if (activeFx.has('6')) applyWave();
    if (activeFx.has('7')) applyScanPulse();
    if (activeFx.has('8')) applyEcho();
    if (activeFx.has('9')) applyThermalMap();

    drawLogo(delta);

    previousCtx.clearRect(0, 0, previousFrame.width, previousFrame.height);
    previousCtx.drawImage(canvas, 0, 0);

    fpsFrames += 1;
    if (now - fpsTime >= 700) {
      const fps = Math.round((fpsFrames * 1000) / (now - fpsTime));
      recentFps = fps;
      fpsReadout.textContent = `${fps} FPS`;

      // Pulse Rings quietly scales detail to protect a stable 60 FPS.
      // It restores full detail once performance has recovered.
      if (pulseRingsQualityHold > 0) pulseRingsQualityHold -= 1;
      const activeFlow = autoFlowEnabled ? getFlowState() : null;
      const ringsVisible = presetSelect.value === 'rings'
        || Boolean(activeFlow && (activeFlow.current === 'rings' || activeFlow.next === 'rings'));
      if (ringsVisible && pulseRingsQualityHold <= 0) {
        if (recentFps < 48) {
          pulseRingsQuality = Math.max(0.64, pulseRingsQuality - 0.12);
          pulseRingsQualityHold = 2;
        } else if (recentFps < 56) {
          pulseRingsQuality = Math.max(0.76, pulseRingsQuality - 0.06);
          pulseRingsQualityHold = 2;
        } else if (recentFps >= 59) {
          pulseRingsQuality = Math.min(1, pulseRingsQuality + 0.04);
        }
      }

      fpsFrames = 0;
      fpsTime = now;
    }

    requestAnimationFrame(render);
  }

  function toggleFx(number) {
    const key = String(number);
    if (activeFx.has(key)) activeFx.delete(key); else activeFx.add(key);
    document.querySelectorAll('[data-fx]').forEach(button => {
      button.classList.toggle('active', activeFx.has(button.dataset.fx));
    });
  }

  function chooseMp4MimeType() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    const candidates = [
      'video/mp4;codecs="avc1.424028,mp4a.40.2"',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/mp4'
    ];
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function updateMp4RecorderSupport() {
    const mimeType = chooseMp4MimeType();
    const supported = Boolean(mimeType);
    recordBtn.disabled = !supported;
    recordBtn.title = supported
      ? `MP4 recording format: ${mimeType}`
      : 'This browser cannot record MP4 directly. Try a current Chrome, Edge, or Safari build.';
    if (!isRecording) recordState.textContent = supported ? 'MP4 READY' : 'MP4 UNSUPPORTED';
    return mimeType;
  }

  function formatTimer(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  async function startRecording() {
    if (isRecording) return;
    try {
      applyResolution(resolutionSelect.value);
      const canvasStream = canvas.captureStream(60);
      const tracks = [...canvasStream.getVideoTracks()];
      if (recordDestination?.stream?.getAudioTracks().length) {
        tracks.push(...recordDestination.stream.getAudioTracks());
      }
      const combinedStream = new MediaStream(tracks);
      const mimeType = chooseMp4MimeType();
      if (!mimeType) {
        setStatus('MP4 UNSUPPORTED');
        recordState.textContent = 'MP4 UNSUPPORTED';
        alert('This browser cannot record MP4 directly. Open SPECTRAVAULT in a current Chrome, Edge, or Safari build and try again. WebM fallback has been disabled.');
        return;
      }
      mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: canvas.width >= 1920 ? 16_000_000 : 9_000_000,
        audioBitsPerSecond: 256_000
      });
      recordedChunks = [];
      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) recordedChunks.push(event.data);
      };
      mediaRecorder.onstop = saveRecording;
      mediaRecorder.onerror = event => {
        console.error(event.error);
        setStatus('RECORD ERROR');
      };
      mediaRecorder.start(1000);
      isRecording = true;
      recordStartedAt = performance.now();
      recordBtn.disabled = true;
      stopRecordBtn.disabled = false;
      resolutionSelect.disabled = true;
      document.body.classList.add('recording');
      recordState.textContent = 'RECORDING';
      setStatus('RECORDING');
      recordTimerInterval = setInterval(() => {
        recordTimer.textContent = formatTimer(performance.now() - recordStartedAt);
      }, 250);
    } catch (error) {
      console.error(error);
      setStatus('RECORD FAILED');
      alert('MP4 recording could not start in this browser. Try a current Chrome, Edge, or Safari build. WebM fallback is disabled.');
    }
  }

  function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;
    recordBtn.disabled = false;
    stopRecordBtn.disabled = true;
    resolutionSelect.disabled = false;
    document.body.classList.remove('recording');
    recordState.textContent = 'SAVING';
    setStatus('SAVING VIDEO');
  }

  function saveRecording() {
    if (!recordedChunks.length) {
      recordState.textContent = 'NO DATA';
      setStatus('NO RECORDING DATA');
      return;
    }
    const type = mediaRecorder?.mimeType || 'video/mp4';
    const extension = 'mp4';
    const blob = new Blob(recordedChunks, { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `SPECTRAVAULT_${stamp}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    recordState.textContent = 'SAVED';
    setStatus('VIDEO SAVED');
    setTimeout(() => {
      if (!isRecording) recordState.textContent = chooseMp4MimeType() ? 'MP4 READY' : 'MP4 UNSUPPORTED';
    }, 2200);
  }

  function loadLogo(file) {
    if (!file) return;
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      logoImage = image;
      logoX = 0.5;
      logoY = 0.5;
      logoRotation = 0;
      setStatus('LOGO LOADED');
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      alert('That image could not be loaded. Try a PNG, JPG, or WebP file.');
    };
    image.src = url;
  }

  function pointerToCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * canvas.width,
      y: (event.clientY - rect.top) / rect.height * canvas.height
    };
  }

  function logoBounds() {
    if (!logoImage) return null;
    const maxSize = Math.min(canvas.width, canvas.height) * Number(logoSizeInput.value);
    const ratio = logoImage.naturalWidth / logoImage.naturalHeight || 1;
    const width = ratio >= 1 ? maxSize : maxSize * ratio;
    const height = ratio >= 1 ? maxSize / ratio : maxSize;
    return {
      x: logoX * canvas.width - width / 2,
      y: logoY * canvas.height - height / 2,
      width,
      height
    };
  }

  navTabs.forEach(button => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });
  themeButtons.forEach(button => {
    button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
  });
  document.getElementById('returnToVisualsBtn').addEventListener('click', () => showTab('visuals'));

  document.getElementById('micBtn').addEventListener('click', startMic);
  document.getElementById('desktopBtn').addEventListener('click', startDesktopAudio);
  document.getElementById('stopAudioBtn').addEventListener('click', disconnectCurrentAudio);
  document.getElementById('audioFileInput').addEventListener('change', event => loadAudioFile(event.target.files[0]));
  document.getElementById('logoInput').addEventListener('change', event => loadLogo(event.target.files[0]));
  document.getElementById('removeLogoBtn').addEventListener('click', () => { logoImage = null; setStatus('LOGO REMOVED'); });
  flowToggleBtn.addEventListener('click', () => {
    autoFlowEnabled = !autoFlowEnabled;
    syncAutomationButtons();
    setStatus(autoFlowEnabled ? 'AUTO FLOW ON' : 'AUTO FLOW OFF');
  });
  autoFeedbackBtn.addEventListener('click', () => {
    autoFeedbackEnabled = !autoFeedbackEnabled;
    if (autoFeedbackEnabled) nextFeedbackChangeAt = 0;
    syncAutomationButtons();
    setStatus(autoFeedbackEnabled ? 'AUTO FEEDBACK ON' : 'AUTO FEEDBACK OFF');
  });
  document.getElementById('fullscreenBtn').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await stageWrap.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) { console.error(error); }
  });
  if (pipBtn) pipBtn.addEventListener('click', togglePictureInPicture);
  if (pipVideo) {
    pipVideo.addEventListener('enterpictureinpicture', () => {
      syncPipButtonState(true);
      setStatus('PIP ACTIVE');
    });
    pipVideo.addEventListener('leavepictureinpicture', () => {
      syncPipButtonState(false);
      setStatus('PIP CLOSED');
    });
  }
  document.getElementById('clearFxBtn').addEventListener('click', () => {
    activeFx.clear();
    document.querySelectorAll('[data-fx]').forEach(button => button.classList.remove('active'));
    setStatus('FX CLEARED');
  });
  document.querySelectorAll('[data-fx]').forEach(button => {
    button.addEventListener('click', () => toggleFx(button.dataset.fx));
  });
  resolutionSelect.addEventListener('change', event => applyResolution(event.target.value));
  recordBtn.addEventListener('click', startRecording);
  stopRecordBtn.addEventListener('click', stopRecording);
  presetSelect.addEventListener('change', () => {
    setStatus(`${presetSelect.options[presetSelect.selectedIndex].text.toUpperCase()} READY`);
  });

  window.addEventListener('keydown', event => {
    if (event.repeat || event.target.matches('input, select, textarea')) return;
    if (event.key === '?') {
      event.preventDefault();
      showTab(helpTab.classList.contains('active') ? 'visuals' : 'help');
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      toggleFx(event.key);
    }
  });

  canvas.addEventListener('pointerdown', event => {
    const bounds = logoBounds();
    if (!bounds) return;
    const point = pointerToCanvas(event);
    if (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
      draggingLogo = true;
      dragOffsetX = point.x - logoX * canvas.width;
      dragOffsetY = point.y - logoY * canvas.height;
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (!draggingLogo) return;
    const point = pointerToCanvas(event);
    logoX = Math.max(0, Math.min(1, (point.x - dragOffsetX) / canvas.width));
    logoY = Math.max(0, Math.min(1, (point.y - dragOffsetY) / canvas.height));
  });
  canvas.addEventListener('pointerup', event => {
    draggingLogo = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  });

  window.addEventListener('beforeunload', () => {
    if (isRecording) stopRecording();
    if (document.pictureInPictureElement === pipVideo && document.exitPictureInPicture) {
      document.exitPictureInPicture().catch(() => {});
    }
    disconnectCurrentAudio();
  });

  let savedTheme = 'chrome';
  try { savedTheme = localStorage.getItem('spectravault-theme') || 'chrome'; } catch (_) {}
  applyTheme(savedTheme, false);
  applyResolution(resolutionSelect.value);
  syncAutomationButtons();
  updateMp4RecorderSupport();
  syncPipButtonState(false);
  requestAnimationFrame(render);
})();
