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
      alreadyPlayed =
        sessionStorage.getItem('opticbox-intro-played') === '1';
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
          <strong>0PTICBOX</strong>
          <span>PRODUCTIONS</span>
        </div>

        <svg class="startup-wave" viewBox="0 0 620 120" role="img" aria-label="Animated signal waveform">
          <defs>
            <linearGradient id="startup-wave-gradient" x1="0" x2="1">
              <stop offset="0" stop-color="#ff6b36"></stop>
              <stop offset=".48" stop-color="#ff5ca8"></stop>
              <stop offset="1" stop-color="#65e8ff"></stop>
            </linearGradient>
          </defs>
          <path class="startup-wave-shadow"
            d="M0 60 C35 60 42 25 75 25 S112 94 148 94 S188 35 224 35 S265 78 302 78 S340 17 378 17 S419 101 456 101 S498 42 535 42 S575 60 620 60">
          </path>
          <path class="startup-wave-line"
            d="M0 60 C35 60 42 25 75 25 S112 94 148 94 S188 35 224 35 S265 78 302 78 S340 17 378 17 S419 101 456 101 S498 42 535 42 S575 60 620 60">
          </path>
        </svg>

        <div class="startup-readout" aria-live="polite">
          <span id="startup-message">INITIALIZING VISUAL SYSTEMS</span>
          <span id="startup-percent">0%</span>
        </div>

        <div class="startup-progress" aria-hidden="true">
          <i id="startup-progress-bar"></i>
        </div>

        <div class="startup-statuses" aria-hidden="true">
          <span>SIGNAL</span>
          <span>AUDIO</span>
          <span>VISUALS</span>
          <span>ONLINE</span>
        </div>
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
      [96, 'SYSTEM ONLINE']
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
      window.clearTimeout(watchdog);

      if (progressBar) progressBar.style.width = '100%';
      if (percent) percent.textContent = '100%';
      if (message) message.textContent = 'SYSTEM ONLINE';

      overlay.classList.add('startup-complete');

      window.setTimeout(() => {
        document.body.classList.remove('startup-active');
        overlay.remove();

        try {
          sessionStorage.setItem('opticbox-intro-played', '1');
        } catch (_) {
          // Session storage is optional.
        }
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

      if (raw >= 1) {
        closeIntro();
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    if (skip) skip.addEventListener('click', closeIntro);

    const handleEscape = (event) => {
      if (event.key === 'Escape') closeIntro();
    };

    document.addEventListener('keydown', handleEscape, { once: true });

    // Absolute failsafe: even if animation frames pause, a browser extension
    // interferes, or another script throws, the overlay is forcibly removed.
    watchdog = window.setTimeout(closeIntro, 1350);

    raf = requestAnimationFrame(tick);
  } catch (error) {
    console.error('Startup animation failed safely:', error);
    emergencyCleanup();
  }
})();


const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.site-nav');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

function animateCanvas(canvas, draw) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  let width = 1;
  let height = 1;
  let dpr = 1;
  let frame = 0;
  let start = performance.now();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  new ResizeObserver(resize).observe(canvas);

  const tick = (now) => {
    const elapsed = reducedMotion ? 0 : (now - start) / 1000;
    draw(context, width, height, elapsed);
    frame = requestAnimationFrame(tick);
  };

  tick(start);
  if (reducedMotion) cancelAnimationFrame(frame);
}

