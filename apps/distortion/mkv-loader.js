/* DISTORTION MKV import bridge — 2026-08-26
   Keeps the original Distortion video loader untouched. MKV files are
   converted/remuxed in a Web Worker, then re-submitted as browser-ready MP4. */
(() => {
  'use strict';

  const videoInput = document.getElementById('videoInput');
  const statusText = document.getElementById('statusText');
  if (!videoInput) return;

  const FFMPEG_PACKAGE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd';
  const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
  const MKV_TYPES = new Set(['video/x-matroska', 'video/mkv', 'application/x-matroska']);

  let enginePromise = null;
  let runtimePromise = null;
  let replayingChange = false;
  let converting = false;
  let currentFileName = '';
  let workerBlobURL = '';

  function setStatus(text) {
    if (statusText) statusText.textContent = String(text).toUpperCase();
  }

  function isMkv(file) {
    return Boolean(file && (/\.mkv$/i.test(file.name || '') || MKV_TYPES.has(file.type)));
  }

  async function fetchChecked(url, as = 'arrayBuffer') {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`converter download failed (${response.status})`);
    return as === 'text' ? response.text() : response.arrayBuffer();
  }

  async function toBlobURL(url, mimeType) {
    const bytes = await fetchChecked(url);
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }

  async function installFFmpegRuntime() {
    if (window.FFmpegWASM?.FFmpeg) return;
    if (runtimePromise) return runtimePromise;

    runtimePromise = (async () => {
      setStatus('MKV SUPPORT — LOADING CONVERTER');
      const [mainSource, workerSource] = await Promise.all([
        fetchChecked(`${FFMPEG_PACKAGE}/ffmpeg.js`, 'text'),
        fetchChecked(`${FFMPEG_PACKAGE}/814.ffmpeg.js`, 'text'),
      ]);

      workerBlobURL = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      window.__DISTORTION_FFMPEG_WORKER_URL__ = workerBlobURL;

      const workerExpression = 'new URL(e.p+e.u(814),e.b)';
      const patchedSource = mainSource.replace(workerExpression, 'window.__DISTORTION_FFMPEG_WORKER_URL__');
      if (patchedSource === mainSource) throw new Error('converter worker could not be prepared');

      const scriptURL = URL.createObjectURL(new Blob([patchedSource], { type: 'text/javascript' }));
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = scriptURL;
          script.dataset.distortionMkvFfmpeg = 'true';
          script.onload = resolve;
          script.onerror = () => reject(new Error('converter runtime could not load'));
          (document.head || document.documentElement).appendChild(script);
        });
      } finally {
        URL.revokeObjectURL(scriptURL);
      }

      if (!window.FFmpegWASM?.FFmpeg) throw new Error('converter runtime unavailable');
    })().catch(error => {
      runtimePromise = null;
      throw error;
    });

    return runtimePromise;
  }

  async function getEngine() {
    if (enginePromise) return enginePromise;

    enginePromise = (async () => {
      await installFFmpegRuntime();
      setStatus('MKV SUPPORT — LOADING VIDEO ENGINE (~31 MB)');

      const ffmpeg = new window.FFmpegWASM.FFmpeg();
      ffmpeg.on('log', ({ message }) => console.debug('[DISTORTION MKV]', message));
      ffmpeg.on('progress', ({ progress }) => {
        if (!converting || !Number.isFinite(progress) || progress <= 0 || progress > 1) return;
        setStatus(`MKV CONVERTING ${currentFileName} — ${Math.round(progress * 100)}%`);
      });

      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${FFMPEG_CORE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${FFMPEG_CORE}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);

      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })().catch(error => {
      enginePromise = null;
      throw error;
    });

    return enginePromise;
  }

  function browserCanRead(blob, timeoutMs = 5000) {
    return new Promise(resolve => {
      const test = document.createElement('video');
      const url = URL.createObjectURL(blob);
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        test.removeAttribute('src');
        test.load();
        URL.revokeObjectURL(url);
        resolve(result);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      test.preload = 'metadata';
      test.muted = true;
      test.addEventListener('loadedmetadata', () => finish(true), { once: true });
      test.addEventListener('error', () => finish(false), { once: true });
      test.src = url;
      test.load();
    });
  }

  async function removeVirtualFile(ffmpeg, name) {
    try { await ffmpeg.deleteFile(name); } catch {}
  }

  function convertedName(file) {
    const base = (file.name || 'video').replace(/\.mkv$/i, '');
    return `${base}-browser.mp4`;
  }

  async function convertMkv(file, position, total) {
    const ffmpeg = await getEngine();
    currentFileName = file.name || `CLIP ${position + 1}`;

    const token = `${Date.now()}-${position}-${Math.random().toString(36).slice(2, 8)}`;
    const inputName = `input-${token}.mkv`;
    const remuxName = `remux-${token}.mp4`;
    const transcodeName = `transcode-${token}.mp4`;

    try {
      setStatus(`MKV ${position + 1}/${total} — READING ${currentFileName}`);
      await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

      // Fast path: most H.264/AAC MKVs only need the Matroska container swapped
      // for MP4. No video frames are re-encoded in this path.
      setStatus(`MKV ${position + 1}/${total} — FAST REMUX ${currentFileName}`);
      const remuxExit = await ffmpeg.exec([
        '-y', '-i', inputName,
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c', 'copy', '-movflags', '+faststart',
        remuxName,
      ]);

      if (remuxExit === 0) {
        const bytes = await ffmpeg.readFile(remuxName);
        const blob = new Blob([bytes], { type: 'video/mp4' });
        if (await browserCanRead(blob)) {
          return new File([blob], convertedName(file), {
            type: 'video/mp4',
            lastModified: file.lastModified || Date.now(),
          });
        }
      }

      // Compatibility path: codecs the browser cannot decode are converted to
      // H.264/AAC. This is slower, but it happens in FFmpeg's worker so the UI
      // remains responsive instead of freezing the Distortion page.
      setStatus(`MKV ${position + 1}/${total} — TRANSCODING ${currentFileName}`);
      const transcodeExit = await ffmpeg.exec([
        '-y', '-i', inputName,
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        transcodeName,
      ]);
      if (transcodeExit !== 0) throw new Error(`could not convert ${file.name}`);

      const bytes = await ffmpeg.readFile(transcodeName);
      const blob = new Blob([bytes], { type: 'video/mp4' });
      if (!(await browserCanRead(blob))) throw new Error(`converted ${file.name} is not playable in this browser`);

      return new File([blob], convertedName(file), {
        type: 'video/mp4',
        lastModified: file.lastModified || Date.now(),
      });
    } finally {
      await removeVirtualFile(ffmpeg, inputName);
      await removeVirtualFile(ffmpeg, remuxName);
      await removeVirtualFile(ffmpeg, transcodeName);
    }
  }

  function addHelpNote() {
    if (document.querySelector('[data-mkv-import-note]')) return;
    const label = videoInput.closest('.file-label') || videoInput.parentElement;
    if (!label?.parentElement) return;
    const note = document.createElement('p');
    note.className = 'micro-help';
    note.dataset.mkvImportNote = 'true';
    note.textContent = 'MKV supported. MKV clips are converted locally in your browser before loading; the first MKV import downloads the video engine once.';
    label.insertAdjacentElement('afterend', note);
  }

  async function handleVideoSelection(event) {
    if (replayingChange || converting) return;
    const selected = [...(videoInput.files || [])];
    if (!selected.some(isMkv)) return;

    // The original app listens in the normal bubbling phase. Capturing here
    // prevents raw MKV files from reaching it while leaving every other format
    // on the original Distortion code path.
    event.preventDefault();
    event.stopImmediatePropagation();

    converting = true;
    videoInput.disabled = true;
    const mkvCount = selected.filter(isMkv).length;

    try {
      const readyFiles = [];
      let mkvPosition = 0;
      for (const file of selected) {
        if (!isMkv(file)) {
          readyFiles.push(file);
          continue;
        }
        readyFiles.push(await convertMkv(file, mkvPosition, mkvCount));
        mkvPosition += 1;
      }

      const transfer = new DataTransfer();
      readyFiles.forEach(file => transfer.items.add(file));
      videoInput.files = transfer.files;

      replayingChange = true;
      videoInput.disabled = false;
      videoInput.dispatchEvent(new Event('change', { bubbles: true }));
      setStatus(`${mkvCount} MKV ${mkvCount === 1 ? 'CLIP' : 'CLIPS'} READY`);
    } catch (error) {
      console.error('[DISTORTION MKV] Import failed', error);
      setStatus(`MKV IMPORT FAILED — ${error.message || 'CONVERSION ERROR'}`);
    } finally {
      replayingChange = false;
      converting = false;
      currentFileName = '';
      videoInput.disabled = false;
    }
  }

  videoInput.addEventListener('change', handleVideoSelection, true);
  addHelpNote();
})();
