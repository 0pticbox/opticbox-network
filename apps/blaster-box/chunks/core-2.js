"use strict";
  function randomFrom(range,current,amt,round=true){
    const v = current*(1-amt) + rand(range[0],range[1])*amt;
    return round ? Math.round(v) : v;
  }

  function randomize(push=true){
    const t = els.type.value;
    const r = recipes[t] || recipes["LASER"];
    const a = +els.randomAmount.value/100;
    els.start.value = randomFrom(r.start,+els.start.value,a);
    els.sweep.value = randomFrom(r.sweep,+els.sweep.value,a);
    els.sweepDecay.value = randomFrom(r.sweepDecay,+els.sweepDecay.value,a);
    els.pitchCurve.value = Math.round(randomFrom(r.curve,+els.pitchCurve.value/100,a,false)*100);
    els.length.value = randomFrom(r.length,+els.length.value,a);
    els.mix.value = randomFrom(r.mix,+els.mix.value,a);
    els.detune.value = randomFrom(r.detune,+els.detune.value,a);
    els.fm.value = randomFrom(r.fm,+els.fm.value,a);
    els.noise.value = randomFrom(r.noise,+els.noise.value,a);
    els.attack.value = randomFrom(r.attack,+els.attack.value,a);
    els.body.value = Math.round(randomFrom(r.body,+els.body.value/100,a,false)*100);
    els.charge.value = randomFrom(r.charge,+els.charge.value,a);
    els.pulseWidth.value = randomFrom(r.pulse,+els.pulseWidth.value,a);
    els.filter.value = randomFrom(r.filter,+els.filter.value,a);
    els.resonance.value = Math.round(randomFrom(r.res,+els.resonance.value/10,a,false)*10);
    els.filterEnv.value = randomFrom(r.filterEnv,+els.filterEnv.value,a);
    els.drive.value = randomFrom(r.drive,+els.drive.value,a);
    els.delay.value = randomFrom(r.delay,+els.delay.value,a);
    els.feedback.value = randomFrom(r.fb,+els.feedback.value,a);
    els.delayMix.value = randomFrom(r.dmix,+els.delayMix.value,a);
    els.reverb.value = randomFrom(r.rev,+els.reverb.value,a);
    els.reverbSize.value = Math.round(randomFrom(r.rsize,+els.reverbSize.value/100,a,false)*100);

    const waves = ["sine","triangle","sawtooth","square","pulse"];
    if(customWT && els.lock.checked){
      els.osc1.value = "custom";
      els.wtPos.value = Math.round(rand(0,100));
      els.wtMove.value = Math.round(rand(-85,85));
    }else{
      els.osc1.value = (customWT && Math.random()<.22) ? "custom" : choose(waves);
      els.osc2.value = Math.random()<.12 ? "noise" : ((customWT && Math.random()<.09) ? "custom" : choose(waves));
      if(customWT){
        els.wtPos.value = Math.round(rand(0,100));
        els.wtMove.value = Math.round(rand(-90,90));
      }
    }

    generation++;
    updateAll();
    if(push){
      history = history.slice(0,historyIndex+1);
      history.push(readPatch());
      historyIndex = history.length-1;
    }
    setStatus(`${t} #${String(generation).padStart(3,"0")} GENERATED — ${Math.round(readPatch().start)}→${Math.round(endPitchHz(readPatch()))} HZ`);
  }

  $("#randomBtn").addEventListener("click",()=>randomize(true));
  $("#nextBtn").addEventListener("click",async()=>{
    randomize(true);
    if(els.autoFire.checked) await fire();
  });
  $("#prevBtn").addEventListener("click",()=>{
    if(historyIndex>0){
      historyIndex--;
      applyPatch(history[historyIndex]);
      setStatus("PREVIOUS LASER RESTORED.");
    }else setStatus("NO EARLIER LASER IN HISTORY.");
  });

  function getAudioContext(){
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    return audioCtx;
  }

  function baseWave(type,phase,pulseWidth){
    const x = phase-Math.floor(phase);
    if(type==="sine") return Math.sin(x*Math.PI*2);
    if(type==="triangle") return 1-4*Math.abs(x-.5);
    if(type==="square") return x<.5?1:-1;
    if(type==="pulse") return x<(pulseWidth/100)?1:-1;
    if(type==="noise") return Math.random()*2-1;
    return 2*x-1;
  }

  function frameSample(frame,phase){
    const x = (phase-Math.floor(phase))*frame.length;
    const a = Math.floor(x)%frame.length, b=(a+1)%frame.length, f=x-Math.floor(x);
    return frame[a]*(1-f)+frame[b]*f;
  }

  function wavetableSample(phase,pos){
    if(!customWT || !customWT.frames.length) return baseWave("sawtooth",phase,50);
    const frames = customWT.frames;
    if(frames.length===1) return frameSample(frames[0],phase);
    const fp = clamp(pos,0,1)*(frames.length-1);
    const a = Math.floor(fp), b=Math.min(frames.length-1,a+1), f=fp-a;
    return lerp(frameSample(frames[a],phase),frameSample(frames[b],phase),f);
  }

  function synthSample(type,phase,p,pTime){
    return type==="custom" ? wavetableSample(phase,wtPositionAt(p,pTime)) : baseWave(type,phase,p.pulseWidth);
  }

  function amplitudeAt(p,t){
    const dur = Math.max(.005,p.length/1000);
    const charge = shotStartSec(p);
    if(charge>.001 && t<charge){
      const x=clamp(t/charge,0,1);
      return .06 + .24*Math.pow(x,1.4);
    }
    const shotT = Math.max(0,t-charge);
    const shotDur = Math.max(.01,dur-charge);
    const attack = Math.min(p.attack/1000,shotDur*.35);
    const a = attack>.0001 ? clamp(shotT/attack,0,1) : 1;
    const x = clamp((shotT-attack)/Math.max(.005,shotDur-attack),0,1);
    const body = Math.pow(Math.max(0,1-x),Math.max(.25,p.body));
    return a*body;
  }

  function makeVoiceBuffer(ctx,p){
    const sr=ctx.sampleRate;
    const dur=Math.max(.06,p.length/1000);
    const n=Math.ceil(dur*sr);
    const buf=ctx.createBuffer(1,n,sr);
    const out=buf.getChannelData(0);
    let ph1=0,ph2=0;
    const mix=p.mix/100, detuneRatio=Math.pow(2,p.detune/12);
    const fmDepth=(p.fm/100)*.42;
    const noiseAmt=(p.noise/100)*.7;
    const charge=shotStartSec(p);

    for(let i=0;i<n;i++){
      const t=i/sr;
      const f1=clamp(pitchAt(p,t),12,sr*.42);
      const f2=clamp(f1*detuneRatio,12,sr*.42);
      ph1 += f1/sr;
      ph2 += f2/sr;

      const mod=synthSample(p.osc2,ph2,p,t);
      const w1=synthSample(p.osc1,ph1 + mod*fmDepth,p,t);
      const w2=mod;
      let sig=w1*(1-mix)+w2*mix;

      const sinceShot=Math.max(0,t-charge);
      const burst=Math.exp(-sinceShot/.025)*noiseAmt*(Math.random()*2-1);
      if(t>=charge) sig += burst;

      sig *= amplitudeAt(p,t)*.76;
      out[i]=clamp(sig,-1.2,1.2);
    }
    return buf;
  }

  function makeDriveCurve(amount){
    const n=4096, curve=new Float32Array(n);
    const k=Math.max(.01,amount/100*18);
    for(let i=0;i<n;i++){
      const x=i*2/(n-1)-1;
      curve[i]=(1+k)*x/(1+k*Math.abs(x));
    }
    return curve;
  }

  function makeImpulse(ctx,seconds){
    const sec=clamp(seconds,.08,2.2), n=Math.ceil(ctx.sampleRate*sec);
    const b=ctx.createBuffer(2,n,ctx.sampleRate);
    for(let c=0;c<2;c++){
      const d=b.getChannelData(c);
      for(let i=0;i<n;i++){
        const decay=Math.pow(1-i/n,2.2);
        d[i]=(Math.random()*2-1)*decay;
      }
    }
    return b;
  }

  function scheduleFilter(filter,p,startTime){
    const dur=p.length/1000, steps=22;
    const base=clamp(p.filter,80,19000);
    const envOct=(p.filterEnv/100)*3.1;
    for(let i=0;i<=steps;i++){
      const x=i/steps, t=startTime+dur*x;
      const shaped=Math.pow(x,Math.max(.2,p.pitchCurve));
      const mult=Math.pow(2,envOct*(1-shaped));
      const hz=clamp(base*mult,90,19000);
      if(i===0) filter.frequency.setValueAtTime(hz,t);
      else filter.frequency.linearRampToValueAtTime(hz,t);
    }
  }

  function wireAudio(ctx,destination,p,startTime=0){
    const src=ctx.createBufferSource();
    src.buffer=makeVoiceBuffer(ctx,p);

    const filter=ctx.createBiquadFilter();
    filter.type="lowpass";
    filter.Q.value=clamp(p.resonance,0,20);
    scheduleFilter(filter,p,startTime);

    const shaper=ctx.createWaveShaper();
    shaper.curve=makeDriveCurve(p.drive);
    shaper.oversample="2x";

    const pre=ctx.createGain();
    pre.gain.value=.84;

    const dry=ctx.createGain();
    const delaySend=ctx.createGain();
    const revSend=ctx.createGain();
    dry.gain.value=1;
    delaySend.gain.value=p.delayMix/100;
    revSend.gain.value=p.reverb/100;

    const dL=ctx.createDelay(1.2), dR=ctx.createDelay(1.2);
    dL.delayTime.value=clamp(p.delay/1000,0,.9);
    dR.delayTime.value=clamp(p.delay/1000*1.31+.018,0,.95);
    const panL=ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const panR=ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if(panL) panL.pan.value=-.65;
    if(panR) panR.pan.value=.65;

    const fbL=ctx.createGain(), fbR=ctx.createGain();
    fbL.gain.value=clamp(p.feedback/100,0,.82);
    fbR.gain.value=clamp(p.feedback/100*.92,0,.78);

    const conv=ctx.createConvolver();
    conv.buffer=makeImpulse(ctx,p.reverbSize);
    const revGain=ctx.createGain();
    revGain.gain.value=.74;

    const master=ctx.createGain();
    master.gain.value=.86;

    src.connect(filter);
    filter.connect(shaper);
    shaper.connect(pre);
    pre.connect(dry); dry.connect(master);

    pre.connect(delaySend);
    delaySend.connect(dL); delaySend.connect(dR);
    if(panL){ dL.connect(panL); panL.connect(master); } else dL.connect(master);
    if(panR){ dR.connect(panR); panR.connect(master); } else dR.connect(master);
    dL.connect(fbL); fbL.connect(dL);
    dR.connect(fbR); fbR.connect(dR);

    pre.connect(revSend); revSend.connect(conv); conv.connect(revGain); revGain.connect(master);
    master.connect(destination);

    src.start(startTime);
    return src;
  }

  async function fire(){
    try{
      const p=readPatch();
      const ctx=getAudioContext();
      if(ctx.state==="suspended") await ctx.resume();
      wireAudio(ctx,ctx.destination,p,ctx.currentTime);
      startAnimation(p);
      setStatus("FIRE! — BUILDING WAV...");
      await renderWav();
    }catch(err){
      console.error(err);
      setStatus("AUDIO ERROR: "+err.message);
    }
  }
  $("#fireBtn").addEventListener("click",fire);

  // SPACE LOCK:
  // Spacebar is reserved ONLY for firing the current laser.
  // Capture-phase listeners block native button/select/range behavior before controls can react.
  let spaceFireHeld=false;

  document.addEventListener("keydown", async e=>{
    if(e.code!=="Space") return;

    e.preventDefault();
    e.stopPropagation();

    if(e.repeat || spaceFireHeld) return;
    spaceFireHeld=true;

    const btn=$("#fireBtn");
    btn.classList.add("key-fired");
    try{
      await fire();
    }finally{
      setTimeout(()=>btn.classList.remove("key-fired"),80);
    }
  }, true);

  document.addEventListener("keyup", e=>{
    if(e.code!=="Space") return;
    e.preventDefault();
    e.stopPropagation();
    spaceFireHeld=false;
  }, true);

  window.addEventListener("blur", ()=>{
    spaceFireHeld=false;
  });

