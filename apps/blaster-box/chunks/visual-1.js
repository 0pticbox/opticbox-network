"use strict";
// BLASTER BOX visuals / envelope / animation

  const skinSprites = {
    "SPIRAL POP": { src: "skins/spiral-pop.png", img: new Image(), targetH: 280, autoMuzzleX: null, autoMuzzleY: null },
    "CYAN BLASTER": { src: "skins/cyan-blaster.png", img: new Image(), targetH: 280, autoMuzzleX: null, autoMuzzleY: null },
    "HEAT CANNON": { src: "skins/heat-cannon.png", img: new Image(), targetH: 280, autoMuzzleX: null, autoMuzzleY: null },
    "SOLAR RAY": { src: "skins/solar-ray.png", img: new Image(), targetH: 280, autoMuzzleX: null, autoMuzzleY: null }
  };

  // ---------- visuals ----------
  function rect(x,y,w,h,c){
    g.fillStyle=c;
    g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));
  }

  function drawGrid(ctx,W,H,left=0,top=0,right=W,bottom=H){
    ctx.strokeStyle="rgba(120,170,210,.14)";
    ctx.lineWidth=1;
    for(let x=left;x<=right;x+=36){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}
    for(let y=top;y<=bottom;y+=24){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
  }

  function tinyText(ctx,text,x,y,color="#9badb7",align="left",size=10){
    ctx.save();
    ctx.font=`700 ${size}px "Alsina", "Alcina", "Trebuchet MS", Arial, Helvetica, sans-serif`;
    ctx.textAlign=align;
    ctx.textBaseline="alphabetic";
    ctx.fillStyle=color;
    ctx.shadowColor="rgba(0,0,0,.55)";
    ctx.shadowBlur=0;
    ctx.shadowOffsetX=1;
    ctx.shadowOffsetY=1;
    ctx.fillText(text,x,y);
    ctx.restore();
  }

  function textBackplate(ctx,x,y,w,h){
    ctx.save();
    ctx.fillStyle="rgba(0,0,0,.42)";
    ctx.fillRect(x,y,w,h);
    ctx.restore();
  }

  function drawScope(currentMs=null){
    const W=scope.width,H=scope.height;
    const p=readPatch();
    const theme=getSkinTheme(p.skin).beam;
    const type=p.osc1;
    const plotTop=20, plotBottom=88, barY=105;

    sctx.clearRect(0,0,W,H);
    sctx.fillStyle="#050711";sctx.fillRect(0,0,W,H);
    drawGrid(sctx,W,H,0,plotTop,W,plotBottom);

    // Center line makes waveform polarity much easier to read.
    sctx.strokeStyle="rgba(255,255,255,.20)";
    sctx.lineWidth=1;
    sctx.beginPath();sctx.moveTo(0,(plotTop+plotBottom)/2);sctx.lineTo(W,(plotTop+plotBottom)/2);sctx.stroke();

    const customActive=customWT && type==="custom";
    const startPos=clamp(p.wtPos/100,0,1);
    const endPos=clamp((p.wtPos+p.wtMove)/100,0,1);
    const shotProgress=currentMs==null ? 0 : clamp(currentMs/Math.max(55,p.length),0,1);
    const currentPos=clamp(wtPositionAt(p,(shotProgress*p.length)/1000),0,1);

    if(customActive){
      $("#waveMeterTitle").textContent="CUSTOM WAVETABLE";
      $("#waveMeterHelp").textContent=`START ${Math.round(startPos*100)}%  →  END ${Math.round(endPos*100)}%`;

      // Start waveform.
      sctx.strokeStyle=theme.outer;
      sctx.lineWidth=2;
      sctx.beginPath();
      for(let x=0;x<W;x++){
        const phase=(x/W)*3.25;
        const v=wavetableSample(phase,startPos);
        const y=(plotTop+plotBottom)/2-v*((plotBottom-plotTop)*.37);
        if(x===0)sctx.moveTo(x,y);else sctx.lineTo(x,y);
      }
      sctx.stroke();

      // End waveform as a ghost overlay when the table moves.
      if(Math.abs(endPos-startPos)>.005){
        sctx.save();
        sctx.strokeStyle=theme.accent;
        sctx.globalAlpha=.70;
        sctx.setLineDash([5,4]);
        sctx.lineWidth=1.5;
        sctx.beginPath();
        for(let x=0;x<W;x++){
          const phase=(x/W)*3.25;
          const v=wavetableSample(phase,endPos);
          const y=(plotTop+plotBottom)/2-v*((plotBottom-plotTop)*.27);
          if(x===0)sctx.moveTo(x,y);else sctx.lineTo(x,y);
        }
        sctx.stroke();
        sctx.restore();
      }

      textBackplate(sctx,4,3,96,14);
      textBackplate(sctx,W-104,3,100,14);
      tinyText(sctx,"START SHAPE",8,14,theme.outer,"left",10);
      tinyText(sctx,"END SHAPE",W-8,14,theme.accent,"right",10);

      // Wavetable position ruler.
      sctx.fillStyle="rgba(255,255,255,.10)";
      sctx.fillRect(10,barY,W-20,7);
      const sx=10+startPos*(W-20);
      const ex=10+endPos*(W-20);
      sctx.strokeStyle=theme.mid;
      sctx.lineWidth=3;
      sctx.beginPath();sctx.moveTo(sx,barY+3.5);sctx.lineTo(ex,barY+3.5);sctx.stroke();

      sctx.fillStyle=theme.outer;sctx.fillRect(sx-3,barY-2,6,11);
      sctx.fillStyle=theme.accent;sctx.fillRect(ex-3,barY-2,6,11);

      if(currentMs!=null){
        const cx=10+currentPos*(W-20);
        sctx.fillStyle=theme.core;
        sctx.fillRect(cx-2,barY-5,4,17);
        tinyText(sctx,`NOW ${Math.round(currentPos*100)}%`,clamp(cx,35,W-35),130,theme.core,"center");
      }else{
        tinyText(sctx,"0%",10,130,"#9badb7");
        tinyText(sctx,"100%",W-10,130,"#9badb7","right");
      }
    }else{
      $("#waveMeterTitle").textContent="OSC 1 WAVEFORM";
      $("#waveMeterHelp").textContent=`${els.osc1.options[els.osc1.selectedIndex].text} — REPEATING OSCILLATOR SHAPE`;

      sctx.strokeStyle=theme.outer;
      sctx.lineWidth=2.5;
      sctx.beginPath();
      for(let x=0;x<W;x++){
        const phase=(x/W)*3.25;
        const v=baseWave(type,phase,p.pulseWidth);
        const y=(plotTop+plotBottom)/2-v*((plotBottom-plotTop)*.38);
        if(x===0)sctx.moveTo(x,y);else sctx.lineTo(x,y);
      }
      sctx.stroke();

      textBackplate(sctx,4,3,96,14);
      tinyText(sctx,"+ AMP",8,14,theme.outer,"left",10);
      tinyText(sctx,"0",10,(plotTop+plotBottom)/2+4,"#c2ccd3","left",11);
      tinyText(sctx,"- AMP",8,103,"#c2ccd3","left",10);
      tinyText(sctx,"SHAPE REPEATS →",W-8,126,theme.mid,"right",10);
    }
  }

  let envDragHandle=null;
  let envHoverHandle=null;

  function pitchMetrics(){
    const W=pitchCanvas.width,H=pitchCanvas.height;
    return {
      W,H,
      left:48,
      right:W-18,
      top:42,
      bottom:H-38,
      minHz:15,
      maxHz:6200
    };
  }

  function pitchFreqToY(freq,m){
    const f=clamp(freq,m.minHz,m.maxHz);
    const n=(Math.log(f)-Math.log(m.minHz))/(Math.log(m.maxHz)-Math.log(m.minHz));
    return m.bottom-n*(m.bottom-m.top);
  }

  function pitchYToFreq(y,m){
    const n=clamp((m.bottom-y)/(m.bottom-m.top),0,1);
    return Math.exp(Math.log(m.minHz)+n*(Math.log(m.maxHz)-Math.log(m.minHz)));
  }

  function pitchTimeToX(ms,p,m){
    return m.left+clamp(ms/Math.max(55,p.length),0,1)*(m.right-m.left);
  }

  function pitchXToTime(x,p,m){
    return clamp((x-m.left)/(m.right-m.left),0,1)*Math.max(55,p.length);
  }

  function getEnvHandles(p){
    const m=pitchMetrics();
    const chargeMs=clamp(p.charge,0,p.length*.55);
    const usableDecay=Math.max(20,Math.min(p.sweepDecay,Math.max(20,p.length-chargeMs)));
    const curveMs=clamp(chargeMs+usableDecay*.5,chargeMs,p.length);

    return {
      m,
      peak:{
        name:"peak",
        x:pitchTimeToX(chargeMs,p,m),
        y:pitchFreqToY(p.start,m)
      },
      curve:{
        name:"curve",
        x:pitchTimeToX(curveMs,p,m),
        y:pitchFreqToY(pitchAt(p,curveMs/1000),m)
      },
      end:{
        name:"end",
        x:m.right,
        y:pitchFreqToY(pitchAt(p,p.length/1000),m)
      }
    };
  }

  function drawEnvHandle(ctx,h,color,label,active=false,align="center"){
    ctx.save();
    if(active){
      ctx.globalAlpha=.22;
      ctx.fillStyle=color;
      ctx.beginPath();ctx.arc(h.x,h.y,13,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    }
    ctx.fillStyle="#050711";
    ctx.beginPath();ctx.arc(h.x,h.y,7,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=2;
    ctx.strokeStyle=color;
    ctx.beginPath();ctx.arc(h.x,h.y,7,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=color;
    ctx.beginPath();ctx.arc(h.x,h.y,3.4,0,Math.PI*2);ctx.fill();
    ctx.restore();

    let tx=h.x, ty=h.y-14;
    if(label==="CURVE") ty=h.y+22;
    if(label==="END"){tx=h.x-10;ty=h.y-14;align="right";}
    tinyText(ctx,label,tx,ty,color,align,10);
  }

  function drawPitch(currentMs=null){
    const W=pitchCanvas.width,H=pitchCanvas.height;
    const p=readPatch(), dur=p.length/1000;
    const theme=getSkinTheme(p.skin).beam;
    const hs=getEnvHandles(p), m=hs.m;
    const chargeMs=clamp(p.charge,0,p.length*.55);

    pctx.clearRect(0,0,W,H);
    pctx.fillStyle="#050711";pctx.fillRect(0,0,W,H);
    drawGrid(pctx,W,H,m.left,m.top,m.right,m.bottom);

    // Dedicated label row so text never sits on top of the curve.
    textBackplate(pctx,m.left-6,4,m.right-m.left+12,18);
    tinyText(pctx,`START ${Math.round(p.start)} Hz`,m.left,18,theme.outer,"left",11);
    tinyText(pctx,`FINAL ${Math.round(pitchAt(p,dur))} Hz`,m.right,18,theme.accent,"right",11);
    tinyText(pctx,`SWEEP -${p.sweep} ST`,(m.left+m.right)/2,18,theme.mid,"center",10);

    // Helpful frequency guide labels, kept out of the plotted line.
    tinyText(pctx,"HIGH",10,m.top+4,"#9aa8b2","left",10);
    tinyText(pctx,"LOW",10,m.bottom+4,"#9aa8b2","left",10);

    // Charge region.
    if(chargeMs>0){
      const cx=pitchTimeToX(chargeMs,p,m);
      pctx.fillStyle="rgba(255,119,168,.09)";
      pctx.fillRect(m.left,m.top,cx-m.left,m.bottom-m.top);
      pctx.strokeStyle=theme.accent;
      pctx.globalAlpha=.5;
      pctx.setLineDash([5,5]);
      pctx.beginPath();pctx.moveTo(cx,m.top);pctx.lineTo(cx,m.bottom);pctx.stroke();
      pctx.setLineDash([]);
      pctx.globalAlpha=1;
      tinyText(pctx,`${Math.round(chargeMs)} ms CHARGE`,m.left+8,m.bottom-8,theme.accent,"left",9);
    }

    // Actual pitch path.
    pctx.strokeStyle=theme.mid;
    pctx.lineWidth=3;
    pctx.beginPath();
    for(let x=m.left;x<=m.right;x++){
      const progress=(x-m.left)/(m.right-m.left);
      const t=dur*progress;
      const f=pitchAt(p,t);
      const y=pitchFreqToY(f,m);
      if(x===m.left)pctx.moveTo(x,y);else pctx.lineTo(x,y);
    }
    pctx.stroke();

    // Initial charge starting position gets a small non-draggable marker.
    const initialY=pitchFreqToY(pitchAt(p,0),m);
    pctx.fillStyle="rgba(255,255,255,.5)";
    pctx.beginPath();pctx.arc(m.left,initialY,3,0,Math.PI*2);pctx.fill();

    // Interactive points.
    drawEnvHandle(pctx,hs.peak,theme.outer,"PEAK",envDragHandle==="peak"||envHoverHandle==="peak");
    drawEnvHandle(pctx,hs.curve,theme.mid,"CURVE",envDragHandle==="curve"||envHoverHandle==="curve");
    drawEnvHandle(pctx,hs.end,theme.accent,"END",envDragHandle==="end"||envHoverHandle==="end");

    // Bottom time labels are intentionally spaced away from the graph.
    tinyText(pctx,"0 ms",m.left,H-10,"#b8c6cf","left",10);
    tinyText(pctx,`${p.length} ms`,m.right,H-10,"#b8c6cf","right",10);
    tinyText(pctx,"TIME →",(m.left+m.right)/2,H-10,theme.mid,"center",10);

    if(currentMs!=null && !envDragHandle){
      const progress=clamp(currentMs/Math.max(55,p.length),0,1);
      const x=m.left+progress*(m.right-m.left);
      const t=(progress*p.length)/1000;
      const f=pitchAt(p,t);
      const y=pitchFreqToY(f,m);

      pctx.strokeStyle=theme.core;
      pctx.globalAlpha=.38;
      pctx.lineWidth=1;
      pctx.beginPath();pctx.moveTo(x,m.top);pctx.lineTo(x,m.bottom);pctx.stroke();
      pctx.globalAlpha=1;
      pctx.fillStyle=theme.core;
      pctx.beginPath();pctx.arc(x,y,4,0,Math.PI*2);pctx.fill();
      tinyText(pctx,`NOW ${Math.round(f)} Hz`,clamp(x,78,W-78),H-24,theme.core,"center",10);
    }
  }
