const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");

const connectButton = document.getElementById("connectButton");
const stopButton = document.getElementById("stopButton");

const sensitivitySlider = document.getElementById("sensitivity");
const fallSpeedSlider = document.getElementById("fallSpeed");
const bassBoostSlider = document.getElementById("bassBoost");
const barCountSlider = document.getElementById("barCount");

const sensitivityValue = document.getElementById("sensitivityValue");
const fallValue = document.getElementById("fallValue");
const bassValue = document.getElementById("bassValue");
const barValue = document.getElementById("barValue");

const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const statusLight = document.getElementById("statusLight");
const connectionBadge = document.getElementById("connectionBadge");

const levelMeter = document.getElementById("levelMeter");
const levelNumber = document.getElementById("levelNumber");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const COLORS = {
  black: "#000000", darkBlue: "#1d2b53", purple: "#7e2553", darkGreen: "#008751",
  brown: "#ab5236", darkGray: "#5f574f", lightGray: "#c2c3c7", white: "#fff1e8",
  red: "#ff004d", orange: "#ffa300", yellow: "#ffec27", green: "#00e436",
  blue: "#29adff", lavender: "#83769c", pink: "#ff77a8", peach: "#ffccaa"
};

let audioContext = null;
let analyser = null;
let captureStream = null;
let sourceNode = null;
let frequencyData = null;
let timeData = null;
let connected = false;
let visualTime = 0;
let detectedLevel = 0;
let displayedBars = [];
let peakBars = [];

ctx.imageSmoothingEnabled = false;

function setStatus(type, title, message) {
  statusTitle.textContent = title;
  statusText.textContent = message;
  statusLight.classList.remove("connected", "warning");
  if (type === "connected") statusLight.classList.add("connected");
  if (type === "warning") statusLight.classList.add("warning");
}

function updateControlLabels() {
  sensitivityValue.textContent = `${Number(sensitivitySlider.value).toFixed(1)}×`;
  fallValue.textContent = Number(fallSpeedSlider.value).toFixed(2);
  bassValue.textContent = `${Number(bassBoostSlider.value).toFixed(1)}×`;
  barValue.textContent = barCountSlider.value;
}

function ensureBarArrays(count) {
  while (displayedBars.length < count) { displayedBars.push(0); peakBars.push(0); }
  if (displayedBars.length > count) { displayedBars.length = count; peakBars.length = count; }
}

function drawPixelText(text, x, y, size, color, align = "center") {
  ctx.save();
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000";
  ctx.fillText(text, x + 3, y + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const pulse = Math.max(0, detectedLevel);
  for (let i = 0; i < 45; i++) {
    const speed = (i % 3) + 1;
    const x = (i * 89 + Math.floor(visualTime * speed)) % WIDTH;
    const y = (i * 53 + 70) % 330;
    const size = i % 7 === 0 ? 4 : 2;
    ctx.fillStyle = i % 3 === 0 ? COLORS.purple : COLORS.darkBlue;
    ctx.fillRect(x, y, size, size);
  }
  ctx.fillStyle = pulse > 0.35 ? COLORS.purple : COLORS.darkBlue;
  ctx.fillRect(0, 384, WIDTH, 8);
  ctx.fillStyle = COLORS.darkBlue;
  ctx.fillRect(0, 392, WIDTH, HEIGHT - 392);
  ctx.strokeStyle = COLORS.lavender;
  ctx.lineWidth = 2;
  for (let y = 410; y < HEIGHT; y += 22) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }
  const floorOffset = (visualTime * 2) % 40;
  for (let x = -WIDTH; x < WIDTH * 2; x += 40) {
    ctx.beginPath(); ctx.moveTo(WIDTH / 2, 392); ctx.lineTo(x + floorOffset, HEIGHT); ctx.stroke();
  }
}

