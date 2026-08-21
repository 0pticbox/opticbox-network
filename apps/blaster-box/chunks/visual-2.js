"use strict";
  function envCanvasPoint(e){
    const r=pitchCanvas.getBoundingClientRect();
    return {
      x:(e.clientX-r.left)*(pitchCanvas.width/r.width),
      y:(e.clientY-r.top)*(pitchCanvas.height/r.height)
    };
  }

  function nearestEnvHandle(pt){
    const hs=getEnvHandles(readPatch());
    let best=null, bestD=999;
    for(const key of ["peak","curve","end"]){
      const h=hs[key];
      const d=Math.hypot(pt.x-h.x,pt.y-h.y);
      if(d<bestD){bestD=d;best=key;}
    }
    return bestD<=18?best:null;
  }

  function stepValue(v,step){
    return Math.round(v/step)*step;
  }

  function updateEnvelopeFromPointer(handle,pt){
    const p=readPatch();
    const hs=getEnvHandles(p), m=hs.m;

    if(handle==="peak"){
      const newStart=stepValue(clamp(pitchYToFreq(pt.y,m),220,6200),10);
      const newCharge=stepValue(clamp(pitchXToTime(pt.x,p,m),0,Math.min(600,p.length*.55)),5);
      els.start.value=newStart;
      els.charge.value=newCharge;
    }

    if(handle==="curve"){
      // Horizontal movement changes sweep-decay time.
      const t=pitchXToTime(pt.x,p,m);
      const charge=clamp(p.charge,0,p.length*.55);
      const newDecay=stepValue(clamp((t-charge)*2,20,Math.min(2200,Math.max(20,(p.length-charge)*2))),5);
      els.sweepDecay.value=newDecay;

      // Vertical movement changes curvature. In log-frequency space, the
      // halfway point maps cleanly to 0.5^curve.
      const p2=readPatch();
      const hs2=getEnvHandles(p2);
      const peakY=hs2.peak.y;
      const endTargetY=pitchFreqToY(endPitchHz(p2),hs2.m);
      const span=Math.max(12,endTargetY-peakY);
      const shaped=clamp((pt.y-peakY)/span,.045,.955);
      const curve=Math.log(shaped)/Math.log(.5);
      els.pitchCurve.value=stepValue(clamp(curve,.25,4.5)*100,5);
    }

    if(handle==="end"){
      // END is vertical-only: choose the final audible pitch and convert
      // that back into the sweep amount used by the synth.
      const desired=clamp(pitchYToFreq(pt.y,m),15,Math.max(16,p.start*.98));
      const chargeSec=shotStartSec(p);
      const local=Math.max(0,p.length/1000-chargeSec);
      const decaySec=Math.max(.005,p.sweepDecay/1000);
      const x=clamp(local/decaySec,0,1);
      const shaped=Math.max(.035,Math.pow(x,Math.max(.15,p.pitchCurve)));
      const targetEnd=p.start*Math.exp(Math.log(desired/p.start)/shaped);
      const sweep=12*Math.log2(p.start/Math.max(15,targetEnd));
      els.sweep.value=Math.round(clamp(sweep,4,84));
    }

    updateLabels();
    drawPitch();
    invalidateRender();
  }

  pitchCanvas.addEventListener("pointerdown",e=>{
    const pt=envCanvasPoint(e);
    const hit=nearestEnvHandle(pt);
    if(!hit) return;
    envDragHandle=hit;
    envHoverHandle=hit;
    pitchCanvas.classList.add("env-dragging");
    pitchCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    updateEnvelopeFromPointer(hit,pt);
  });

  pitchCanvas.addEventListener("pointermove",e=>{
    const pt=envCanvasPoint(e);
    if(envDragHandle){
      updateEnvelopeFromPointer(envDragHandle,pt);
      e.preventDefault();
      return;
    }
    const hit=nearestEnvHandle(pt);
    if(hit!==envHoverHandle){
      envHoverHandle=hit;
      pitchCanvas.style.cursor=hit?"grab":"crosshair";
      drawPitch();
    }
  });

  function stopEnvDrag(e){
    if(!envDragHandle) return;
    envDragHandle=null;
    pitchCanvas.classList.remove("env-dragging");
    if(e && pitchCanvas.hasPointerCapture && pitchCanvas.hasPointerCapture(e.pointerId)){
      pitchCanvas.releasePointerCapture(e.pointerId);
    }
    envHoverHandle=null;
    pitchCanvas.style.cursor="crosshair";
    updateAll();
  }

  pitchCanvas.addEventListener("pointerup",stopEnvDrag);
  pitchCanvas.addEventListener("pointercancel",stopEnvDrag);
  pitchCanvas.addEventListener("pointerleave",e=>{
    if(!envDragHandle){
      envHoverHandle=null;
      pitchCanvas.style.cursor="crosshair";
      drawPitch();
    }
  });

  // Moving stars are kept lightweight and deterministic enough for the CRT look.
  const stars = Array.from({length:42},(_,i)=>({
    x:(i*173+31)%768,
    y:(i*79+23)%432,
    speed:.018+(i%7)*.009,
    size:i%9===0?3:(i%4===0?2:1),
    phase:(i*1.73)%6.283
  }));
  let lastVisualTime=performance.now();
  let shotParticles=[];
  let firing=false;

