// Cut a section out of a long audio file in the browser, before it is uploaded as the invitation's music.
// The file is decoded with Web Audio, the chosen part is shown on a waveform, and "Use this clip" encodes it
// as MP3 (lamejs, loaded from a CDN on first use; WAV if that can't load). Nothing leaves the browser.
import { el } from "./admin-ui.js";

const LAME_URL = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js";
const MP3_KBPS = 128;
const BYTES_PER_SEC = MP3_KBPS * 125;     // 128 kbit/s = 16,000 bytes per second
const MIN_CLIP = 1;                       // seconds
const FADE = 0.5;                         // seconds, when "fade" is ticked

let lamePromise = null;
const loadLame = () => (lamePromise ||= new Promise(resolve => {
  if(window.lamejs) return resolve(window.lamejs);
  const s = document.createElement("script");
  s.src = LAME_URL;
  s.onload = () => resolve(window.lamejs || null);
  s.onerror = () => resolve(null);
  document.head.append(s);
}));

const tick = () => new Promise(r => setTimeout(r));
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const mb = n => (n / 1024 / 1024).toFixed(1) + " MB";

/* ------------------------------- audio work ------------------------------- */
// One loudness value per column, for drawing the waveform.
function peaksOf(buf, columns){
  const out = new Float32Array(columns);
  const step = buf.length / columns, stride = Math.max(1, Math.floor(step / 48));
  for(let c = 0; c < buf.numberOfChannels; c++){
    const data = buf.getChannelData(c);
    for(let i = 0; i < columns; i++){
      let max = 0;
      for(let j = Math.floor(i * step), end = Math.floor((i + 1) * step); j < end; j += stride){
        const v = Math.abs(data[j]);
        if(v > max) max = v;
      }
      if(max > out[i]) out[i] = max;
    }
  }
  return out;
}

// The chosen part as one Float32Array per channel (at most two), with optional fades.
function clipOf(buf, start, end, fade){
  const rate = buf.sampleRate;
  const from = Math.floor(start * rate), to = Math.min(buf.length, Math.ceil(end * rate));
  const fadeLen = Math.min(Math.floor(FADE * rate), Math.floor((to - from) / 2));
  return Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => {
    const out = buf.getChannelData(c).slice(from, to);
    if(fade) for(let i = 0; i < fadeLen; i++){
      const g = i / fadeLen;
      out[i] *= g;
      out[out.length - 1 - i] *= g;
    }
    return out;
  });
}

const toInt16 = f => Int16Array.from(f, x => Math.max(-1, Math.min(1, x)) * 32767);

async function encodeMp3(lame, chans, rate, onProgress){
  const enc = new lame.Mp3Encoder(chans.length, rate, MP3_KBPS);
  const pcm = chans.map(toInt16), total = pcm[0].length, BLOCK = 1152, parts = [];
  for(let i = 0, n = 0; i < total; i += BLOCK, n++){
    const l = pcm[0].subarray(i, i + BLOCK);
    const data = pcm.length > 1 ? enc.encodeBuffer(l, pcm[1].subarray(i, i + BLOCK)) : enc.encodeBuffer(l);
    if(data.length) parts.push(data);
    if(n % 300 === 0){ onProgress(i / total); await tick(); }   // keep the page responsive
  }
  const last = enc.flush();
  if(last.length) parts.push(last);
  return new Blob(parts, { type: "audio/mpeg" });
}

// Plain 16-bit mono WAV, used only when the MP3 encoder can't be loaded.
function encodeWav(chans, rate){
  const n = chans[0].length, out = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at, s) => [...s].forEach((ch, i) => out.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); text(8, "WAVEfmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  text(36, "data"); out.setUint32(40, n * 2, true);
  for(let i = 0; i < n; i++){
    const mix = chans.reduce((sum, ch) => sum + ch[i], 0) / chans.length;
    out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mix)) * 32767, true);
  }
  return new Blob([out], { type: "audio/wav" });
}

