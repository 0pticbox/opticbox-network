/* 0PTICBOX startup sequence ----------------------------------------------- */
(() => {
  const startupReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const emergencyCleanup = () => {
    document.body.classList.remove('startup-active');
    document.querySelectorAll('.startup-sequence').forEach((element) => {
      element.remove();
    });
  };

  try {
    const isHomePage = Boolean(
      document.querySelector('.profile-layout') &&
      document.querySelector('.ticker') &&
      document.querySelector('.wordmark')
    );

    if (!isHomePage) {
      emergencyCleanup();
      return;
    }

    const replayRequested =
      new URLSearchParams(window.location.search).get('intro') === '1';

    let alreadyPlayed = false;
    try {
      alreadyPlayed = sessionStorage.getItem('opticbox-intro-played') === '1';
    } catch (_) {
      alreadyPlayed = false;
    }

    if (alreadyPlayed && !replayRequested) {
      emergencyCleanup();
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'startup-sequence';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '0PTICBOX startup animation');
    overlay.innerHTML = `
      <div class="startup-grid" aria-hidden="true"></div>
      <div class="startup-noise" aria-hidden="true"></div>
      <button class="startup-skip" type="button">Skip intro</button>
      <div class="startup-center">
        <div class="startup-atom" aria-hidden="true">
          <span class="startup-core"></span>
          <span class="startup-orbit startup-orbit-one"><i></i></span>
          <span class="startup-orbit startup-orbit-two"><i></i></span>
          <span class="startup-orbit startup-orbit-three"><i></i></span>
        </div>
        <p class="startup-kicker">OPTIC SYSTEM // BOOT</p>
        <div class="startup-logo" aria-label="0PTICBOX Productions">
          <strong>0PTICBOX</strong><span>PRODUCTIONS</span>
        </div>
        <svg class="startup-wave" viewBox="0 0 620 120" role="img" aria-label="Animated signal waveform">
          <defs><linearGradient id="startup-wave-gradient" x1="0" x2="1"><stop offset="0" stop-color="#ff6b36"></stop><stop offset=".48" stop-color="#ff5ca8"></stop><stop offset="1" stop-color="#65e8ff"></stop></linearGradient></defs>
          <path class="startup-wave-shadow" d="M0 60 C35 60 42 25 75 25 S112 94 148 94 S188 35 224 35 S265 78 302 78 S340 17 378 17 S419 101 456 101 S498 42 535 42 S575 60 620 60"></path>
          <path class="startup-wave-line" d="M0 60 C35 60 42 25 75 25 S112 94 148 94 S188 35 224 35 S265 78 302 78 S340 17 378 17 S419 101 456 101 S498 42 535 42 S575 60 620 60"></path>
        </svg>
        <div class="startup-readout" aria-live="polite"><span id="startup-message">INITIALIZING VISUAL SYSTEMS</span><span id="startup-percent">0%</span></div>
        <div class="startup-progress" aria-hidden="true"><i id="startup-progress-bar"></i></div>
        <div class="startup-statuses" aria-hidden="true"><span>SIGNAL</span><span>AUDIO</span><span>VISUALS</span><span>ONLINE</span></div>
      </div>
    `;

    document.body.prepend(overlay);
    document.body.classList.add('startup-active');
    const progressBar = overlay.querySelector('#startup-progress-bar');
    const percent = overlay.querySelector('#startup-percent');
    const message = overlay.querySelector('#startup-message');
    const skip = overlay.querySelector('.startup-skip');
    const messages = [
      [0, 'INITIALIZING VISUAL SYSTEMS'],
      [28, 'CALIBRATING SIGNAL PATH'],
      [54, 'LOADING PROJECT ARCHIVE'],
      [78, 'SYNCING COMMUNITY FEED'],
      [96, 'SYSTEM ONLINE'],
    ];
    let finished = false;
    let raf = 0;
    let watchdog = 0;
    const startTime = performance.now();
    const duration = startupReducedMotion ? 120 : 700;

    const closeIntro = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      if (progressBar) progressBar.style.width = '100%';
      if (percent) percent.textContent = '100%';
      if (message) message.textContent = 'SYSTEM ONLINE';
      overlay.classList.add('startup-complete');
      setTimeout(() => {
        document.body.classList.remove('startup-active');
        overlay.remove();
        try { sessionStorage.setItem('opticbox-intro-played', '1'); } catch (_) { /* optional */ }
      }, startupReducedMotion ? 50 : 280);
    };

    const tick = (now) => {
      const raw = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - raw, 3);
      const value = Math.min(100, Math.round(eased * 100));
      if (progressBar) progressBar.style.width = `${value}%`;
      if (percent) percent.textContent = `${value}%`;
      if (message) {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (value >= messages[index][0]) {
            message.textContent = messages[index][1];
            break;
          }
        }
      }
      if (raw >= 1) return closeIntro();
      raf = requestAnimationFrame(tick);
    };

    skip?.addEventListener('click', closeIntro);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeIntro();
    }, { once: true });
    watchdog = setTimeout(closeIntro, 1350);
    raf = requestAnimationFrame(tick);
  } catch (error) {
    console.error('Startup animation failed safely:', error);
    emergencyCleanup();
  }
})();