function calculateInputLevel() {
  if (!analyser || !timeData) {
    detectedLevel = 0;
    levelMeter.style.width = "0%";
    levelNumber.textContent = "0%";
    return 0;
  }
  analyser.getByteTimeDomainData(timeData);
  let sumSquares = 0;
  for (let i = 0; i < timeData.length; i++) {
    const normalized = (timeData[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / timeData.length);
  const sensitivity = Number(sensitivitySlider.value);
  detectedLevel = Math.min(1, rms * sensitivity * 4.5);
  const percent = Math.round(detectedLevel * 100);
  levelMeter.style.width = `${percent}%`;
  levelNumber.textContent = `${percent}%`;
  return detectedLevel;
}

function getFrequencyBars(count) {
  const values = new Array(count).fill(0);
  if (!connected || !analyser || !frequencyData) {
    for (let i = 0; i < count; i++) {
      values[i] = 15 + Math.max(0, Math.sin(visualTime * 0.04 + i * 0.55) * 16);
    }
    return values;
  }
  analyser.getByteFrequencyData(frequencyData);
  const sensitivity = Number(sensitivitySlider.value);
  const bassBoost = Number(bassBoostSlider.value);
  const minimumBin = 1;
  const maximumBin = Math.floor(frequencyData.length * 0.72);
  for (let bar = 0; bar < count; bar++) {
    const startRatio = bar / count;
    const endRatio = (bar + 1) / count;
    const startBin = Math.floor(minimumBin * Math.pow(maximumBin / minimumBin, startRatio));
    const endBin = Math.max(startBin + 1, Math.floor(minimumBin * Math.pow(maximumBin / minimumBin, endRatio)));
    let total = 0, peak = 0, samples = 0;
    for (let bin = startBin; bin <= endBin && bin < frequencyData.length; bin++) {
      const value = frequencyData[bin];
      total += value; peak = Math.max(peak, value); samples++;
    }
    const average = samples > 0 ? total / samples : 0;
    let normalized = ((average * 0.72) + (peak * 0.28)) / 255;
    if (bar < count * 0.32) {
      const bassAmount = 1 - bar / (count * 0.32);
      normalized *= 1 + bassAmount * (bassBoost - 1);
    }
    normalized *= sensitivity;
    normalized = Math.pow(Math.min(1, normalized), 0.72);
    values[bar] = normalized * 285;
  }
  return values;
}

function getBarColor(height) {
  if (height > 235) return COLORS.red;
  if (height > 180) return COLORS.orange;
  if (height > 115) return COLORS.yellow;
  if (height > 55) return COLORS.green;
  return COLORS.blue;
}

function drawBars(values) {
  const count = values.length;
  ensureBarArrays(count);
  const margin = 24;
  const availableWidth = WIDTH - margin * 2;
  const gap = count >= 48 ? 2 : 4;
  const barWidth = (availableWidth - gap * (count - 1)) / count;
  const floorY = 374;
  const fallSpeed = Number(fallSpeedSlider.value);
  for (let i = 0; i < count; i++) {
    const target = values[i];
    if (target > displayedBars[i]) displayedBars[i] += (target - displayedBars[i]) * 0.72;
    else displayedBars[i] *= fallSpeed;
    const height = Math.max(3, Math.floor(displayedBars[i]));
    if (height > peakBars[i]) peakBars[i] = height;
    else peakBars[i] = Math.max(0, peakBars[i] - 1.7);
    const x = margin + i * (barWidth + gap);
    const y = floorY - height;
    ctx.fillStyle = getBarColor(height);
    ctx.fillRect(Math.floor(x), y, Math.max(1, Math.floor(barWidth)), height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(Math.floor(x), y, Math.max(1, Math.floor(barWidth)), 3);
    const peakY = floorY - Math.floor(peakBars[i]);
    ctx.fillStyle = COLORS.pink;
    ctx.fillRect(Math.floor(x), peakY, Math.max(1, Math.floor(barWidth)), 4);
  }
}

function drawWaveform() {
  if (!connected || !analyser || !timeData) return;
  analyser.getByteTimeDomainData(timeData);
  ctx.strokeStyle = COLORS.pink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const waveY = 330, waveHeight = 30;
  for (let i = 0; i < timeData.length; i++) {
    const x = (i / (timeData.length - 1)) * WIDTH;
    const normalized = (timeData[i] - 128) / 128;
    const y = waveY + normalized * waveHeight;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawTitles() {
  const loud = detectedLevel > 0.34;
  drawPixelText("0PTICBOX", WIDTH / 2, 18, 42, loud ? COLORS.yellow : COLORS.white);
  drawPixelText("DESKTOP AUDIO // LIVE", WIDTH / 2, 70, 17, connected ? COLORS.green : COLORS.red);
  if (!connected) drawPixelText("CONNECT AUDIO TO BEGIN", WIDTH / 2, 342, 15, COLORS.lightGray);
}

function draw() {
  visualTime++;
  drawBackground();
  calculateInputLevel();
  const count = Number(barCountSlider.value);
  const values = getFrequencyBars(count);
  drawBars(values);
  drawWaveform();
  drawTitles();
  requestAnimationFrame(draw);
}

async function connectDesktopAudio() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error("Screen audio capture is not supported in this browser.");
    }
    connectButton.disabled = true;
    setStatus("warning", "SELECT YOUR SCREEN", "Choose Entire Screen and enable Share system audio.");
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: "include",
      surfaceSwitching: "include"
    });
    const audioTracks = captureStream.getAudioTracks();
    console.log("Captured tracks:", captureStream.getTracks());
    if (audioTracks.length === 0) {
      captureStream.getTracks().forEach(track => track.stop());
      captureStream = null;
      connectionBadge.textContent = "NO AUDIO";
      throw new Error("No audio track was received. Choose Entire Screen and enable Share system audio.");
    }
    const audioTrack = audioTracks[0];
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.65;
    analyser.minDecibels = -110;
    analyser.maxDecibels = -10;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    const audioOnlyStream = new MediaStream([audioTrack]);
    sourceNode = audioContext.createMediaStreamSource(audioOnlyStream);
    sourceNode.connect(analyser);
    connected = true;
    connectButton.disabled = true;
    stopButton.disabled = false;
    connectionBadge.textContent = "LIVE";
    connectionBadge.classList.add("connected");
    setStatus("connected", "AUDIO CONNECTED", `Source: ${audioTrack.label || "shared desktop audio"}`);
    audioTrack.addEventListener("mute", () => setStatus("warning", "AUDIO TRACK MUTED", "The audio track exists, but the browser reports that it is muted."));
    audioTrack.addEventListener("unmute", () => setStatus("connected", "AUDIO RECEIVING", `Source: ${audioTrack.label || "shared desktop audio"}`));
    captureStream.getTracks().forEach(track => track.addEventListener("ended", stopAudio));
  } catch (error) {
    console.error("Capture error:", error);
    connected = false;
    connectButton.disabled = false;
    stopButton.disabled = true;
    connectionBadge.textContent = "ERROR";
    connectionBadge.classList.remove("connected");
    setStatus("warning", "CONNECTION FAILED", `${error.name || "Error"}: ${error.message || "Audio capture failed."}`);
  }
}

function stopAudio() {
  connected = false;
  if (captureStream) { captureStream.getTracks().forEach(track => track.stop()); captureStream = null; }
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  analyser = null; frequencyData = null; timeData = null; detectedLevel = 0;
  levelMeter.style.width = "0%";
  levelNumber.textContent = "0%";
  connectButton.disabled = false;
  stopButton.disabled = true;
  connectionBadge.textContent = "OFFLINE";
  connectionBadge.classList.remove("connected");
  setStatus("offline", "AUDIO DISCONNECTED", "Press Connect Desktop Audio to start again.");
}

[sensitivitySlider, fallSpeedSlider, bassBoostSlider, barCountSlider].forEach(control => control.addEventListener("input", updateControlLabels));
connectButton.addEventListener("click", connectDesktopAudio);
stopButton.addEventListener("click", stopAudio);
updateControlLabels();
draw();
