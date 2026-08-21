// BLASTER BOX core/audio/UI
  "use strict";

  const $ = s => document.querySelector(s);
  const status = $("#status");
  const gun = $("#gunCanvas"), g = gun.getContext("2d");
  const scope = $("#scopeCanvas"), sctx = scope.getContext("2d");
  const pitchCanvas = $("#pitchCanvas"), pctx = pitchCanvas.getContext("2d");

  const els = {
    type:$("#laserType"), skin:$("#laserSkin"), start:$("#startPitch"), sweep:$("#sweepAmount"),
    sweepDecay:$("#sweepDecay"), pitchCurve:$("#pitchCurve"), length:$("#length"),
    randomAmount:$("#randomAmount"), autoFire:$("#autoFire"),
    osc1:$("#osc1"), osc2:$("#osc2"), mix:$("#oscMix"), detune:$("#detune"),
    fm:$("#fm"), noise:$("#noiseBurst"), wtPos:$("#wtPos"), wtMove:$("#wtMove"),
    lock:$("#lockCustom"), attack:$("#attack"), body:$("#bodyCurve"),
    charge:$("#chargeTime"), pulseWidth:$("#pulseWidth"),
    filter:$("#filter"), resonance:$("#resonance"), filterEnv:$("#filterEnv"),
    drive:$("#drive"), delay:$("#delayTime"), feedback:$("#feedback"),
    delayMix:$("#delayMix"), reverb:$("#reverb"), reverbSize:$("#reverbSize")
  };

  let audioCtx = null;
  let customWT = null;
  let renderedBlob = null, renderedUrl = null;
  let history = [], historyIndex = -1;
  let animStart = 0, animDuration = 0, animPatch = null, raf = 0;
  let generation = 1;

  function setStatus(msg){ status.textContent = msg; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function rand(a,b){ return a + Math.random()*(b-a); }
  function choose(a){ return a[Math.floor(Math.random()*a.length)]; }
  function lerp(a,b,t){ return a+(b-a)*t; }

  function readPatch(){
    return {
      type:els.type.value, skin:els.skin.value,
      start:+els.start.value, sweep:+els.sweep.value, sweepDecay:+els.sweepDecay.value,
      pitchCurve:+els.pitchCurve.value/100, length:+els.length.value,
      randomAmount:+els.randomAmount.value, autoFire:els.autoFire.checked,
      osc1:els.osc1.value, osc2:els.osc2.value, mix:+els.mix.value,
      detune:+els.detune.value, fm:+els.fm.value, noise:+els.noise.value,
      wtPos:+els.wtPos.value, wtMove:+els.wtMove.value, lock:els.lock.checked,
      attack:+els.attack.value, body:+els.body.value/100, charge:+els.charge.value,
      pulseWidth:+els.pulseWidth.value,
      filter:+els.filter.value, resonance:+els.resonance.value/10,
      filterEnv:+els.filterEnv.value, drive:+els.drive.value,
      delay:+els.delay.value, feedback:+els.feedback.value,
      delayMix:+els.delayMix.value, reverb:+els.reverb.value,
      reverbSize:+els.reverbSize.value/100
    };
  }

  function applyPatch(p){
    const map = {
      type:"type",skin:"skin",start:"start",sweep:"sweep",sweepDecay:"sweepDecay",pitchCurve:"pitchCurve",
      length:"length",randomAmount:"randomAmount",autoFire:"autoFire",
      osc1:"osc1",osc2:"osc2",mix:"mix",detune:"detune",fm:"fm",noise:"noise",
      wtPos:"wtPos",wtMove:"wtMove",lock:"lock",attack:"attack",body:"body",
      charge:"charge",pulseWidth:"pulseWidth",filter:"filter",resonance:"resonance",
      filterEnv:"filterEnv",drive:"drive",delay:"delay",feedback:"feedback",
      delayMix:"delayMix",reverb:"reverb",reverbSize:"reverbSize"
    };
    Object.keys(map).forEach(k=>{
      if(p[k] === undefined) return;
      const e = map[k];
      if(e === "pitchCurve" || e === "body" || e === "reverbSize"){
        els[e].value = Math.round(p[k]*100);
      } else if(e === "resonance"){
        els[e].value = Math.round(p[k]*10);
      } else if(e === "lock" || e === "autoFire"){
        els[e].checked = !!p[k];
      } else {
        els[e].value = p[k];
      }
    });
    updateAll();
  }

  function endPitchHz(p){
    return Math.max(15,p.start*Math.pow(2,-p.sweep/12));
  }

  function shotStartSec(p){
    return clamp(p.charge/1000,0,Math.max(0,p.length/1000*.55));
  }

  function pitchAt(p,t){
    const dur = Math.max(.001,p.length/1000);
    const charge = shotStartSec(p);
    if(charge > .001 && t < charge){
      const x = clamp(t/charge,0,1);
      return p.start * lerp(.42,1,Math.pow(x,1.7));
    }
    const local = Math.max(0,t-charge);
    const decaySec = Math.max(.005,p.sweepDecay/1000);
    const x = clamp(local/decaySec,0,1);
    const shaped = Math.pow(x,Math.max(.15,p.pitchCurve));
    const end = endPitchHz(p);
    return p.start*Math.pow(end/p.start,shaped);
  }

  function wtPositionAt(p,t){
    const dur = Math.max(.001,p.length/1000);
    const x = clamp(t/dur,0,1);
    return clamp((p.wtPos + p.wtMove*Math.pow(x,1.2))/100,0,1);
  }

  function updateLabels(){
    const p = readPatch();
    $("#typeOut").value = p.type;
    $("#skinOut").value = p.skin;
    $("#startOut").value = `${Math.round(p.start)} Hz`;
    $("#sweepOut").value = `-${p.sweep} st`;
    $("#sweepDecayOut").value = `${p.sweepDecay} ms`;
    $("#curveOut").value = p.pitchCurve.toFixed(2);
    $("#lengthOut").value = `${p.length} ms`;
    $("#randomOut").value = `${p.randomAmount}%`;
    $("#osc1Out").value = els.osc1.options[els.osc1.selectedIndex].text;
    $("#osc2Out").value = els.osc2.options[els.osc2.selectedIndex].text;
    $("#mixOut").value = `${p.mix}%`;
    $("#detuneOut").value = `${p.detune} st`;
    $("#fmOut").value = `${p.fm}%`;
    $("#noiseOut").value = `${p.noise}%`;
    $("#wtOut").value = `${p.wtPos}%`;
    $("#wtMoveOut").value = `${p.wtMove>0?"+":""}${p.wtMove}%`;
    $("#attackOut").value = `${p.attack} ms`;
    $("#bodyOut").value = p.body.toFixed(2);
    $("#chargeOut").value = `${p.charge} ms`;
    $("#pulseOut").value = `${p.pulseWidth}%`;
    $("#filterOut").value = `${p.filter} Hz`;
    $("#resOut").value = p.resonance.toFixed(1);
    $("#filterEnvOut").value = `${p.filterEnv>0?"+":""}${p.filterEnv}%`;
    $("#driveOut").value = `${p.drive}%`;
    $("#delayOut").value = `${p.delay} ms`;
    $("#feedbackOut").value = `${p.feedback}%`;
    $("#delayMixOut").value = `${p.delayMix}%`;
    $("#reverbOut").value = `${p.reverb}%`;
    $("#reverbSizeOut").value = `${p.reverbSize.toFixed(2)} s`;
    $("#shotReadout").textContent =
      `${p.type} // ${p.skin} // ${Math.round(p.start)}→${Math.round(endPitchHz(p))} HZ // -${p.sweep} ST // ${p.length} MS // CURVE ${p.pitchCurve.toFixed(2)}`;
  }

  const skinThemes = {
    "SPIRAL POP": {
      css: {
        "--bg":"#061319","--panel":"#123745","--panel2":"#0a222b","--ink":"#f7fbf4",
        "--muted":"#9dc4c5","--pink":"#ff5c76","--cyan":"#48dce8","--green":"#a8e61d",
        "--yellow":"#ffe568","--orange":"#ff9b46","--red":"#f21f3d","--purple":"#5c3aa5"
      },
      beam: {
        outer:"#48dce8", accent:"#ff5c76", mid:"#ffe568", core:"#fff8dd",
        particles:["#ffe568","#48dce8","#ff5c76"], star1:"#48dce8", star2:"#8eb7b9"
      }
    },
    "CYAN BLASTER": {
      css: {
        "--bg":"#170b1d","--panel":"#3a1848","--panel2":"#24102d","--ink":"#fff6ec",
        "--muted":"#c3a8c9","--pink":"#ff5d8f","--cyan":"#ff9d2e","--green":"#a8e61d",
        "--yellow":"#ffd45c","--orange":"#ff7d3d","--red":"#ff4d67","--purple":"#71408d"
      },
      beam: {
        outer:"#ff9d2e", accent:"#ff5d8f", mid:"#a8e61d", core:"#fff7dd",
        particles:["#a8e61d","#ff9d2e","#ff5d8f"], star1:"#ff9d2e", star2:"#b790c1"
      }
    },
    "HEAT CANNON": {
      css: {
        "--bg":"#06141a","--panel":"#123946","--panel2":"#0a252d","--ink":"#f4ffff",
        "--muted":"#9fc4cb","--pink":"#ff7b8a","--cyan":"#38e6d2","--green":"#71f0ba",
        "--yellow":"#ffd166","--orange":"#ff8a3d","--red":"#ff4d5e","--purple":"#244a8f"
      },
      beam: {
        outer:"#38e6d2", accent:"#7ad7ff", mid:"#ffd166", core:"#ffffff",
        particles:["#38e6d2","#7ad7ff","#ffd166"], star1:"#38e6d2", star2:"#8faeb8"
      }
    },
    "SOLAR RAY": {
      css: {
        "--bg":"#100b22","--panel":"#30205a","--panel2":"#1d133a","--ink":"#fff9e8",
        "--muted":"#b9add6","--pink":"#ff5d9e","--cyan":"#60d5ff","--green":"#d7ff3f",
        "--yellow":"#fff56a","--orange":"#ff9b49","--red":"#ff4158","--purple":"#7d45c9"
      },
      beam: {
        outer:"#7d45c9", accent:"#60d5ff", mid:"#d7ff3f", core:"#fffbe0",
        particles:["#60d5ff","#d7ff3f","#ff5d9e"], star1:"#60d5ff", star2:"#a79bc8"
      }
    }
  };

  function getSkinTheme(skin){
    return skinThemes[skin] || skinThemes["SPIRAL POP"];
  }

  function applySkinTheme(skin){
    const theme = getSkinTheme(skin);
    const root = document.documentElement;
    Object.entries(theme.css).forEach(([key,value])=>root.style.setProperty(key,value));
  }

  function detectAlsina(){
    const badge=$("#fontStatus");
    if(!badge) return;
    const finish=()=>{
      const hasAlsina = !!(document.fonts && document.fonts.check &&
        (document.fonts.check('16px "Alsina"') || document.fonts.check('16px "Alcina"')));
      document.body.classList.toggle("font-fallback",!hasAlsina);
      badge.classList.toggle("missing",!hasAlsina);
      badge.textContent=hasAlsina ? "ALSINA ACTIVE" : "ALSINA NOT FOUND — PLAYFUL FALLBACK";
      drawScope();
      drawPitch();
    };
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(finish);
    else finish();
  }

  function updateAll(){
    applySkinTheme(readPatch().skin);
    updateLabels();
    drawScope();
    drawPitch();
    invalidateRender();
  }

  document.querySelectorAll("input[type=range],select,input[type=checkbox]").forEach(el=>{
    el.addEventListener("input",updateAll);
    el.addEventListener("change",updateAll);
  });

  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      $("#panel-"+btn.dataset.tab).classList.add("active");
    });
  });

  const recipes = {
    "SHORT ZAP":{
      start:[1700,4700],sweep:[30,64],sweepDecay:[40,145],curve:[1.1,3.6],length:[70,190],
      mix:[10,38],detune:[-5,13],fm:[0,24],noise:[0,16],attack:[0,4],body:[1.4,3.4],charge:[0,0],
      pulse:[18,48],filter:[7000,18000],res:[2,10],filterEnv:[5,48],drive:[5,36],
      delay:[0,90],fb:[0,20],dmix:[0,18],rev:[0,14],rsize:[.18,.65]
    },
    "LASER":{
      start:[1300,3900],sweep:[30,62],sweepDecay:[110,340],curve:[.7,2.8],length:[150,460],
      mix:[14,44],detune:[-7,16],fm:[5,32],noise:[0,18],attack:[0,6],body:[1.1,2.8],charge:[0,25],
      pulse:[18,52],filter:[5000,16500],res:[3,12],filterEnv:[8,58],drive:[8,42],
      delay:[40,190],fb:[4,32],dmix:[4,28],rev:[0,18],rsize:[.2,.8]
    },
    "PLASMA":{
      start:[900,3600],sweep:[22,58],sweepDecay:[140,520],curve:[.45,2.4],length:[230,720],
      mix:[28,65],detune:[-19,24],fm:[28,82],noise:[5,30],attack:[0,12],body:[.8,2.2],charge:[0,60],
      pulse:[12,70],filter:[3200,15000],res:[5,16],filterEnv:[-10,72],drive:[14,58],
      delay:[55,260],fb:[8,42],dmix:[8,34],rev:[6,28],rsize:[.3,1.1]
    },
    "CHARGE":{
      start:[950,3300],sweep:[28,58],sweepDecay:[160,520],curve:[.7,2.6],length:[380,980],
      mix:[18,52],detune:[-12,19],fm:[12,48],noise:[5,24],attack:[2,25],body:[.8,2.1],charge:[90,310],
      pulse:[15,60],filter:[4200,16000],res:[4,14],filterEnv:[12,68],drive:[10,48],
      delay:[70,250],fb:[7,38],dmix:[6,32],rev:[4,25],rsize:[.28,1.0]
    },
    "LONG ZAP":{
      start:[700,3000],sweep:[24,58],sweepDecay:[480,1700],curve:[.38,2.1],length:[700,2300],
      mix:[15,52],detune:[-12,19],fm:[5,48],noise:[0,18],attack:[0,18],body:[.45,1.6],charge:[0,80],
      pulse:[18,58],filter:[2600,15000],res:[3,14],filterEnv:[-18,62],drive:[6,44],
      delay:[90,330],fb:[10,44],dmix:[10,38],rev:[8,34],rsize:[.4,1.5]
    },
    "ECHO ZAP":{
      start:[1000,3500],sweep:[28,60],sweepDecay:[130,480],curve:[.65,2.7],length:[180,650],
      mix:[12,48],detune:[-9,17],fm:[5,40],noise:[0,20],attack:[0,7],body:[1.0,2.7],charge:[0,45],
      pulse:[18,55],filter:[4500,17000],res:[3,13],filterEnv:[4,55],drive:[6,42],
      delay:[175,520],fb:[34,72],dmix:[28,64],rev:[2,22],rsize:[.25,.9]
    },
    "HEAVY ZAP":{
      start:[480,1800],sweep:[18,45],sweepDecay:[180,700],curve:[.55,2.5],length:[260,900],
      mix:[24,62],detune:[-24,12],fm:[18,64],noise:[10,38],attack:[0,8],body:[.8,2.3],charge:[0,75],
      pulse:[10,48],filter:[1300,8200],res:[6,18],filterEnv:[-35,40],drive:[34,82],
      delay:[35,220],fb:[5,36],dmix:[4,30],rev:[2,22],rsize:[.25,1.0]
    }
  };

