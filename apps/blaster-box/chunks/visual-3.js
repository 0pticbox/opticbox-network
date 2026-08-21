"use strict";
  function envelopeWeight(p){
    return clamp((p.length-55)/(3000-55),0,1);
  }

  function updateStars(dt){
    for(const star of stars){
      star.x -= star.speed*dt;
      if(star.x < -4){
        star.x = gun.width+4;
        star.y = (star.y*1.73+97)%gun.height;
      }
    }
  }

  function drawStars(now,skin){
    const beam = getSkinTheme(skin).beam;
    for(let i=0;i<stars.length;i++){
      const star=stars[i];
      const twinkle=.5+.5*Math.sin(now*.002+star.phase);
      g.globalAlpha=.28+.62*twinkle;
      rect(star.x,star.y,star.size,star.size,i%3===0?beam.star1:beam.star2);
    }
    g.globalAlpha=1;
  }

  function analyzeSpriteMuzzle(img){
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const cx = c.getContext("2d", { willReadFrequently:true });
    cx.clearRect(0,0,c.width,c.height);
    cx.drawImage(img,0,0);
    const d = cx.getImageData(0,0,c.width,c.height).data;
    let maxX = -1;
    for(let y=0;y<c.height;y++){
      for(let x=0;x<c.width;x++){
        const a = d[(y*c.width + x)*4 + 3];
        if(a > 8 && x > maxX) maxX = x;
      }
    }
    if(maxX < 0) return { x: 0.96, y: 0.5 };
    let sumY = 0, count = 0;
    const cutoff = Math.max(0, maxX - 1);
    for(let y=0;y<c.height;y++){
      for(let x=cutoff;x<=maxX;x++){
        const a = d[(y*c.width + x)*4 + 3];
        if(a > 8){ sumY += y; count++; }
      }
    }
    const avgY = count ? (sumY / count) : (c.height * 0.5);
    return {
      x: (maxX + 1) / c.width,
      y: (avgY + 0.5) / c.height
    };
  }

  Object.values(skinSprites).forEach(s => {
    s.img = new Image();
    s.img.onload = () => {
      const p = analyzeSpriteMuzzle(s.img);
      s.autoMuzzleX = p.x;
      s.autoMuzzleY = p.y;
    };
    s.img.src = s.src;
  });
  function drawToyGun(x,y,scale,recoil,skin){
    const sprite = skinSprites[skin] || skinSprites["SPIRAL POP"];
    const img = sprite.img;
    g.save();
    g.imageSmoothingEnabled = false;

    if (img && img.complete && img.naturalWidth > 0) {
      const drawH = sprite.targetH * scale;
      const drawW = (img.naturalWidth / img.naturalHeight) * drawH;
      const drawX = x - recoil;
      const drawY = y;

      g.drawImage(img, drawX, drawY, drawW, drawH);
      g.restore();

      const mx = (sprite.autoMuzzleX != null) ? sprite.autoMuzzleX : 0.96;
      const my = (sprite.autoMuzzleY != null) ? sprite.autoMuzzleY : 0.5;
      return {
        muzzleX: drawX + drawW * mx,
        muzzleY: drawY + drawH * my
      };
    }

    // Fallback if the image hasn't loaded yet.
    rect(x-recoil, y+40, 160*scale, 56*scale, "#24305e");
    rect(x-recoil+20*scale, y+52*scale, 120*scale, 32*scale, "#57b3e8");
    g.restore();
    return {
      muzzleX: x - recoil + 158 * scale,
      muzzleY: y + 56 * scale
    };
  }

  function pitchVisual(p,elapsed){
    const shotMs = Math.max(55,p.length);
    const t = clamp(elapsed/1000,0,shotMs/1000);
    const hi = Math.max(p.start,endPitchHz(p),16);
    const lo = Math.max(Math.min(p.start,endPitchHz(p)),15);
    const cur = clamp(pitchAt(p,t),lo,hi);
    const logHi = Math.log(hi), logLo = Math.log(lo);
    const norm = (Math.log(cur)-logLo)/Math.max(.0001,logHi-logLo); // 0 = low pitch, 1 = high pitch
    return {cur,norm,lowFactor:1-norm};
  }

  function spawnTrailParticles(headX,headY,p,dt,elapsed){
    const pv = pitchVisual(p,elapsed);
    const beam = getSkinTheme(p.skin).beam;
    const amount = Math.max(1,Math.round(1 + pv.norm*5));
    const chance = clamp(dt/16.7,.35,2);
    for(let i=0;i<amount;i++){
      if(Math.random()>chance) continue;
      const kind=Math.floor(rand(0,3));
      shotParticles.push({
        x:headX-rand(3,20+pv.lowFactor*22),
        y:headY+rand(-4-pv.lowFactor*12,4+pv.lowFactor*12),
        vx:-rand(.065,.20)*(1+pv.norm*1.2),
        vy:rand(-.055,.055)*(1+pv.norm*.8),
        life:rand(110,240)+pv.lowFactor*300,
        age:0,
        size:rand(1.2,3.0)+pv.lowFactor*4.6,
        kind,
        color:beam.particles[kind % beam.particles.length]
      });
    }
    if(shotParticles.length>200) shotParticles.splice(0,shotParticles.length-200);
  }

  function updateAndDrawParticles(dt){
    for(let i=shotParticles.length-1;i>=0;i--){
      const q=shotParticles[i];
      q.age+=dt;
      q.x+=q.vx*dt;
      q.y+=q.vy*dt;
      q.vy*=.995;
      const life=1-q.age/q.life;
      if(life<=0 || q.x<-20 || q.y<-30 || q.y>gun.height+30){
        shotParticles.splice(i,1);
        continue;
      }
      g.globalAlpha=clamp(life,0,1);
      const col=q.color || "#fff1e8";
      rect(q.x,q.y,q.size,q.size,col);
      if(q.size>3) rect(q.x-q.size*.7,q.y+q.size*.35,q.size*.55,q.size*.55,"#fff8dd");
    }
    g.globalAlpha=1;
  }

  function drawStraightLaser(p,elapsed,muzzleX,muzzleY,dt){
    const beam = getSkinTheme(p.skin).beam;
    const shotMs=Math.max(55,p.length);
    const progress=clamp(elapsed/shotMs,0,1);
    const pv = pitchVisual(p,elapsed);
    const compactShot = shotMs < 185;
    const travel=Math.max(120,gun.width-muzzleX+90);
    const headX=muzzleX+travel*Math.min(1,progress*1.18);
    const headY=muzzleY;

    // Visual response follows pitch: high pitch = tighter/thinner, low pitch = heavier/thicker.
    const thick = compactShot
      ? (2.5 + pv.lowFactor*5.5)
      : (4 + pv.lowFactor*18);
    const core = Math.max(2, thick*.33);
    const boltLen = compactShot ? (18 + pv.lowFactor*30) : (40 + pv.lowFactor*120);

    if(compactShot){
      const tailX=Math.max(muzzleX,headX-boltLen);
      g.globalAlpha=.42;
      g.strokeStyle=beam.outer;g.lineWidth=thick+3;g.beginPath();g.moveTo(tailX,headY);g.lineTo(headX,headY);g.stroke();
      g.globalAlpha=1;
      g.strokeStyle=beam.mid;g.lineWidth=Math.max(2,thick*.85);g.beginPath();g.moveTo(tailX,headY);g.lineTo(headX,headY);g.stroke();
      g.strokeStyle=beam.core;g.lineWidth=core;g.beginPath();g.moveTo(tailX,headY);g.lineTo(headX,headY);g.stroke();
    }else{
      const pulse=.88+.12*Math.sin(elapsed*.045);
      g.globalAlpha=.28;
      g.strokeStyle=beam.outer;g.lineWidth=(thick+8)*pulse;g.beginPath();g.moveTo(muzzleX,headY);g.lineTo(headX,headY);g.stroke();
      g.globalAlpha=.9;
      g.strokeStyle=beam.accent;g.lineWidth=(thick+2)*pulse;g.beginPath();g.moveTo(muzzleX,headY);g.lineTo(headX,headY);g.stroke();
      g.globalAlpha=1;
      g.strokeStyle=beam.mid;g.lineWidth=(thick*.72)*pulse;g.beginPath();g.moveTo(muzzleX,headY);g.lineTo(headX,headY);g.stroke();
      g.strokeStyle=beam.core;g.lineWidth=core*pulse;g.beginPath();g.moveTo(muzzleX,headY);g.lineTo(headX,headY);g.stroke();
    }

    const headSize=(compactShot?3.5:5.5)+pv.lowFactor*5.5;
    rect(headX-headSize/2,headY-headSize/2,headSize,headSize,beam.core);
    rect(headX-headSize*.9,headY-headSize*.22,headSize*.65,headSize*.44,beam.mid);

    spawnTrailParticles(headX,headY,p,dt,elapsed);

    const flash=(1-progress);
    if(flash>.02){
      g.globalAlpha=clamp(flash*1.8,0,1);
      rect(muzzleX-3,headY-5-pv.lowFactor*6,8+pv.lowFactor*14,10+pv.lowFactor*12,beam.mid);
      rect(muzzleX+3,headY-2-pv.lowFactor*4,11+pv.lowFactor*15,4+pv.lowFactor*7,beam.core);
      g.globalAlpha=1;
    }
  }

  function recoilFor(p,elapsed){
    if(elapsed<0) return 0;
    const pv = pitchVisual(p,elapsed);
    const base = 3 + pv.lowFactor*12;
    const jitter = Math.exp(-elapsed/110)*Math.abs(Math.sin(elapsed*.06));
    const sustain = elapsed<p.length ? (pv.lowFactor*5)*(0.35+0.65*Math.abs(Math.sin(elapsed*.03))) : 0;
    return base*jitter + sustain;
  }

  function drawIdleTipEffect(muzzleX,muzzleY,now,skin){
    const beam = getSkinTheme(skin).beam;
    const pulse = 0.55 + 0.45*Math.sin(now*0.006);
    const puff = [
      {x: 4, y: 0, s: 3.0, c: beam.core},
      {x: 8, y: -3, s: 2.4, c: beam.outer},
      {x: 10, y: 4, s: 2.6, c: beam.mid},
      {x: 14, y: 0, s: 2.1, c: beam.accent}
    ];
    g.globalAlpha = 0.35 + 0.35*pulse;
    for(let i=0;i<puff.length;i++){
      const p = puff[i];
      const ox = Math.sin(now*0.004 + i*1.3) * (2+i*.5);
      const oy = Math.cos(now*0.005 + i*1.7) * (1.5+i*.35);
      rect(muzzleX + p.x + ox, muzzleY + p.y + oy, p.s, p.s, p.c);
    }
    g.globalAlpha = 0.18 + 0.12*pulse;
    rect(muzzleX-1, muzzleY-2, 6, 6, beam.core);
    g.globalAlpha = 1;
  }

  function drawScene(now,dt){
    const W=gun.width,H=gun.height;
    const p=animPatch || readPatch();
    const elapsed=firing ? now-animStart : -1;
    const active=firing && elapsed<animDuration;
    const shotActive=firing && elapsed>=0 && elapsed<Math.max(55,p.length);

    if(firing && !active){
      firing=false;
      animPatch=null;
      drawPitch();
      drawScope();
    }

    const pv = shotActive ? pitchVisual(p,elapsed) : {lowFactor:0,norm:1};
    const shakeAmp=shotActive ? pv.lowFactor*8.5 : 0;
    const shakeX=shakeAmp ? Math.sin(now*.067)*shakeAmp : 0;
    const shakeY=shakeAmp ? Math.cos(now*.083)*shakeAmp*.7 : 0;

    g.clearRect(0,0,W,H);
    g.save();
    g.translate(shakeX,shakeY);
    rect(-12,-12,W+24,H+24,"#060812");
    drawStars(now,p.skin);

    const recoil=shotActive?recoilFor(p,elapsed):0;

    const gunX=18;
    const gunY=132;
    const gunScale=.72;
    const muzzle=drawToyGun(gunX,gunY,gunScale,recoil,p.skin);

    if(shotActive) drawStraightLaser(p,elapsed,muzzle.muzzleX,muzzle.muzzleY,dt);
    else drawIdleTipEffect(muzzle.muzzleX, muzzle.muzzleY, now, p.skin);
    updateAndDrawParticles(dt);

    if(shotActive && pv.lowFactor>.45){
      const a=(pv.lowFactor-.45)*.42*(.5+.5*Math.sin(now*.041));
      g.globalAlpha=a;
      const edgeBeam=getSkinTheme(p.skin).beam;
      rect(0,0,W,4,edgeBeam.accent);rect(0,H-4,W,4,edgeBeam.outer);
      g.globalAlpha=1;
    }
    g.restore();
  }

  function visualLoop(now){
    const dt=clamp(now-lastVisualTime,0,40);
    lastVisualTime=now;
    updateStars(dt);
    drawScene(now,dt);

    if(firing){
      const elapsed=Math.max(0,now-animStart);
      drawPitch(elapsed);
      drawScope(elapsed);
    }

    raf=requestAnimationFrame(visualLoop);
  }

  function startAnimation(p){
    animStart=performance.now();
    animDuration=Math.max(260,p.length+Math.min(1200,p.delay*2.5)+420);
    animPatch={...p};
    shotParticles=[];
    firing=true;
  }

  els.type.addEventListener("change",()=>{
    const r=recipes[els.type.value];
    if(els.type.value==="CHARGE" && +els.charge.value===0) els.charge.value=180;
    if(els.type.value!=="CHARGE" && +els.charge.value>300) els.charge.value=0;
    updateAll();
    setStatus(`${els.type.value} FAMILY SELECTED.`);
  });

  detectAlsina();
  applySkinTheme(readPatch().skin);
  updateLabels();
  drawScope();
  drawPitch();
  history.push(readPatch());
  historyIndex=0;
  raf=requestAnimationFrame(visualLoop);