/* ---------------------------------- dialog ---------------------------------- */
// Resolves with { bytes, name, type } for the music to upload, or null if the person cancels.
// Rejects if the browser can't decode the file (the caller can then use the file as it is).
export async function openTrimmer(file, { maxBytes }){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if(!AudioCtx) throw new Error("This browser can't read audio files for trimming.");
  const ctx = new AudioCtx();
  let buf, lame;
  try {
    [buf, lame] = await Promise.all([ctx.decodeAudioData(await file.arrayBuffer()), loadLame()]);
  } catch(e){
    ctx.close();
    throw e;
  }
  const duration = buf.duration;
  const perSecond = lame ? BYTES_PER_SEC : buf.sampleRate * 2;
  const estimate = secs => secs * perSecond;
  const longest = Math.floor(maxBytes * 0.95 / perSecond);

  let start = 0, end = Math.min(duration, longest), previewing = null;

  const dlg = el("dialog", "trim-dialog");
  const wave = el("div", "wave");
  const canvas = el("canvas");
  const dimL = el("div", "dim"), dimR = el("div", "dim");
  const handleL = el("div", "handle"), handleR = el("div", "handle");
  handleL.title = "Drag to set the start";
  handleR.title = "Drag to set the end";
  wave.append(canvas, dimL, dimR, handleL, handleR);

  const num = () => Object.assign(el("input"), { type: "number", min: 0, max: Math.ceil(duration * 10) / 10, step: 0.1 });
  const startIn = num(), endIn = num();
  const field = (label, input) => { const l = el("label", "field"); l.append(el("span", "", label), input); return l; };
  const fields = el("div", "trim-fields");
  fields.append(field("Start (seconds)", startIn), field("End (seconds)", endIn));

  const playBtn = el("button", "btn ghost small", "▶ Preview");
  playBtn.type = "button";
  const fade = Object.assign(el("input"), { type: "checkbox" });
  const fadeLabel = el("label", "check");
  fadeLabel.append(fade, " Fade in and out");
  const info = el("p", "muted");
  const error = el("p", "error");
  const useBtn = el("button", "btn primary", "Use this clip");
  useBtn.type = "button";
  const cancelBtn = el("button", "btn ghost", "Cancel");
  cancelBtn.type = "button";
  const tools = el("div", "row");
  tools.append(playBtn, fadeLabel);
  const actions = el("div", "row end");
  actions.append(cancelBtn, useBtn);

  dlg.append(
    el("h2", "", "Cut the part you want"),
    el("p", "muted", `${file.name} · ${mmss(duration)} long. Drag the gold handles, or type exact times.`),
    wave, fields, tools, info, error, actions
  );
  document.body.append(dlg);

  function stopPreview(){
    const s = previewing;
    previewing = null;
    try { s?.stop(); } catch {}
    playBtn.textContent = "▶ Preview";
  }

  // Redraws the shaded areas, handles, boxes and the size note for the current start and end.
  function refresh(){
    stopPreview();
    const pct = t => (t / duration * 100) + "%";
    dimL.style.width = pct(start);
    dimR.style.width = (100 - end / duration * 100) + "%";
    handleL.style.left = pct(start);
    handleR.style.left = pct(end);
    startIn.value = start.toFixed(1);
    endIn.value = end.toFixed(1);
    const bytes = estimate(end - start);
    const tooBig = bytes > maxBytes;
    info.textContent = `Clip: ${mmss(end - start)} · about ${mb(bytes)}`;
    error.textContent = tooBig ? `That's more than ${mb(maxBytes)} — choose at most ${mmss(longest)}.` : "";
    useBtn.disabled = tooBig;
  }

  function setRange(s, e, moved){
    s = Math.max(0, Math.min(s, duration - MIN_CLIP));
    e = Math.min(duration, Math.max(e, MIN_CLIP));
    if(e - s < MIN_CLIP){
      if(moved === "start") s = Math.max(0, e - MIN_CLIP); else e = Math.min(duration, s + MIN_CLIP);
    }
    start = s;
    end = e;
    refresh();
  }

  const timeAt = ev => {
    const r = wave.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * duration;
  };
  [[handleL, "start"], [handleR, "end"]].forEach(([h, which]) => {
    h.addEventListener("pointerdown", ev => { h.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    h.addEventListener("pointermove", ev => {
      if(!h.hasPointerCapture(ev.pointerId)) return;
      const t = timeAt(ev);
      if(which === "start") setRange(t, end, "start"); else setRange(start, t, "end");
    });
  });
  startIn.addEventListener("change", () => setRange(parseFloat(startIn.value) || 0, end, "start"));
  endIn.addEventListener("change", () => setRange(start, parseFloat(endIn.value) || duration, "end"));

  playBtn.addEventListener("click", async () => {
    if(previewing) return stopPreview();
    await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => { if(previewing === src) stopPreview(); };
    previewing = src;
    playBtn.textContent = "■ Stop";
    src.start(0, start, end - start);
  });

  function drawWave(){
    const w = wave.clientWidth || 600, h = 96, dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.fillStyle = "#7d1528";
    peaksOf(buf, Math.floor(w / 2)).forEach((p, i) => {
      const bar = Math.max(1, p * h * 0.95);
      g.fillRect(i * 2, (h - bar) / 2, 1.4, bar);
    });
  }

  return new Promise(resolve => {
    let finished = false;
    const finish = result => {
      if(finished) return;
      finished = true;
      stopPreview();
      ctx.close();
      dlg.close();
      dlg.remove();
      resolve(result);
    };
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); finish(null); });
    cancelBtn.addEventListener("click", () => finish(null));

    useBtn.addEventListener("click", async () => {
      stopPreview();
      const whole = start < 0.05 && end > duration - 0.05;
      const base = file.name.replace(/\.[^.]+$/, "");
      // The whole song, as it is, when it already fits: no re-encoding, no quality loss.
      if(whole && !fade.checked && file.size <= maxBytes){
        return finish({ bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type || "audio/mpeg" });
      }
      useBtn.disabled = cancelBtn.disabled = true;
      try {
        const chans = clipOf(buf, start, end, fade.checked);
        const blob = lame
          ? await encodeMp3(lame, chans, buf.sampleRate, f => { useBtn.textContent = `Cutting… ${Math.round(f * 100)}%`; })
          : encodeWav(chans, buf.sampleRate);
        if(blob.size > maxBytes) throw new Error(`The clip came out at ${mb(blob.size)}. Please choose a shorter part.`);
        finish({
          bytes: new Uint8Array(await blob.arrayBuffer()),
          name: `${base}-clip.${lame ? "mp3" : "wav"}`,
          type: blob.type
        });
      } catch(e){
        console.error(e);
        error.textContent = "Couldn't cut the audio: " + e.message;
        useBtn.textContent = "Use this clip";
        cancelBtn.disabled = false;
        refresh();
      }
    });

    dlg.showModal();
    drawWave();
    refresh();
  });
}
