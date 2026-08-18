"use strict";

// 0PTICSCOPE X-Y fidelity patch v39
// Keeps live stereo oscilloscope music sample-paired: LEFT[n] = X, RIGHT[n] = Y.
(() => {
  const XY_FFT_SIZE = 8192;
  let xyDisplayScale = 1;

  // Make a physically neutral X-Y setup the default.
  state.xyPhase = 0;
  state.xyAutoGain = false;
  if ($("xyPhase")) {
    $("xyPhase").value = "0";
    $("xyPhaseOut").value = "0°";
  }
  if ($("xyAutoGain")) $("xyAutoGain").checked = false;

  // Capture a much larger, unsmoothed time-domain window. The display still
  // renders at the browser frame rate, but the beam path is built from every
  // available PCM sample in the analyser window instead of every other sample.
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
    node.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, channels > 1 ? 1 : 0);
    node.connect(monoAnalyser);
    node.connect(recordDest);
    if (monitor) node.connect(audioContext.destination);
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
      lastTracePoints.push({x: px, y: py});
      n++ ? c.lineTo(px, py) : c.moveTo(px, py);
    };

    if (currentInput === "ART SIGNAL" && artPoints.length > 1) {
      const pts = pngSpinActive ? transformedPngPoints() : artPoints;
      const step = Math.max(1, Math.floor(pts.length / 12000));
      for (let i = 0; i < pts.length; i += step) {
        plot(pts[i].x * state.xGain, pts[i].y * state.yGain * invert);
      }
    } else {
      const len = Math.min(leftData.length, rightData.length);
      let leftPeak = 0, rightPeak = 0;

      // Peak scan is only for signal detection / optional display leveling.
      // It never changes the relationship between X and Y samples.
      for (let i = 0; i < len; i += 8) {
        leftPeak = Math.max(leftPeak, Math.abs(leftData[i]));
        rightPeak = Math.max(rightPeak, Math.abs(rightData[i]));
      }

      const peak = Math.max(leftPeak, rightPeak);
      const hasSignal = peak > .0005;

      if (state.xyAutoGain && hasSignal) {
        const target = Math.min(8, .82 / Math.max(peak, .0005));
        // Slow follower prevents the picture from pumping/zooming every frame.
        xyDisplayScale += (target - xyDisplayScale) * .06;
      } else {
        xyDisplayScale += (1 - xyDisplayScale) * .18;
      }

      if (hasSignal) {
        // 0° means true oscilloscope mapping: L[n] -> X, R[n] -> Y.
        // The phase control remains available as an optional manual offset.
        const phaseSamples = state.xyPhase === 0
          ? 0
          : Math.round((state.xyPhase / 360) * len);

        for (let i = 0; i < len; i++) {
          const ri = (i + phaseSamples + len) % len;
          const x = leftData[i] * xyDisplayScale * state.xGain;
          const y = rightData[ri] * xyDisplayScale * state.yGain * invert;
          plot(x, y);
        }
      } else {
        // Keep the existing calibration figure when no source is active.
        const t = performance.now() * .001;
        const N = 1100, a = 3, b = 2;
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
    c.globalAlpha = .18;
    c.lineWidth = state.focus * 3;
    c.stroke();
    c.restore();
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

  // Keep the Help-page preset aligned with the neutral real-scope calibration.
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

  // Correct the older help copy so it does not tell users to reintroduce
  // a phase shift or unequal axis gain when testing oscilloscope music.
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
