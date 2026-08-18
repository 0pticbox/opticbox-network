"use strict";

// 0PTICSCOPE X-Y fidelity patch v40
// Keeps live stereo oscilloscope music sample-paired: LEFT[n] = X, RIGHT[n] = Y.
(() => {
  const XY_FFT_SIZE = 8192;
  let xyDisplayScale = 1;
  let desktopDualMonoFrames = 0;
  let desktopWarning = "";
  let desktopCaptureChannels = 0;
  let desktopDisplaySurface = "";

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
    for (let i = 0; i < len; i += 16) {
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

  // Capture a much larger, unsmoothed time-domain window. The display still
  // renders at the browser frame rate, but the beam path is built from every
  // available PCM sample in the analyser window instead of every other sample.
  // Channel 0 and channel 1 are kept discrete; a mono source is NOT duplicated.
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
    // Always read the actual second channel. If the source is mono this stays
    // silent instead of fabricating Y from X.
    splitter.connect(rightAnalyser, 1);
    node.connect(monoAnalyser);
    node.connect(recordDest);
    if (monitor) node.connect(audioContext.destination);
  };

  // Prefer a browser-tab share for stereo oscilloscope material. These options
  // guide Chromium/Edge's picker but the user still chooses the source.
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
      // Fall back for browsers that reject one of the newer display hints.
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
      lastTracePoints.push({ x: px, y: py });
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

      for (let i = 0; i < len; i += 8) {
        leftPeak = Math.max(leftPeak, Math.abs(leftData[i]));
        rightPeak = Math.max(rightPeak, Math.abs(rightData[i]));
      }

      const peak = Math.max(leftPeak, rightPeak);
      const hasSignal = peak > .0005;

      // Detect the exact failure shown by a 45-degree X-Y line: both captured
      // channels contain essentially the same waveform for a sustained period.
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
        xyDisplayScale += (target - xyDisplayScale) * .06;
      } else {
        xyDisplayScale += (1 - xyDisplayScale) * .18;
      }

      if (hasSignal) {
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