/* 0PTICBOX shared site behavior ------------------------------------------- */
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.site-nav');
  if (menuButton && menu) {
    menuButton.addEventListener('click', () => {
      const open = menu.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        menu.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* Keep authentication-aware navigation available on every page. */
  import('./auth-state.js').catch((error) => {
    console.warn('Authentication navigation could not initialize:', error);
  });

  /* Lightweight version of the existing page-particle background. */
  const particleCanvas = document.getElementById('page-particles');
  if (particleCanvas) {
    const context = particleCanvas.getContext('2d');
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;

    const resize = () => {
      const rect = particleCanvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width || window.innerWidth));
      height = Math.max(1, Math.round(rect.height || window.innerHeight));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      particleCanvas.width = Math.round(width * dpr);
      particleCanvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    const draw = (now) => {
      const time = reducedMotion ? 0 : now / 1000;
      context.clearRect(0, 0, width, height);
      const count = Math.min(70, Math.max(24, Math.floor(width / 16)));
      for (let index = 0; index < count; index += 1) {
        const x = (index * 137.5 + time * (5 + (index % 4))) % (width + 40) - 20;
        const y = (index * 83.2 + Math.sin(time * 0.2 + index) * 18) % (height + 30) - 15;
        const alpha = 0.08 + 0.14 * (0.5 + 0.5 * Math.sin(time + index * 0.73));
        context.fillStyle = index % 7 === 0
          ? `rgba(255,107,54,${alpha})`
          : `rgba(55,216,255,${alpha})`;
        const size = index % 5 === 0 ? 2 : 1;
        context.fillRect(x, y, size, size);
      }
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!document.hidden && !frame && !reducedMotion) {
        frame = requestAnimationFrame(draw);
      }
    });
  }

  /* Cursor effects remain site-wide, but the chooser now lives in Settings. */
  const STORAGE_KEY = 'opticbox-cursor-style';
  const allowed = new Set(['default', 'atom', 'star', 'heart', 'smile', 'rainbow']);
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let style = 'default';
  let canvas = null;
  let context = null;
  let animation = 0;
  let dpr = 1;
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, active: false };
  const particles = [];
  let lastTrail = 0;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (allowed.has(saved)) style = saved;
  } catch (_) {
    style = 'default';
  }

  function resizeCursorCanvas() {
    if (!canvas || !context) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureCursorCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'site-cursor-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    context = canvas.getContext('2d');
    resizeCursorCanvas();
  }

  function starPath(x, y, outer, inner, rotation) {
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? outer : inner;
      const angle = rotation + (Math.PI * index) / 5;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  }

  function heartPath(x, y, size) {
    context.beginPath();
    context.moveTo(x, y + size * 0.34);
    context.bezierCurveTo(x - size * 0.78, y - size * 0.12, x - size * 0.42, y - size * 0.78, x, y - size * 0.34);
    context.bezierCurveTo(x + size * 0.42, y - size * 0.78, x + size * 0.78, y - size * 0.12, x, y + size * 0.34);
    context.closePath();
  }

  function drawOutlined(path, alpha = 1) {
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = '#fff';
    context.fillStyle = 'rgba(255,255,255,.25)';
    context.lineWidth = 1.7;
    context.shadowBlur = 8;
    context.shadowColor = 'rgba(255,255,255,.8)';
    path();
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawAtom(now) {
    const t = now * 0.0024;
    context.save();
    context.translate(pointer.x, pointer.y);
    context.rotate(t * 0.2);
    context.strokeStyle = 'rgba(255,255,255,.72)';
    context.lineWidth = 1;
    [0, Math.PI / 3, (Math.PI * 2) / 3].forEach((angle) => {
      context.save();
      context.rotate(angle);
      context.beginPath();
      context.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    });
    context.restore();
    context.save();
    context.translate(pointer.x, pointer.y);
    context.rotate(t);
    context.fillStyle = 'rgba(255,255,255,.4)';
    context.strokeStyle = '#fff';
    context.fillRect(-3.5, -3.5, 7, 7);
    context.strokeRect(-3.5, -3.5, 7, 7);
    context.restore();
  }

  function drawMainCursor(now) {
    if (style === 'atom') drawAtom(now);
    if (style === 'star') drawOutlined(() => starPath(pointer.x, pointer.y, 13, 5.8, now * 0.002));
    if (style === 'heart') drawOutlined(() => heartPath(pointer.x, pointer.y, 17 * (1 + Math.sin(now * 0.008) * 0.08)));
    if (style === 'smile') {
      context.save();
      context.strokeStyle = '#fff';
      context.fillStyle = 'rgba(255,255,255,.22)';
      context.lineWidth = 1.8;
      context.shadowBlur = 8;
      context.shadowColor = '#fff';
      context.beginPath();
      context.arc(pointer.x, pointer.y, 13, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(pointer.x - 4.5, pointer.y - 3, 1.5, 0, Math.PI * 2);
      context.arc(pointer.x + 4.5, pointer.y - 3, 1.5, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(pointer.x, pointer.y + 1, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      context.stroke();
      context.restore();
    }
    if (style === 'rainbow') {
      const colors = ['#ff4f70', '#ff9738', '#ffe45f', '#64e68c', '#59d9ff', '#8b7cff'];
      context.save();
      context.lineCap = 'round';
      colors.forEach((color, index) => {
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = 3;
        context.shadowBlur = 5;
        context.shadowColor = color;
        context.arc(pointer.x, pointer.y + 6, 16 - index * 2.15, Math.PI, Math.PI * 2);
        context.stroke();
      });
      context.restore();
    }
  }

  function addTrail(now) {
    if (reducedMotion || now - lastTrail < 32) return;
    lastTrail = now;
    particles.push({
      x: pointer.x,
      y: pointer.y,
      life: 1,
      size: 3 + Math.random() * 3,
      angle: Math.random() * Math.PI * 2,
      hue: Math.random() * 360,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 0.25 + Math.random() * 0.65,
    });
    if (particles.length > 24) particles.shift();
  }

  function drawTrailParticle(particle) {
    const alpha = Math.max(0, particle.life) * 0.62;
    const size = particle.size * Math.max(0.25, particle.life);
    if (style === 'rainbow') {
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = `hsl(${particle.hue} 95% 62%)`;
      context.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      context.restore();
    } else if (style === 'star') {
      drawOutlined(() => starPath(particle.x, particle.y, size, size * 0.44, particle.angle), alpha);
    } else if (style === 'heart') {
      drawOutlined(() => heartPath(particle.x, particle.y, size * 1.2), alpha);
    } else {
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = '#fff';
      context.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      context.restore();
    }
  }

  function renderCursor(now) {
    if (!context || style === 'default') {
      animation = 0;
      return;
    }
    context.clearRect(0, 0, innerWidth, innerHeight);
    pointer.x += (pointer.tx - pointer.x) * 0.42;
    pointer.y += (pointer.ty - pointer.y) * 0.42;
    if (pointer.active) addTrail(now);
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 0.045;
      particle.angle += 0.08;
      if (particle.life <= 0) particles.splice(index, 1);
      else drawTrailParticle(particle);
    }
    if (pointer.active) drawMainCursor(now);
    animation = requestAnimationFrame(renderCursor);
  }

  function stopCursor() {
    document.body.classList.remove('site-custom-cursor');
    particles.length = 0;
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
    if (canvas && context) {
      canvas.hidden = true;
      context.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  function applyCursor(next, persist = false) {
    style = allowed.has(next) ? next : 'default';
    stopCursor();
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, style); } catch (_) { /* optional */ }
    }
    if (finePointer.matches && style !== 'default') {
      ensureCursorCanvas();
      canvas.hidden = false;
      document.body.classList.add('site-custom-cursor');
      animation = requestAnimationFrame(renderCursor);
    }
  }

  window.addEventListener('mousemove', (event) => {
    pointer.tx = event.clientX;
    pointer.ty = event.clientY;
    pointer.active = true;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });
  document.documentElement.addEventListener('mouseenter', () => { pointer.active = true; });
  window.addEventListener('resize', resizeCursorCanvas, { passive: true });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) applyCursor(event.newValue || 'default');
  });
  window.addEventListener('opticbox:cursor-change', (event) => {
    applyCursor(event.detail?.style || 'default', false);
  });
  finePointer.addEventListener?.('change', () => applyCursor(style));

  /* Remove any legacy picker that a cached older script may have created. */
  document.querySelectorAll('.cursor-easter-egg').forEach((element) => element.remove());
  applyCursor(style);
})();
