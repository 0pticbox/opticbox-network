"use strict";
const $=id=>document.getElementById(id);
const canvas=$("scopeCanvas"),ctx=canvas.getContext("2d"),trail=document.createElement("canvas"),tctx=trail.getContext("2d");trail.width=canvas.width;trail.height=canvas.height;
const drawPad=$("drawPad"),dctx=drawPad.getContext("2d");
const ui={statusText:$("statusText"),powerLamp:$("powerLamp"),modeReadout:$("modeReadout"),inputReadout:$("inputReadout"),signalReadout:$("signalReadout"),recordReadout:$("recordReadout"),recordGuide:$("recordGuide"),audioElement:$("audioElement")};
let audioContext,sourceNode,sourceStream,mediaElementSource,splitter,leftAnalyser,rightAnalyser,monoAnalyser,recordDest,artSource,artGain,artProcessor,artPoints=[],svgPoints=[],drawPoints=[],pngPoints=[],pngImage=null;
let leftData=new Float32Array(1024),rightData=new Float32Array(1024),monoData=new Float32Array(1024),mode="time",frame=0,lastTracePoints=[];
let recorder,recordChunks=[],recordStartedAt=0,recordTimer,outputCanvas,outputCtx,currentInput="NO INPUT",pngSpinActive=false,pngSpinAngle=0,pngSignalIndex=0,lastFrameTime=performance.now(),zSpinAngle=0;
const state={gain:1,sweep:1,triggerLevel:0,trigger:true,intensity:1.15,focus:1.7,persistence:.92,grid:true,phosphor:"p31",xGain:1,yGain:1,rotation:0,invertY:false,xyAutoGain:true,traceRate:60,pointCount:4096,smooth:2,artLevel:.35,edgeThreshold:222,pngDetail:224,pngLineSpacing:1,pngEtchStrength:1,pngVectorPoints:12288,spinSpeed:.35,spinDepth:.45,xyPhase:-180,zSpin:false,zSpinSpeed:.08,particles:true,particleAmount:42,particleDecay:.955,particleDrift:.8};
const phosphors={p31:{trace:[126,255,119],grid:[48,105,51],bg:[1,10,5]},p7:{trace:[255,185,78],grid:[105,70,30],bg:[12,6,1]},p39:{trace:[237,244,226],grid:[92,98,88],bg:[5,6,5]},blue:{trace:[92,190,255],grid:[38,74,102],bg:[1,5,12]},pink:{trace:[255,92,196],grid:[112,38,86],bg:[13,1,9]}};
function status(text,on=true){ui.statusText.textContent=text;ui.powerLamp.classList.toggle("on",on)}
async function ensureAudio(){if(!audioContext){audioContext=new (window.AudioContext||window.webkitAudioContext)({latencyHint:"interactive"});recordDest=audioContext.createMediaStreamDestination()}if(audioContext.state==="suspended")await audioContext.resume()}
function stopArt(){pngSpinActive=false;try{artSource?.stop()}catch{}try{artSource?.disconnect()}catch{}try{artProcessor?.disconnect()}catch{}try{artGain?.disconnect()}catch{}artSource=artProcessor=artGain=null;const stopPng=$("stopPngBtn");if(stopPng)stopPng.disabled=true;if(currentInput==="ART SIGNAL"){currentInput="NO INPUT";ui.inputReadout.textContent=currentInput;status("STANDBY",false)}}
function disconnectInput(){stopArt();try{sourceNode?.disconnect()}catch{}try{splitter?.disconnect()}catch{}sourceStream?.getTracks().forEach(t=>t.stop());sourceStream=sourceNode=splitter=null;currentInput="NO INPUT";ui.inputReadout.textContent=currentInput;status("STANDBY",false)}
function setupAnalysis(node,channels=2,monitor=false){leftAnalyser=audioContext.createAnalyser();rightAnalyser=audioContext.createAnalyser();monoAnalyser=audioContext.createAnalyser();[leftAnalyser,rightAnalyser,monoAnalyser].forEach(a=>{a.fftSize=1024;a.smoothingTimeConstant=.025});splitter=audioContext.createChannelSplitter(2);node.connect(splitter);splitter.connect(leftAnalyser,0);splitter.connect(rightAnalyser,channels>1?1:0);node.connect(monoAnalyser);node.connect(recordDest);if(monitor)node.connect(audioContext.destination)}
async function refreshFirefoxAudioDevices(requestPermission=false){
  const select=$("firefoxAudioDevice");if(!select||!navigator.mediaDevices?.enumerateDevices)return;let probe=null;
  try{
    if(requestPermission)probe=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"),previous=select.value;
    select.innerHTML='<option value="">DEFAULT AUDIO INPUT</option>';
    devices.forEach((d,i)=>{const o=document.createElement("option");o.value=d.deviceId;o.textContent=(d.label||`AUDIO INPUT ${i+1}`).toUpperCase();select.appendChild(o)});
    if([...select.options].some(o=>o.value===previous))select.value=previous;
  }catch(e){status("INPUT LIST BLOCKED",false)}finally{probe?.getTracks().forEach(t=>t.stop())}
}
async function connectMic(){disconnectInput();await ensureAudio();const deviceId=$("firefoxAudioDevice")?.value||"";const audio={channelCount:2,echoCancellation:false,noiseSuppression:false,autoGainControl:false};if(deviceId)audio.deviceId={exact:deviceId};sourceStream=await navigator.mediaDevices.getUserMedia({audio,video:false});sourceNode=audioContext.createMediaStreamSource(sourceStream);setupAnalysis(sourceNode,sourceNode.channelCount||1);currentInput=(sourceStream.getAudioTracks()[0]?.label||"AUDIO INPUT").toUpperCase();ui.inputReadout.textContent=currentInput;status("INPUT ACTIVE");refreshFirefoxAudioDevices(false)}
async function connectDesktop(){
  disconnectInput();
  await ensureAudio();
  if(!navigator.mediaDevices?.getDisplayMedia)throw Error("Screen audio sharing is not available in this browser.");
  sourceStream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:320},height:{ideal:180},frameRate:{ideal:5,max:10}},audio:true});
  const a=sourceStream.getAudioTracks();
  if(!a.length){
    sourceStream.getTracks().forEach(t=>t.stop());
    sourceStream=null;
    await refreshFirefoxAudioDevices(false);
    throw Error("Firefox did not provide a screen-audio track. Choose an AUDIO INPUT device (Stereo Mix/loopback if available) or use AUDIO FILE.");
  }
  sourceNode=audioContext.createMediaStreamSource(new MediaStream(a));
  setupAnalysis(sourceNode,2);
  currentInput="DESKTOP AUDIO";ui.inputReadout.textContent=currentInput;status("INPUT ACTIVE");
}
async function connectFile(file){disconnectInput();await ensureAudio();ui.audioElement.src=URL.createObjectURL(file);if(!mediaElementSource)mediaElementSource=audioContext.createMediaElementSource(ui.audioElement);sourceNode=mediaElementSource;setupAnalysis(sourceNode,2,true);currentInput="AUDIO FILE";ui.inputReadout.textContent=currentInput;status("FILE ACTIVE");await ui.audioElement.play()}
function readAudio(){if(!monoAnalyser){leftData.fill(0);rightData.fill(0);monoData.fill(0);return}leftAnalyser.getFloatTimeDomainData(leftData);rightAnalyser.getFloatTimeDomainData(rightData);monoAnalyser.getFloatTimeDomainData(monoData)}
function rms(a){let s=0;for(const v of a)s+=v*v;return Math.sqrt(s/a.length)}function triggerIndex(a,l){if(!state.trigger)return 0;for(let i=1;i<a.length;i++)if(a[i-1]<l&&a[i]>=l)return i;return 0}
function grid(c,w,h,col){if(!state.grid)return;c.save();c.lineWidth=1;c.strokeStyle=`rgba(${col.grid},.52)`;for(let i=0;i<=10;i++){let x=i*w/10;c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}for(let i=0;i<=8;i++){let y=i*h/8;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}c.strokeStyle=`rgba(${col.grid},.85)`;c.beginPath();c.moveTo(w/2,0);c.lineTo(w/2,h);c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();c.restore()}
function beam(c,col){c.strokeStyle=`rgba(${col.trace},${Math.min(1,.48*state.intensity)})`;c.lineWidth=state.focus;c.lineJoin="round";c.lineCap="round";c.shadowColor=`rgba(${col.trace},${Math.min(1,.8*state.intensity)})`;c.shadowBlur=5+state.intensity*10}
function drawTime(c,w,h,col){const start=triggerIndex(monoData,state.triggerLevel),samples=Math.max(64,Math.floor((monoData.length-start)/state.sweep));lastTracePoints=[];c.save();beam(c,col);c.beginPath();for(let i=0;i<samples;i++){const j=start+Math.floor(i*state.sweep);if(j>=monoData.length)break;const x=i*w/(samples-1),y=h/2-monoData[j]*state.gain*h*.38;lastTracePoints.push({x,y});i?c.lineTo(x,y):c.moveTo(x,y)}c.stroke();c.globalAlpha=.18;c.lineWidth=state.focus*3;c.stroke();c.restore()}
function transformedPngPoints(){
  if(!pngPoints.length)return[];
  const a=pngSpinAngle,ca=Math.cos(a),sa=Math.sin(a),depth=state.spinDepth;
  return pngPoints.map(p=>{
    const y=p.y*ca,z=p.y*sa;
    const perspective=1/(1+z*depth*.55);
    return{x:p.x*perspective,y:y*perspective};
  });
}
function drawXY(c,w,h,col){
  const effectiveRotation=state.rotation+(state.zSpin?zSpinAngle:0);
  const r=effectiveRotation*Math.PI/180,cr=Math.cos(r),sr=Math.sin(r),invert=state.invertY?-1:1;
  lastTracePoints=[];
  c.save();beam(c,col);c.globalCompositeOperation="lighter";c.beginPath();
  let n=0;
  const plot=(x,y)=>{const xr=x*cr-y*sr,yr=x*sr+y*cr,px=w/2+xr*w*.39,py=h/2-yr*h*.39;lastTracePoints.push({x:px,y:py});n++?c.lineTo(px,py):c.moveTo(px,py)};
  if(currentInput==="ART SIGNAL"&&artPoints.length>1){
    const pts=pngSpinActive?transformedPngPoints():artPoints,step=Math.max(1,Math.floor(pts.length/12000));
    for(let i=0;i<pts.length;i+=step)plot(pts[i].x*state.xGain,pts[i].y*state.yGain*invert);
  }else{
    let leftPeak=0,rightPeak=0;
    for(let i=0;i<leftData.length;i+=2){leftPeak=Math.max(leftPeak,Math.abs(leftData[i]));rightPeak=Math.max(rightPeak,Math.abs(rightData[i]));}
    const hasSignal=Math.max(leftPeak,rightPeak)>.0005;
    const monoFallback=rightPeak<Math.max(.002,leftPeak*.08);
    let scale=1;
    if(state.xyAutoGain&&hasSignal)scale=Math.min(12,.82/Math.max(leftPeak,rightPeak,.0005));
    const len=leftData.length,phase=Math.round((state.xyPhase/360)*len),quarter=Math.floor(len/4);
    if(hasSignal){
      for(let i=0;i<len;i+=2){const ri=(i+phase+len)%len;const x=leftData[i]*scale*state.xGain;const y=(monoFallback?leftData[(i+quarter+phase+len)%len]:rightData[ri])*scale*state.yGain*invert;plot(x,y)}
    }else{
      // Always-visible traditional Lissajous calibration pattern, matching the older build.
      const t=performance.now()*.001,N=1100,a=3,b=2,phaseRad=Math.PI/2+state.xyPhase*Math.PI/180;
      for(let i=0;i<N;i++){const q=i/(N-1)*Math.PI*2;plot(Math.sin(a*q+t*.18)*.78*state.xGain,Math.sin(b*q+phaseRad+t*.11)*.78*state.yGain*invert)}
    }
  }
  c.stroke();c.globalAlpha=.18;c.lineWidth=state.focus*3;c.stroke();c.restore();
}
const phosphorParticles=[];
function emitPhosphorParticles(col){
  if(!state.particles||lastTracePoints.length<2)return;
  const level=Math.max(rms(monoData)*7,currentInput==="ART SIGNAL"?.35:0,mode==="xy"&&currentInput==="NO INPUT"?.2:0);
  const count=Math.min(18,Math.floor(Math.max(0,level-.04)*(state.particleAmount/100)*34));
  for(let i=0;i<count;i++){const p=lastTracePoints[Math.floor(Math.random()*lastTracePoints.length)];phosphorParticles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*(1+level*5),vy:(Math.random()-.5)*(1+level*5),life:1,size:.6+Math.random()*2.2});}
  if(phosphorParticles.length>900)phosphorParticles.splice(0,phosphorParticles.length-900);
}
function drawPhosphorParticles(c,col){
  if(!state.particles){phosphorParticles.length=0;return}
  emitPhosphorParticles(col);c.save();c.globalCompositeOperation="lighter";
  for(let i=phosphorParticles.length-1;i>=0;i--){const q=phosphorParticles[i];q.x+=q.vx*state.particleDrift;q.y+=q.vy*state.particleDrift;q.vy+=.004*state.particleDrift;q.life*=state.particleDecay;if(q.life<.025){phosphorParticles.splice(i,1);continue}c.globalAlpha=q.life*.85;c.fillStyle=`rgb(${col.trace})`;c.shadowColor=`rgb(${col.trace})`;c.shadowBlur=5+state.intensity*8+q.size*3;c.beginPath();c.rect(q.x-q.size,q.y-q.size,q.size*2,q.size*2);c.fill()}
  c.restore();
}
function render(c,w,h){const col=phosphors[state.phosphor];c.fillStyle=`rgb(${col.bg})`;c.fillRect(0,0,w,h);grid(c,w,h,col);tctx.fillStyle=`rgba(${col.bg},${1-state.persistence})`;tctx.fillRect(0,0,trail.width,trail.height);mode==="time"?drawTime(tctx,trail.width,trail.height,col):drawXY(tctx,trail.width,trail.height,col);c.save();c.globalCompositeOperation="screen";c.drawImage(trail,0,0,w,h);c.restore();drawPhosphorParticles(c,col)}
function animate(now=performance.now()){const dt=Math.min(.05,(now-lastFrameTime)/1000);lastFrameTime=now;if(pngSpinActive)pngSpinAngle+=dt*state.spinSpeed*Math.PI*2;if(state.zSpin)zSpinAngle=(zSpinAngle+dt*state.zSpinSpeed*360)%360;frame++;readAudio();render(ctx,canvas.width,canvas.height);ui.signalReadout.textContent=`${(rms(monoData)*5).toFixed(3)} V`;if(recorder?.state==="recording")drawRecordFrame();requestAnimationFrame(animate)}
function switchMode(next){mode=next;document.querySelectorAll(".mode-button").forEach(b=>b.classList.toggle("active",b.dataset.mode===next));ui.modeReadout.textContent=next==="time"?"TIME":"X-Y";tctx.clearRect(0,0,trail.width,trail.height)}
function normalizePoints(points,n=state.pointCount){
  if(points.length<2)return[];
  let lengths=[0],total=0;
  for(let i=1;i<points.length;i++){total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);lengths.push(total)}
  if(!total)return[];
  const out=[];
  for(let k=0;k<n;k++){
    const d=k/(n-1)*total;let i=1;
    while(i<lengths.length&&lengths[i]<d)i++;
    i=Math.min(i,lengths.length-1);
    const a=points[i-1],b=points[i],span=lengths[i]-lengths[i-1]||1,t=(d-lengths[i-1])/span;
    out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  }
  // Preserve sharp corners while smoothing curves. This keeps stars, letters,
  // snowflakes and logos from losing their tips or concave cuts.
  const locked=new Uint8Array(out.length);
  for(let i=1;i<out.length-1;i++){
    const a=out[i-1],b=out[i],c=out[i+1];
    const ux=a.x-b.x,uy=a.y-b.y,vx=c.x-b.x,vy=c.y-b.y;
    const cosine=(ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)||1);
    if(cosine>-.72){for(let j=Math.max(0,i-2);j<=Math.min(out.length-1,i+2);j++)locked[j]=1;}
  }
  for(let pass=0;pass<state.smooth;pass++){
    const copy=out.map(p=>({...p}));
    for(let i=1;i<out.length-1;i++){
      if(locked[i])continue;
      out[i].x=(copy[i-1].x+copy[i].x*2+copy[i+1].x)/4;
      out[i].y=(copy[i-1].y+copy[i].y*2+copy[i+1].y)/4;
    }
  }
  return out;
}
function preset(name){
  // Build the star from its ten actual vertices. The old version alternated
  // radius on every one of 1,800 samples, which produced a tangled spirograph.
  if(name==="star"){
    const p=[];
    for(let i=0;i<10;i++){
      const a=-Math.PI/2+i*Math.PI/5,r=i%2===0?1:.40;
      const q={x:r*Math.cos(a),y:r*Math.sin(a)};
      p.push(q);
      // Brief corner dwell makes every point bright and stable on the beam.
      p.push({...q},{...q});
    }
    p.push({...p[0]});
    return p;
  }
  const p=[],N=1800;
  for(let i=0;i<N;i++){
    const t=i/(N-1)*Math.PI*2;let x=0,y=0;
    if(name==="circle"){x=Math.cos(t);y=Math.sin(t)}
    else if(name==="infinity"){x=Math.sin(t);y=.65*Math.sin(2*t)}
    else if(name==="heart"){x=Math.pow(Math.sin(t),3);y=(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/17}
    else if(name==="flower"){const r=.78*Math.cos(5*t);x=r*Math.cos(t);y=r*Math.sin(t)}
    else if(name==="spiral"){const r=.08+.84*i/(N-1);x=r*Math.cos(10*t);y=r*Math.sin(10*t)}
    p.push({x,y});
  }
  return p;
}
async function playArt(points){const normalized=normalizePoints(points);if(normalized.length<2){alert("Create or load a path first.");return}disconnectInput();await ensureAudio();artPoints=normalized;const sr=audioContext.sampleRate,frames=Math.max(128,Math.round(sr/state.traceRate)),buffer=audioContext.createBuffer(2,frames,sr),L=buffer.getChannelData(0),R=buffer.getChannelData(1);for(let i=0;i<frames;i++){const p=normalized[Math.floor(i/frames*normalized.length)%normalized.length];L[i]=Math.max(-1,Math.min(1,p.x));R[i]=Math.max(-1,Math.min(1,p.y))}artSource=audioContext.createBufferSource();artGain=audioContext.createGain();artGain.gain.value=state.artLevel;artSource.buffer=buffer;artSource.loop=true;artSource.connect(artGain);sourceNode=artGain;setupAnalysis(artGain,2,true);artSource.start();currentInput="ART SIGNAL";ui.inputReadout.textContent=currentInput;status("VECTOR SIGNAL ACTIVE");switchMode("xy")}
function padDraw(){dctx.fillStyle="#090d09";dctx.fillRect(0,0,drawPad.width,drawPad.height);dctx.strokeStyle="#315f31";dctx.lineWidth=1;for(let i=1;i<10;i++){dctx.beginPath();dctx.moveTo(i*drawPad.width/10,0);dctx.lineTo(i*drawPad.width/10,drawPad.height);dctx.stroke()}for(let i=1;i<8;i++){dctx.beginPath();dctx.moveTo(0,i*drawPad.height/8);dctx.lineTo(drawPad.width,i*drawPad.height/8);dctx.stroke()}if(drawPoints.length){dctx.strokeStyle="#9cff91";dctx.lineWidth=2;dctx.beginPath();drawPoints.forEach((p,i)=>i?dctx.lineTo((p.x+1)*drawPad.width/2,(1-p.y)*drawPad.height/2):dctx.moveTo((p.x+1)*drawPad.width/2,(1-p.y)*drawPad.height/2));dctx.stroke()}}
let drawing=false;function pointerPoint(e){const r=drawPad.getBoundingClientRect();return{x:Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width)*2-1)),y:Math.max(-1,Math.min(1,1-((e.clientY-r.top)/r.height)*2))}}
drawPad.addEventListener("pointerdown",e=>{drawing=true;drawPad.setPointerCapture(e.pointerId);drawPoints.push(pointerPoint(e));padDraw()});drawPad.addEventListener("pointermove",e=>{if(!drawing)return;const p=pointerPoint(e),last=drawPoints.at(-1);if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.008){drawPoints.push(p);padDraw()}});drawPad.addEventListener("pointerup",()=>drawing=false);drawPad.addEventListener("pointercancel",()=>drawing=false);
async function parseSvg(file){const text=await file.text(),doc=new DOMParser().parseFromString(text,"image/svg+xml");if(doc.querySelector("parsererror"))throw Error("Invalid SVG file.");const svg=doc.documentElement,box=(svg.getAttribute("viewBox")||`0 0 ${svg.getAttribute("width")||100} ${svg.getAttribute("height")||100}`).trim().split(/[ ,]+/).map(Number),[vx,vy,vw,vh]=box;const host=document.createElement("div");host.style.cssText="position:absolute;left:-10000px;top:-10000px;width:1000px;height:1000px;visibility:hidden";host.innerHTML=text;document.body.appendChild(host);const paths=[...host.querySelectorAll("path,polyline,polygon,line,circle,ellipse,rect")],pts=[];for(const el of paths){if(typeof el.getTotalLength!=="function")continue;const len=el.getTotalLength(),samples=Math.max(20,Math.min(1500,Math.ceil(len*1.5)));for(let i=0;i<samples;i++){const q=el.getPointAtLength(i/(samples-1)*len);pts.push({x:((q.x-vx)/vw)*2-1,y:1-((q.y-vy)/vh)*2})}}host.remove();if(pts.length<2)throw Error("No usable SVG paths found. Use stroked vector paths.");return pts}
function previewPng(points){
  const pc=$("pngPreview"),pctx=pc.getContext("2d");pctx.fillStyle="#090d09";pctx.fillRect(0,0,pc.width,pc.height);
  pctx.strokeStyle="#315f31";pctx.lineWidth=1;for(let i=1;i<10;i++){pctx.beginPath();pctx.moveTo(i*pc.width/10,0);pctx.lineTo(i*pc.width/10,pc.height);pctx.stroke()}for(let i=1;i<8;i++){pctx.beginPath();pctx.moveTo(0,i*pc.height/8);pctx.lineTo(pc.width,i*pc.height/8);pctx.stroke()}
  if(points.length){pctx.strokeStyle="#9cff91";pctx.lineWidth=2;pctx.beginPath();points.forEach((p,i)=>i?pctx.lineTo((p.x+1)*pc.width/2,(1-p.y)*pc.height/2):pctx.moveTo((p.x+1)*pc.width/2,(1-p.y)*pc.height/2));pctx.stroke()}
}
function buildOutlinePath(imageData,w,h){
  const src=imageData.data;
  const gray=new Float32Array(w*h);
  const alpha=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++){
    const j=i*4,a=src[j+3]/255;
    alpha[i]=src[j+3];
    // Composite transparent pixels onto white so transparent backgrounds do not
    // create a false rectangle around the image.
    const r=src[j]*a+255*(1-a),g=src[j+1]*a+255*(1-a),b=src[j+2]*a+255*(1-a);
    gray[i]=.2126*r+.7152*g+.0722*b;
  }

  // Small blur removes single-pixel noise while keeping lettering and interior detail.
  const blur=new Float32Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    let sum=0;
    for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)sum+=gray[(y+yy)*w+x+xx];
    blur[y*w+x]=sum/9;
  }

  // Sobel edge detector. Higher INK THRESHOLD means more detail is accepted.
  const edge=new Uint8Array(w*h);
  const sensitivity=Math.max(8,255-state.edgeThreshold);
  const strength=Math.max(.1,state.pngEtchStrength);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;
    const gx=-blur[i-w-1]-2*blur[i-1]-blur[i+w-1]+blur[i-w+1]+2*blur[i+1]+blur[i+w+1];
    const gy=-blur[i-w-1]-2*blur[i-w]-blur[i-w+1]+blur[i+w-1]+2*blur[i+w]+blur[i+w+1];
    const rawGx=-gray[i-w-1]-2*gray[i-1]-gray[i+w-1]+gray[i-w+1]+2*gray[i+1]+gray[i+w+1];
    const rawGy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1];
    const alphaEdge=Math.max(
      Math.abs(alpha[i]-alpha[i-1]),Math.abs(alpha[i]-alpha[i+1]),
      Math.abs(alpha[i]-alpha[i-w]),Math.abs(alpha[i]-alpha[i+w])
    );
    // Combine a clean blurred edge with the sharper source edge. This keeps
    // tiny lettering, eyes, texture, and transparent PNG boundaries.
    const mag=Math.max(Math.hypot(gx,gy),Math.hypot(rawGx,rawGy)*.72,alphaEdge*2.1)*strength;
    if(mag>sensitivity)edge[i]=1;
  }

  // Thin dense edge bands by retaining local gradient ridges at the requested step.
  const step=Math.max(1,Math.round(state.pngLineSpacing));
  if(step>1){
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      if(!edge[y*w+x])continue;
      if((x+y)%step!==0){
        let neighbor=false;
        for(let yy=-1;yy<=1&&!neighbor;yy++)for(let xx=-1;xx<=1;xx++){
          if((xx||yy)&&edge[(y+yy)*w+x+xx]&&((x+xx+y+yy)%step===0)){neighbor=true;break}
        }
        if(neighbor)edge[y*w+x]=0;
      }
    }
  }

  // Trace connected edge pixels into individual contour strokes.
  const visited=new Uint8Array(w*h),paths=[];
  const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  function degree(x,y){let n=0;for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h&&edge[ny*w+nx]&&!visited[ny*w+nx])n++}return n}
  function trace(sx,sy){
    const path=[];let x=sx,y=sy,px=-999,py=-999;
    for(let guard=0;guard<w*h;guard++){
      const idx=y*w+x;if(visited[idx])break;visited[idx]=1;path.push({px:x,py:y});
      let best=null,bestScore=1e9;
      for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const ni=ny*w+nx;if(!edge[ni]||visited[ni])continue;
        let score=degree(nx,ny)*.15;
        if(px>-900){const ax=x-px,ay=y-py,bx=nx-x,by=ny-y;score+=1-((ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)||1));}
        if(score<bestScore){bestScore=score;best=[nx,ny]}
      }
      if(!best)break;px=x;py=y;[x,y]=best;
    }
    return path;
  }
  // Start with endpoints/junction-adjacent pixels, then collect closed loops.
  for(let pass=0;pass<2;pass++)for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(!edge[i]||visited[i])continue;
    const d=degree(x,y);if(pass===0&&d===2)continue;
    const path=trace(x,y);if(path.length>=3)paths.push(path);
  }
  if(!paths.length)return[];

  // Join contour strokes in nearest-neighbor order, reversing strokes when useful.
  // A physical X-Y beam cannot teleport, so this keeps unavoidable travel lines short.
  paths.sort((a,b)=>b.length-a.length);
  const ordered=[],remaining=paths.slice();
  let current=remaining.shift();ordered.push(...current);
  let endPt=current[current.length-1];
  while(remaining.length){
    let bestI=0,bestReverse=false,bestD=Infinity;
    for(let i=0;i<remaining.length;i++){
      const p=remaining[i],a=p[0],b=p[p.length-1];
      const da=(a.px-endPt.px)**2+(a.py-endPt.py)**2,db=(b.px-endPt.px)**2+(b.py-endPt.py)**2;
      if(da<bestD){bestD=da;bestI=i;bestReverse=false}
      if(db<bestD){bestD=db;bestI=i;bestReverse=true}
    }
    const p=remaining.splice(bestI,1)[0];if(bestReverse)p.reverse();
    // Repeat endpoints briefly to make the contour brighter and reduce the visual impact of travel.
    ordered.push({...endPt},...p);endPt=p[p.length-1];
  }

  const cx=(w-1)/2,cy=(h-1)/2,span=Math.max(w,h)||1;
  return ordered.map(p=>({x:(p.px-cx)/(span*.54),y:-(p.py-cy)/(span*.54)}));
}
async function parsePng(file){
  const img=new Image(),url=URL.createObjectURL(file);
  await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(Error("Could not read image."));img.src=url});
  pngImage=img;
  const max=Math.round(state.pngDetail),scale=Math.min(max/img.width,max/img.height),w=Math.max(24,Math.round(img.width*scale)),h=Math.max(24,Math.round(img.height*scale));
  const off=document.createElement("canvas");off.width=w;off.height=h;
  const oc=off.getContext("2d",{willReadFrequently:true});
  oc.clearRect(0,0,w,h);oc.drawImage(img,0,0,w,h);URL.revokeObjectURL(url);
  const data=oc.getImageData(0,0,w,h),raw=buildOutlinePath(data,w,h);
  if(raw.length<8)throw Error("The image did not contain enough visible information.");
  // Keep enough points to preserve image contents while capping CPU/audio load.
  const target=Math.max(2048,Math.min(state.pngVectorPoints,Math.max(Math.round(raw.length*.92),4096)));
  // Preserve pasted-image detail: resample densely, then use only light smoothing.
  const oldSmooth=state.smooth;state.smooth=Math.min(1,oldSmooth);
  const result=normalizePoints(raw,target);state.smooth=oldSmooth;
  return result;
}
async function playPngSpin(){
  if(pngPoints.length<2)return alert("Load a PNG first.");disconnectInput();await ensureAudio();artPoints=pngPoints;pngSpinActive=true;pngSpinAngle=0;pngSignalIndex=0;artGain=audioContext.createGain();artGain.gain.value=state.artLevel;artProcessor=audioContext.createScriptProcessor(1024,0,2);artProcessor.onaudioprocess=e=>{const L=e.outputBuffer.getChannelData(0),R=e.outputBuffer.getChannelData(1),pts=transformedPngPoints();for(let i=0;i<L.length;i++){const p=pts[Math.floor(pngSignalIndex)%pts.length];L[i]=Math.max(-1,Math.min(1,p.x));R[i]=Math.max(-1,Math.min(1,p.y));pngSignalIndex+=pts.length*state.traceRate/audioContext.sampleRate}};artProcessor.connect(artGain);sourceNode=artGain;setupAnalysis(artGain,2,true);currentInput="ART SIGNAL";ui.inputReadout.textContent="PNG DETAIL OUTLINE";status("DETAILED IMAGE OUTLINE ACTIVE");switchMode("xy");$("stopPngBtn").disabled=false;
}
function wavBlob(points){const n=normalizePoints(points),sr=44100,frames=Math.max(128,Math.round(sr/state.traceRate)),bytes=44+frames*4,b=new ArrayBuffer(bytes),v=new DataView(b);const s=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));s(0,"RIFF");v.setUint32(4,bytes-8,true);s(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);s(36,"data");v.setUint32(40,frames*4,true);for(let i=0;i<frames;i++){const p=n[Math.floor(i/frames*n.length)%n.length],lev=state.artLevel;v.setInt16(44+i*4,Math.max(-32767,Math.min(32767,p.x*lev*32767)),true);v.setInt16(46+i*4,Math.max(-32767,Math.min(32767,p.y*lev*32767)),true)}return new Blob([b],{type:"audio/wav"})}
function recordSize(){const v=$("recordFormat").value;return v==="9:16"?{width:720,height:1280}:v==="1:1"?{width:1080,height:1080}:{width:1280,height:720}}
function drawRecordFrame(){const sw=canvas.width,sh=canvas.height,tr=outputCanvas.width/outputCanvas.height,sr=sw/sh;let sx=0,sy=0,cw=sw,ch=sh;if(sr>tr){cw=sh*tr;sx=(sw-cw)/2}else{ch=sw/tr;sy=(sh-ch)/2}outputCtx.drawImage(canvas,sx,sy,cw,ch,0,0,outputCanvas.width,outputCanvas.height)}
function mime(){if(typeof MediaRecorder==="undefined"||typeof MediaRecorder.isTypeSupported!=="function")return"";return["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(type=>MediaRecorder.isTypeSupported(type))||""}
async function startRecord(){
  if(typeof MediaRecorder==="undefined"||!HTMLCanvasElement.prototype.captureStream)throw Error("Canvas recording is not available in this browser.");
  const z=recordSize();outputCanvas=document.createElement("canvas");outputCanvas.width=z.width;outputCanvas.height=z.height;outputCtx=outputCanvas.getContext("2d");
  const stream=outputCanvas.captureStream(30),combined=new MediaStream(stream.getVideoTracks());recordDest?.stream.getAudioTracks().forEach(t=>combined.addTrack(t));
  const type=mime(),options={videoBitsPerSecond:8e6};if(type)options.mimeType=type;recorder=new MediaRecorder(combined,options);
  recordChunks=[];recorder.ondataavailable=e=>e.data.size&&recordChunks.push(e.data);recorder.onstop=saveRecord;recorder.start(250);recordStartedAt=Date.now();$("recordBtn").disabled=true;$("stopRecordBtn").disabled=false;ui.recordReadout.textContent="REC ACTIVE";ui.recordGuide.hidden=false;recordTimer=setInterval(recordClock,500);recordClock();
}
function stopRecord(){if(recorder?.state==="recording")recorder.stop()}function recordClock(){const s=Math.floor((Date.now()-recordStartedAt)/1000);$("recordTime").textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}
function saveRecord(){clearInterval(recordTimer);const blob=new Blob(recordChunks,{type:recorder.mimeType||"video/webm"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=`0PTICSCOPE-${new Date().toISOString().replace(/[:.]/g,"-")}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);$("recordBtn").disabled=false;$("stopRecordBtn").disabled=true;$("recordTime").textContent="00:00";ui.recordReadout.textContent="REC OFF";ui.recordGuide.hidden=true;recorder=null}
function range(id,key,out,fmt){const i=$(id),o=$(out),u=()=>{state[key]=+i.value;o.value=fmt(state[key])};i.addEventListener("input",u);u()}
range("gain","gain","gainOut",v=>v.toFixed(2)+"×");range("focus","focus","focusOut",v=>v.toFixed(2));range("intensity","intensity","intensityOut",v=>v.toFixed(2));range("persistence","persistence","persistenceOut",v=>v.toFixed(2));range("sweep","sweep","sweepOut",v=>v.toFixed(2));range("triggerLevel","triggerLevel","triggerOut",v=>v.toFixed(2));range("xGain","xGain","xGainOut",v=>v.toFixed(2)+"×");range("yGain","yGain","yGainOut",v=>v.toFixed(2)+"×");range("rotation","rotation","rotationOut",v=>Math.round(v)+"°");range("zSpinSpeed","zSpinSpeed","zSpinSpeedOut",v=>v.toFixed(2)+"×");range("xyPhase","xyPhase","xyPhaseOut",v=>Math.round(v)+"°");range("particleAmount","particleAmount","particleAmountOut",v=>Math.round(v));range("particleDecay","particleDecay","particleDecayOut",v=>v.toFixed(3));range("particleDrift","particleDrift","particleDriftOut",v=>v.toFixed(1));range("traceRate","traceRate","traceRateOut",v=>Math.round(v)+" Hz");range("pointCount","pointCount","pointCountOut",v=>Math.round(v));range("smooth","smooth","smoothOut",v=>Math.round(v));range("artLevel","artLevel","artLevelOut",v=>{if(artGain&&audioContext)artGain.gain.setTargetAtTime(v,audioContext.currentTime,.01);return Math.round(v*100)+"%"});range("edgeThreshold","edgeThreshold","edgeThresholdOut",v=>Math.round(v));range("pngDetail","pngDetail","pngDetailOut",v=>Math.round(v));range("pngLineSpacing","pngLineSpacing","pngLineSpacingOut",v=>Math.round(v));range("pngEtchStrength","pngEtchStrength","pngEtchStrengthOut",v=>v.toFixed(2));range("pngVectorPoints","pngVectorPoints","pngVectorPointsOut",v=>Math.round(v));range("spinSpeed","spinSpeed","spinSpeedOut",v=>v.toFixed(2)+"×");range("spinDepth","spinDepth","spinDepthOut",v=>v.toFixed(2));
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${b.dataset.page}`))}));document.querySelectorAll(".mode-button").forEach(b=>b.addEventListener("click",()=>switchMode(b.dataset.mode)));
$("micBtn").onclick=()=>connectMic().catch(e=>alert(e.message));$("desktopBtn").onclick=()=>connectDesktop().catch(e=>alert(e.message));$("stopInputBtn").onclick=disconnectInput;$("audioFile").onchange=e=>e.target.files[0]&&connectFile(e.target.files[0]).catch(x=>alert(x.message));$("refreshAudioDevices")?.addEventListener("click",()=>refreshFirefoxAudioDevices(true));navigator.mediaDevices?.addEventListener?.("devicechange",()=>refreshFirefoxAudioDevices(false));refreshFirefoxAudioDevices(false);$("phosphorSelect").onchange=e=>{state.phosphor=e.target.value;tctx.clearRect(0,0,trail.width,trail.height)};$("gridToggle").onchange=e=>state.grid=e.target.checked;$("triggerToggle").onchange=e=>state.trigger=e.target.checked;$("invertY").onchange=e=>state.invertY=e.target.checked;$("particlesToggle").onchange=e=>state.particles=e.target.checked;$("zSpinToggle").onchange=e=>{state.zSpin=e.target.checked;if(!state.zSpin)zSpinAngle=0};$("resetXYBtn").onclick=()=>{[["xGain",1],["yGain",1],["rotation",0],["xyPhase",-180],["zSpinSpeed",.08]].forEach(([id,v])=>{$(id).value=v;$(id).dispatchEvent(new Event("input"))});$("invertY").checked=false;state.invertY=false;$("zSpinToggle").checked=false;state.zSpin=false;zSpinAngle=0;$("xyAutoGain").checked=true;state.xyAutoGain=true};
const recommendedSettings={gain:.60,focus:3,intensity:1.20,persistence:.85,particleAmount:6,particleDecay:.955,particleDrift:.8,sweep:1,triggerLevel:0,xGain:1.20,yGain:1.35,rotation:0,xyPhase:-180,zSpinSpeed:.05};
$("applyRecommendedBtn").onclick=()=>{
  Object.entries(recommendedSettings).forEach(([id,v])=>{const el=$(id);if(el){el.value=v;el.dispatchEvent(new Event("input"))}});
  [["particlesToggle","particles",true],["triggerToggle","trigger",true],["zSpinToggle","zSpin",false],["invertY","invertY",false],["xyAutoGain","xyAutoGain",true]].forEach(([id,key,on])=>{const el=$(id);el.checked=on;state[key]=on});
  zSpinAngle=0;
  $("recommendedStatus").textContent="Recommended starting settings applied. Fine-tune gain and X-Y calibration for your source.";
};
const fullscreenTarget=document.querySelector(".crt-glass");
$("fullscreenBtn").onclick=async()=>{try{if(!document.fullscreenElement)await fullscreenTarget.requestFullscreen();else await document.exitFullscreen()}catch(e){alert("Fullscreen is not available in this browser window.")}};
document.addEventListener("fullscreenchange",()=>{$("fullscreenBtn").textContent=document.fullscreenElement?"EXIT FULLSCREEN":"FULLSCREEN VISUAL"});
document.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>playArt(preset(b.dataset.preset)).catch(e=>alert(e.message)));$("clearDrawingBtn").onclick=()=>{drawPoints=[];padDraw()};$("playDrawingBtn").onclick=()=>playArt(drawPoints).catch(e=>alert(e.message));$("svgFile").onchange=async e=>{try{svgPoints=await parseSvg(e.target.files[0]);$("playSvgBtn").disabled=false;$("svgStatus").textContent=`Loaded ${svgPoints.length} path samples.`}catch(x){svgPoints=[];$("playSvgBtn").disabled=true;$("svgStatus").textContent=x.message}};$("playSvgBtn").onclick=()=>playArt(svgPoints).catch(e=>alert(e.message));$("pngFile").onchange=async e=>{try{const f=e.target.files[0];if(!f)return;pngPoints=await parsePng(f);previewPng(pngPoints);$("playPngBtn").disabled=false;$("pngStatus").textContent=`Image outlined into ${pngPoints.length} detailed contour points.`}catch(x){pngPoints=[];previewPng([]);$("playPngBtn").disabled=true;$("pngStatus").textContent=x.message}};const rebuildPng=async()=>{const f=$("pngFile").files[0];if(f)$("pngFile").dispatchEvent(new Event("change"))};["edgeThreshold","pngDetail","pngLineSpacing","pngEtchStrength","pngVectorPoints"].forEach(id=>$(id).addEventListener("change",rebuildPng));window.addEventListener("paste",async e=>{const f=[...e.clipboardData.items].find(i=>i.type.startsWith("image/"))?.getAsFile();if(!f)return;try{pngPoints=await parsePng(f);previewPng(pngPoints);$("playPngBtn").disabled=false;$("pngStatus").textContent=`Pasted image outlined into ${pngPoints.length} detailed contour points.`}catch(x){$("pngStatus").textContent=x.message}});$("playPngBtn").onclick=()=>playPngSpin().catch(e=>alert(e.message));$("stopPngBtn").onclick=stopArt;$("stopArtBtn").onclick=stopArt;$("exportWavBtn").onclick=()=>{const pts=artPoints.length?artPoints:drawPoints;if(pts.length<2)return alert("Play or draw an art signal first.");const u=URL.createObjectURL(wavBlob(pts)),a=document.createElement("a");a.href=u;a.download="0PTICSCOPE-vector-signal.wav";a.click();setTimeout(()=>URL.revokeObjectURL(u),4000)};$("recordBtn").onclick=()=>startRecord().catch(e=>alert(e.message));$("stopRecordBtn").onclick=stopRecord;
padDraw();previewPng([]);status("STANDBY",false);animate();