animateCanvas(document.getElementById('page-particles'), (ctx, width, height, time) => {
  ctx.clearRect(0, 0, width, height);
  const count = Math.min(70, Math.floor(width / 16));
  for (let index = 0; index < count; index += 1) {
    const x = (index * 137.5 + time * (5 + index % 4)) % (width + 40) - 20;
    const y = (index * 83.2 + Math.sin(time * .2 + index) * 18) % (height + 30) - 15;
    const alpha = .08 + .14 * (.5 + .5 * Math.sin(time + index * .73));
    ctx.fillStyle = index % 7 === 0 ? `rgba(255,107,54,${alpha})` : `rgba(55,216,255,${alpha})`;
    const size = index % 5 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
});

/* Site-wide cursor Easter egg -------------------------------------------- */
(() => {
  const STORAGE_KEY = 'opticbox-cursor-style';
  const allowed = new Set(['default', 'atom', 'star', 'heart', 'smile', 'rainbow']);
  const labels = {
    default: 'Normal',
    atom: 'Atom',
    star: 'Star',
    heart: 'Heart',
    smile: 'Smile',
    rainbow: 'Rainbow',
  };

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let style = 'default';
  let canvas = null;
  let context = null;
  let frame = 0;
  let dpr = 1;
  let lastTrail = 0;

  const particles = [];
  const pointer = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    targetX: window.innerWidth / 2,
    targetY: window.innerHeight / 2,
    active: false,
  };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (allowed.has(saved)) style = saved;
  } catch (_) {
    // Browser storage is optional.
  }

  const egg = document.createElement('details');
  egg.className = 'cursor-easter-egg';
  egg.innerHTML = `
    <summary aria-label="Open the hidden cursor selector">
      <span aria-hidden="true">✦</span>
      <span class="cursor-egg-hint">cursor?</span>
    </summary>
    <div class="cursor-egg-panel">
      <div class="cursor-egg-title">
        <strong>Secret cursor lab</strong>
        <small>Saved on this browser</small>
      </div>
      <div class="cursor-egg-options" role="group" aria-label="Website cursor">
        <button type="button" data-site-cursor="default"><span>↖</span>Normal</button>
        <button type="button" data-site-cursor="atom"><span>◉</span>Atom</button>
        <button type="button" data-site-cursor="star"><span>★</span>Star</button>
        <button type="button" data-site-cursor="heart"><span>♥</span>Heart</button>
        <button type="button" data-site-cursor="smile"><span>☺</span>Smile</button>
        <button type="button" data-site-cursor="rainbow"><span>◒</span>Rainbow</button>
      </div>
      <p class="cursor-egg-status" aria-live="polite"></p>
    </div>
  `;
  document.body.append(egg);

  const status = egg.querySelector('.cursor-egg-status');
  const buttons = [...egg.querySelectorAll('[data-site-cursor]')];

  function saveChoice(nextStyle) {
    try {
      localStorage.setItem(STORAGE_KEY, nextStyle);
    } catch (_) {
      // Browser storage is optional.
    }
  }

  function ensureCanvas() {
    if (canvas) return;

    canvas = document.createElement('canvas');
    canvas.className = 'site-cursor-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);

    context = canvas.getContext('2d');
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !context) return;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function starPath(x, y, outer, inner, rotation = -Math.PI / 2) {
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
    context.bezierCurveTo(
      x - size * 0.78, y - size * 0.12,
      x - size * 0.42, y - size * 0.78,
      x, y - size * 0.34
    );
    context.bezierCurveTo(
      x + size * 0.42, y - size * 0.78,
      x + size * 0.78, y - size * 0.12,
      x, y + size * 0.34
    );
    context.closePath();
  }

  function drawWhiteShape(drawPath, alpha = 1) {
    context.save();
    context.globalAlpha = alpha;
    context.shadowBlur = 8;
    context.shadowColor = 'rgba(255,255,255,.82)';
    context.strokeStyle = '#fff';
    context.fillStyle = 'rgba(255,255,255,.34)';
    context.lineWidth = 1.7;
    drawPath();
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawCube(x, y, size, rotation, alpha = 1) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.globalAlpha = alpha;
    context.shadowBlur = 7;
    context.shadowColor = 'rgba(255,255,255,.8)';
    context.strokeStyle = '#fff';
    context.fillStyle = 'rgba(255,255,255,.3)';
    context.lineWidth = 1.4;
    context.fillRect(-size / 2, -size / 2, size, size);
    context.strokeRect(-size / 2, -size / 2, size, size);
    context.restore();
  }

  function drawAtom(now) {
    const time = now * 0.0024;
    const orbitX = 15;
    const orbitY = 8;

    context.save();
    context.translate(pointer.x, pointer.y);
    context.rotate(time * 0.2);
    context.strokeStyle = 'rgba(255,255,255,.68)';
    context.lineWidth = 1;

    for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
      context.save();
      context.rotate(angle);
      context.beginPath();
      context.ellipse(0, 0, orbitX, orbitY, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    context.restore();
    drawCube(pointer.x, pointer.y, 7, time);

    for (let index = 0; index < 3; index += 1) {
      const phase = time * 2.1 + (Math.PI * 2 * index) / 3;
      drawCube(
        pointer.x + Math.cos(phase) * orbitX,
        pointer.y + Math.sin(phase) * orbitY,
        3.8,
        -time + index,
        0.9
      );
    }
  }

  function drawStar(now) {
    drawWhiteShape(() => {
      starPath(pointer.x, pointer.y, 13, 5.8, now * 0.002);
    });
  }

  function drawHeart(now) {
    const pulse = 1 + Math.sin(now * 0.008) * 0.09;
    drawWhiteShape(() => {
      heartPath(pointer.x, pointer.y, 17 * pulse);
    });
  }

  function drawSmile(now) {
    const x = pointer.x;
    const y = pointer.y + Math.sin(now * 0.006) * 1.5;

    context.save();
    context.strokeStyle = '#fff';
    context.fillStyle = 'rgba(255,255,255,.22)';
    context.lineWidth = 1.8;
    context.shadowBlur = 8;
    context.shadowColor = 'rgba(255,255,255,.8)';

    context.beginPath();
    context.arc(x, y, 13, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(x - 4.5, y - 3, 1.5, 0, Math.PI * 2);
    context.arc(x + 4.5, y - 3, 1.5, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.arc(x, y + 1, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    context.stroke();
    context.restore();
  }

  function drawRainbow() {
    const colors = ['#ff4f70', '#ff9738', '#ffe45f', '#64e68c', '#59d9ff', '#8b7cff'];
    const x = pointer.x;
    const y = pointer.y + 6;

    context.save();
    context.lineCap = 'round';

    colors.forEach((color, index) => {
      const radius = 16 - index * 2.15;

      context.beginPath();
      context.strokeStyle = 'rgba(0,0,0,.72)';
      context.lineWidth = 5;
      context.arc(x, y, radius, Math.PI, Math.PI * 2);
      context.stroke();

      context.beginPath();
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.shadowBlur = 5;
      context.shadowColor = color;
      context.arc(x, y, radius, Math.PI, Math.PI * 2);
      context.stroke();
    });

    context.restore();
  }

  function addParticle(now) {
    if (!pointer.active || motionReduced || now - lastTrail < 30) return;

    lastTrail = now;
    particles.push({
      x: pointer.x,
      y: pointer.y,
      life: 1,
      rotation: Math.random() * Math.PI * 2,
      size: 3 + Math.random() * 3,
      hue: Math.floor(Math.random() * 360),
      vx: (Math.random() - 0.5) * 0.8,
      vy: 0.25 + Math.random() * 0.65,
    });

    if (particles.length > 26) particles.shift();
  }

  function drawParticle(particle) {
    const alpha = Math.max(0, particle.life) * 0.65;
    const size = particle.size * Math.max(0.25, particle.life);

    if (style === 'rainbow') {
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = `hsl(${particle.hue} 95% 62%)`;
      context.shadowBlur = 6;
      context.shadowColor = context.fillStyle;
      context.fillRect(
        particle.x - size / 2,
        particle.y - size / 2,
        size,
        size
      );
      context.restore();
      return;
    }

    if (style === 'star') {
      drawWhiteShape(() => {
        starPath(
          particle.x,
          particle.y,
          size,
          size * 0.44,
          particle.rotation
        );
      }, alpha);
      return;
    }

    if (style === 'heart') {
      drawWhiteShape(() => {
        heartPath(particle.x, particle.y, size * 1.2);
      }, alpha);
      return;
    }

    if (style === 'smile') {
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(particle.x, particle.y, size * 0.55, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }

    drawCube(
      particle.x,
      particle.y,
      size,
      particle.rotation,
      alpha
    );
  }

  function render(now) {
    if (!context || style === 'default') {
      frame = 0;
      return;
    }

    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    pointer.x += (pointer.targetX - pointer.x) * 0.42;
    pointer.y += (pointer.targetY - pointer.y) * 0.42;

    addParticle(now);

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 0.045;
      particle.rotation += 0.08;

      if (particle.life <= 0) {
        particles.splice(index, 1);
      } else {
        drawParticle(particle);
      }
    }

    if (pointer.active) {
      if (style === 'atom') drawAtom(now);
      if (style === 'star') drawStar(now);
      if (style === 'heart') drawHeart(now);
      if (style === 'smile') drawSmile(now);
      if (style === 'rainbow') drawRainbow(now);
    }

    frame = window.requestAnimationFrame(render);
  }

  function stopCursor() {
    document.body.classList.remove('site-custom-cursor');
    particles.length = 0;

    if (canvas) {
      canvas.hidden = true;
      context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function startCursor() {
    if (!finePointer.matches || style === 'default') return;

    ensureCanvas();
    canvas.hidden = false;
    canvas.classList.toggle('site-cursor-rainbow', style === 'rainbow');
    document.body.classList.add('site-custom-cursor');

    if (!frame) frame = window.requestAnimationFrame(render);
  }

  function applyStyle(nextStyle, persist = true) {
    style = allowed.has(nextStyle) ? nextStyle : 'default';

    stopCursor();

    buttons.forEach((button) => {
      const selected = button.dataset.siteCursor === style;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    status.textContent = `${labels[style]} cursor active across the site.`;

    if (persist) saveChoice(style);
    if (style !== 'default') startCursor();
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      applyStyle(button.dataset.siteCursor || 'default');
    });
  });

  window.addEventListener('resize', resizeCanvas, { passive: true });

  window.addEventListener('mousemove', (event) => {
    pointer.targetX = event.clientX;
    pointer.targetY = event.clientY;
    pointer.active = true;
  }, { passive: true });

  document.documentElement.addEventListener('mouseleave', () => {
    pointer.active = false;
  });

  document.documentElement.addEventListener('mouseenter', () => {
    pointer.active = true;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    } else if (style !== 'default') {
      startCursor();
    }
  });

  finePointer.addEventListener?.('change', () => {
    stopCursor();
    if (style !== 'default') startCursor();
  });

  applyStyle(style, false);
})();
