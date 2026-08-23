"use strict";

// 0PTICSCOPE X-Y fidelity + responsive render patch v41
// Keeps true stereo sample pairing while avoiding thousands of invisible canvas
// operations per frame. The display is tuned for fast, musical response.
(() => {
  // 2048 samples is ~43 ms at 48 kHz: enough for accurate X-Y geometry while
  // feeling much more immediate than the previous 8192-sample (~171 ms) window.
  const XY_FFT_SIZE = 2048;
  const TIER_POINTS = { full: 2048, mid: 1200, low: 720 };
  const TIER_PARTICLES = { full: 320, mid: 200, low: 110 };
  const TIER_EMIT = { full: 8, mid: 5, low: 3 };

  let xyDisplayScale = 1;
  let desktopDualMonoFrames = 0;
  let desktopWarning = "";
  let desktopCaptureChannels = 0;
  let desktopDisplaySurface = "";
  let lastMeterUpdate = 0;
  let cachedSignalRms = 0;
  let gridCache = null;
  let gridCacheKey = "";

  const perfTier = () => {
    const tier = window.OPTICBOX_PERF?.tier;
    return tier === "low" || tier === "mid" ? tier : "full";
  };

  function fastRms(a) {
    if (!a?.length) return 0;
    let s = 0, n = 0;
    // Metering does not need every PCM sample. Sampling every fourth point keeps
    // the meter/particles responsive without rescanning the whole analyser twice.
    for (let i = 0; i < a.length; i += 4) {
      const v = a[i];
      s += v * v;
      n++;
    }
    return n ? Math.sqrt(s / n) : 0;
  }

  function rememberTracePoint(x, y, plottedIndex) {
    // Particles only need representative positions along the beam, not one new
    // object for every line segment. This removes a large source of GC stutter.
    if ((plottedIndex & 7) === 0) lastTracePoints.push({ x, y });
  }

  // Make a physically neutral X-Y setup the default.
  state.xyPhase = 0;
  state.xyAutoGain = false;
  if ($("xyPhase")) {
    $("xyPhase").value = "0";
    $("xyPhaseOut").value = "0°";
  }
  if ($("xyAutoGain")) $("xyAutoGain").checked = false;

  // Explain the one capture choice that matters most for oscilloscope music.
  const desktopBtn = $("desktopBtn");
  if (desktopBtn) {
    desktopBtn.title = "For oscilloscope music, choose the browser tab playing the video and share its tab audio.";
    const inputBox = desktopBtn.closest("fieldset");
    if (inputBox && !$("xyStereoHint")) {
      const hint = document.createElement("p");
      hint.id = "xyStereoHint";
      hint.className = "small files-note";
      hint.textContent = "X-Y STEREO: when DESKTOP opens the share picker, choose the browser tab playing the oscilloscope video. Whole-screen/system capture may arrive as mono or dual-mono and collapse the X-Y picture into a line.";
      const audio = $("audioElement");
      inputBox.insertBefore(hint, audio || null);
    }
  }

  function setDesktopWarning(text) {
    if (desktopWarning === text) return;
    desktopWarning = text;
    if (!text) {
      if (currentInput === "DESKTOP AUDIO") {
        ui.inputReadout.textContent = "DESKTOP AUDIO";
        status("INPUT ACTIVE");
      }
      return;
    }
    if (currentInput === "DESKTOP AUDIO") {
      ui.inputReadout.textContent = text.includes("MONO") ? "DESKTOP MONO" : "DESKTOP AUDIO";
      status(text);
    }
  }

  function stereoSimilarity(a, b) {
    const len = Math.min(a.length, b.length);
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, diff = 0, energy = 0, n = 0;
    for (let i = 0; i < len; i += 8) {
      const x = a[i], y = b[i];
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      diff += Math.abs(x - y);
      energy += Math.abs(x) + Math.abs(y);
      n++;
    }
    if (n < 4) return { correlation: 0, difference: 1 };
    const cov = sxy - sx * sy / n;
    const vx = sxx - sx * sx / n;
    const vy = syy - sy * sy / n;
    const correlation = cov / Math.sqrt(Math.max(1e-12, vx * vy));
    const difference = diff / Math.max(1e-9, energy);
    return { correlation, difference };
  }

  // Keep true left/right sample pairing, but use a shorter analyser window for a
  // much more responsive display. 2048 points is still above visible canvas detail.
  setupAnalysis = function(node, channels = 2, monitor = false) {
    leftAnalyser = audioContext.createAnalyser();
    rightAnalyser = audioContext.createAnalyser();
    monoAnalyser = audioContext.createAnalyser();

    [leftAnalyser, rightAnalyser, monoAnalyser].forEach(a => {
      a.fftSize = XY_FFT_SIZE;
      a.smoothingTimeConstant = 0;
    });

    leftData = new Float32Array(XY_FFT_SIZE);
    rightData = new Float32Array(XY_FFT_SIZE);
    monoData = new Float32Array(XY_FFT_SIZE);

    splitter = audioContext.createChannelSplitter(2);
    try { splitter.channelInterpretation = "discrete"; } catch (_) {}
    node.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);
    node.connect(monoAnalyser);
    node.connect(recordDest);
    if (monitor) node.connect(audioContext.destination);
  };

  // Prefer a browser-tab share for stereo oscilloscope material.
  connectDesktop = async function() {
    disconnectInput();
    await ensureAudio();
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw Error("Screen/tab audio sharing is not available in this browser.");
    }

    let stream;
    const preferred = {
      video: {
        width: { ideal: 320 },
        height: { ideal: 180 },
        frameRate: { ideal: 5, max: 10 },
        displaySurface: "browser"
      },
      audio: true,
      systemAudio: "exclude",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include"
    };

    try {
      stream = await navigator.mediaDevices.getDisplayMedia(preferred);
    } catch (err) {
      if (err?.name === "TypeError" || err?.name === "OverconstrainedError") {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 5, max: 10 } },
          audio: true
        });
      } else {
        throw err;
      }
    }

    sourceStream = stream;
    const audioTracks = sourceStream.getAudioTracks();
    if (!audioTracks.length) {
      sourceStream.getTracks().forEach(t => t.stop());
      sourceStream = null;
      throw Error("No shared audio track was provided. Choose the browser tab playing the video and enable Share tab audio.");
    }

    const settings = audioTracks[0].getSettings?.() || {};
    desktopCaptureChannels = Number(settings.channelCount || 0);
    desktopDisplaySurface = sourceStream.getVideoTracks()[0]?.getSettings?.().displaySurface || "";
    desktopDualMonoFrames = 0;
    desktopWarning = "";

    sourceNode = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
    setupAnalysis(sourceNode, desktopCaptureChannels || 2);
    currentInput = "DESKTOP AUDIO";
    ui.inputReadout.textContent = currentInput;

    if (desktopCaptureChannels === 1) {
      setDesktopWarning("MONO CAPTURE · CHOOSE BROWSER TAB AUDIO");
    } else if (desktopDisplaySurface && desktopDisplaySurface !== "browser") {
      status("DESKTOP ACTIVE · BROWSER TAB RECOMMENDED");
    } else {
      status("STEREO TAB AUDIO ACTIVE");
    }
  };

  // Cache the graticule instead of rebuilding 20+ stroked paths every frame.
  grid = function(c, w, h, col) {
    if (!state.grid) return;
    const key = `${w}x${h}:${col.grid.join(",")}`;
    if (!gridCache || gridCacheKey !== key) {
      gridCache = document.createElement("canvas");
      gridCache.width = w;
      gridCache.height = h;
      const g = gridCache.getContext("2d");
      g.lineWidth = 1;
      g.strokeStyle = `rgba(${col.grid},.52)`;
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const x = i * w / 10;
        g.moveTo(x, 0); g.lineTo(x, h);
      }
      for (let i = 0; i <= 8; i++) {
        const y = i * h / 8;
        g.moveTo(0, y); g.lineTo(w, y);
      }
      g.stroke();
      g.strokeStyle = `rgba(${col.grid},.85)`;
      g.beginPath();
      g.moveTo(w / 2, 0); g.lineTo(w / 2, h);
      g.moveTo(0, h / 2); g.lineTo(w, h / 2);
      g.stroke();
      gridCacheKey = key;
    }
    c.drawImage(gridCache, 0, 0);
  };

  // TIME mode previously inherited the full 8192-sample window. Limit the
  // visible path to about one canvas-width worth of points for faster response.
  drawTime = function(c, w, h, col) {
    const len = monoData.length;
    const tier = perfTier();
    const maxPoints = tier === "full" ? 1400 : tier === "mid" ? 900 : 600;
    const start = triggerIndex(monoData, state.triggerLevel);
    const available = Math.max(1, len - start);
    const requested = Math.max(64, Math.floor(available / state.sweep));
    const step = Math.max(1, Math.ceil(requested / maxPoints));
    const samples = Math.ceil(requested / step);

    lastTracePoints = [];
    c.save();
    beam(c, col);
    c.beginPath();
    let drawn = 0;
    for (let i = 0; i < requested; i += step) {
      const j = start + Math.floor(i * state.sweep);
      if (j >= len) break;
      const x = drawn * w / Math.max(1, samples - 1);
      const y = h / 2 - monoData[j] * state.gain * h * .38;
      if (drawn) c.lineTo(x, y); else c.moveTo(x, y);
      rememberTracePoint(x, y, drawn);
      drawn++;
    }
    c.stroke();
    c.globalAlpha = .16;
    c.lineWidth = state.focus * 2.6;
    c.stroke();
    c.restore();
  };

  drawXY = function(c, w, h, col) {
    const effectiveRotation = state.rotation + (state.zSpin ? zSpinAngle : 0);
    const r = effectiveRotation * Math.PI / 180;
    const cr = Math.cos(r), sr = Math.sin(r), invert = state.invertY ? -1 : 1;

    lastTracePoints = [];
    c.save();
    beam(c, col);
    c.globalCompositeOperation = "lighter";
    c.beginPath();

    let n = 0;
    const plot = (x, y) => {
      const xr = x * cr - y * sr;
      const yr = x * sr + y * cr;
      const px = w / 2 + xr * w * .39;
      const py = h / 2 - yr * h * .39;
      if (n) c.lineTo(px, py); else c.moveTo(px, py);
      rememberTracePoint(px, py, n);
      n++;
    };

    if (currentInput === "ART SIGNAL" && artPoints.length > 1) {
      const pts = pngSpinActive ? transformedPngPoints() : artPoints;
      const maxPoints = perfTier() === "full" ? 4096 : perfTier() === "mid" ? 2400 : 1400;
      const step = Math.max(1, Math.ceil(pts.length / maxPoints));
      for (let i = 0; i < pts.length; i += step) {
        plot(pts[i].x * state.xGain, pts[i].y * state.yGain * invert);
      }
    } else {
      const len = Math.min(leftData.length, rightData.length);
      let leftPeak = 0, rightPeak = 0;

      for (let i = 0; i < len; i += 8) {
        leftPeak = Math.max(leftPeak, Math.abs(leftData[i]));
        rightPeak = Math.max(rightPeak, Math.abs(rightData[i]));
      }

      const peak = Math.max(leftPeak, rightPeak);
      const hasSignal = peak > .0005;

      if (currentInput === "DESKTOP AUDIO" && hasSignal) {
        if (desktopCaptureChannels === 1 || rightPeak < .00005) {
          desktopDualMonoFrames = 40;
          setDesktopWarning("MONO CAPTURE · CHOOSE BROWSER TAB AUDIO");
        } else {
          const sim = stereoSimilarity(leftData, rightData);
          const looksDuplicated = sim.correlation > .9995 && sim.difference < .008;
          desktopDualMonoFrames = looksDuplicated
            ? Math.min(60, desktopDualMonoFrames + 1)
            : Math.max(0, desktopDualMonoFrames - 2);

          if (desktopDualMonoFrames > 18) {
            setDesktopWarning("DUAL-MONO CAPTURE · SHARE THE VIDEO TAB, NOT THE SCREEN");
          } else if (desktopDualMonoFrames === 0 && desktopWarning) {
            setDesktopWarning("");
          }
        }
      }

      if (state.xyAutoGain && hasSignal) {
        const target = Math.min(8, .82 / Math.max(peak, .0005));
        xyDisplayScale += (target - xyDisplayScale) * .08;
      } else {
        xyDisplayScale += (1 - xyDisplayScale) * .22;
      }

      if (hasSignal) {
        const phaseSamples = state.xyPhase === 0
          ? 0
          : Math.round((state.xyPhase / 360) * len);
        const maxPoints = TIER_POINTS[perfTier()];
        const step = Math.max(1, Math.ceil(len / maxPoints));

        for (let i = 0; i < len; i += step) {
          const ri = (i + phaseSamples + len) % len;
          const x = leftData[i] * xyDisplayScale * state.xGain;
          const y = rightData[ri] * xyDisplayScale * state.yGain * invert;
          plot(x, y);
        }
      } else {
        const t = performance.now() * .001;
        const N = perfTier() === "full" ? 720 : perfTier() === "mid" ? 520 : 360;
        const a = 3, b = 2;
        const phaseRad = Math.PI / 2 + state.xyPhase * Math.PI / 180;
        for (let i = 0; i < N; i++) {
          const q = i / (N - 1) * Math.PI * 2;
          plot(
            Math.sin(a * q + t * .18) * .78 * state.xGain,
            Math.sin(b * q + phaseRad + t * .11) * .78 * state.yGain * invert
          );
        }
      }
    }

    c.stroke();
    c.globalAlpha = .16;
    c.lineWidth = state.focus * 2.6;
    c.stroke();
    c.restore();
  };

  emitPhosphorParticles = function() {
    if (!state.particles || lastTracePoints.length < 2) return;
    const tier = perfTier();
    const level = Math.max(
      cachedSignalRms * 7,
      currentInput === "ART SIGNAL" ? .35 : 0,
      mode === "xy" && currentInput === "NO INPUT" ? .2 : 0
    );
    const requested = Math.floor(Math.max(0, level - .04) * (state.particleAmount / 100) * 18);
    const count = Math.min(TIER_EMIT[tier], requested);
    for (let i = 0; i < count; i++) {
      const p = lastTracePoints[Math.floor(Math.random() * lastTracePoints.length)];
      phosphorParticles.push({
        x: p.x, y: p.y,
        vx: (Math.random() - .5) * (1 + level * 4),
        vy: (Math.random() - .5) * (1 + level * 4),
        life: 1,
        size: .6 + Math.random() * 1.8
      });
    }
    const cap = TIER_PARTICLES[tier];
    if (phosphorParticles.length > cap) {
      phosphorParticles.splice(0, phosphorParticles.length - cap);
    }
  };

  drawPhosphorParticles = function(c, col) {
    if (!state.particles) {
      phosphorParticles.length = 0;
      return;
    }
    emitPhosphorParticles(col);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.fillStyle = `rgb(${col.trace})`;
    c.shadowColor = `rgb(${col.trace})`;
    c.shadowBlur = perfTier() === "low" ? 4 : perfTier() === "mid" ? 6 : 8;

    let write = 0;
    for (let i = 0; i < phosphorParticles.length; i++) {
      const q = phosphorParticles[i];
      q.x += q.vx * state.particleDrift;
      q.y += q.vy * state.particleDrift;
      q.vy += .004 * state.particleDrift;
      q.life *= state.particleDecay;
      if (q.life < .025) continue;
      c.globalAlpha = q.life * .78;
      const size = q.size * 2;
      c.fillRect(q.x - q.size, q.y - q.size, size, size);
      phosphorParticles[write++] = q;
    }
    phosphorParticles.length = write;
    c.restore();
  };

  // Reduce non-visual work in the hot loop: calculate the signal level once and
  // update DOM text at 10 Hz instead of forcing layout/text changes every frame.
  animate = function(now = performance.now()) {
    const dt = Math.min(.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    if (pngSpinActive) pngSpinAngle += dt * state.spinSpeed * Math.PI * 2;
    if (state.zSpin) zSpinAngle = (zSpinAngle + dt * state.zSpinSpeed * 360) % 360;
    frame++;
    readAudio();
    cachedSignalRms = fastRms(monoData);
    render(ctx, canvas.width, canvas.height);
    if (now - lastMeterUpdate >= 100) {
      ui.signalReadout.textContent = `${(cachedSignalRms * 5).toFixed(3)} V`;
      lastMeterUpdate = now;
    }
    if (recorder?.state === "recording") drawRecordFrame();
    requestAnimationFrame(animate);
  };

  if ($("xyAutoGain")) {
    $("xyAutoGain").onchange = e => {
      state.xyAutoGain = e.target.checked;
      if (!state.xyAutoGain) xyDisplayScale = 1;
    };
  }

  if ($("resetXYBtn")) {
    $("resetXYBtn").onclick = () => {
      [["xGain", 1], ["yGain", 1], ["rotation", 0], ["xyPhase", 0], ["zSpinSpeed", .08]]
        .forEach(([id, v]) => {
          $(id).value = v;
          $(id).dispatchEvent(new Event("input"));
        });
      $("invertY").checked = false;
      state.invertY = false;
      $("zSpinToggle").checked = false;
      state.zSpin = false;
      zSpinAngle = 0;
      $("xyAutoGain").checked = false;
      state.xyAutoGain = false;
      xyDisplayScale = 1;
    };
  }

  if (typeof recommendedSettings !== "undefined") {
    recommendedSettings.xGain = 1;
    recommendedSettings.yGain = 1;
    recommendedSettings.xyPhase = 0;
  }
  if ($("applyRecommendedBtn")) {
    $("applyRecommendedBtn").onclick = () => {
      Object.entries(recommendedSettings).forEach(([id, v]) => {
        const el = $(id);
        if (el) {
          el.value = v;
          el.dispatchEvent(new Event("input"));
        }
      });
      [
        ["particlesToggle", "particles", true],
        ["triggerToggle", "trigger", true],
        ["zSpinToggle", "zSpin", false],
        ["invertY", "invertY", false],
        ["xyAutoGain", "xyAutoGain", false]
      ].forEach(([id, key, on]) => {
        const el = $(id);
        el.checked = on;
        state[key] = on;
      });
      zSpinAngle = 0;
      xyDisplayScale = 1;
      $("recommendedStatus").textContent =
        "Recommended real-scope settings applied. Fine-tune X/Y gain only if the source needs it.";
    };
  }

  const helpTerms = [...document.querySelectorAll("#page-help dt")];
  const recommendedXY = helpTerms.find(dt => dt.textContent.trim() === "X-Y CALIBRATION" && dt.parentElement?.previousElementSibling?.textContent?.includes("RECOMMENDED"));
  if (recommendedXY?.nextElementSibling) {
    recommendedXY.nextElementSibling.textContent =
      "X Gain 1.00× · Y Gain 1.00× · Rotation 0° · Phase 0° · Z Auto Spin OFF · Z Spin Speed 0.05× · Invert Y OFF · Auto Level X-Y OFF";
  }
  const phaseTerm = helpTerms.find(dt => dt.textContent.trim() === "PHASE");
  if (phaseTerm?.nextElementSibling) {
    phaseTerm.nextElementSibling.textContent =
      "Offsets Y relative to X as an optional effect or manual correction. For true stereo oscilloscope music, start at 0° so LEFT[n] and RIGHT[n] stay paired.";
  }
  const autoTerm = helpTerms.find(dt => dt.textContent.trim() === "AUTO LEVEL X-Y");
  if (autoTerm?.nextElementSibling) {
    autoTerm.nextElementSibling.textContent =
      "Slowly enlarges quiet incoming signals. Leave it OFF for fixed, repeatable real-scope geometry; enable it only when you want automatic display leveling.";
  }
})();
