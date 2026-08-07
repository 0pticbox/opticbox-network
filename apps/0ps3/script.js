const canvas=document.getElementById("visualizer");
const mainCtx=canvas.getContext("2d");
const $=id=>document.getElementById(id);

const mode=$("modeSelect"),theme=$("themeSelect"),sens=$("sensitivity"),motion=$("motion"),trails=$("trails"),glow=$("glow");
const remixEnabled=$("remixEnabled"),remixControls=$("remixControls"),remixModeA=$("remixModeA"),remixModeB=$("remixModeB"),crossfade=$("crossfade"),crossfadeValue=$("crossfadeValue"),autoCrossfade=$("autoCrossfade"),autoSpeed=$("autoCrossfadeSpeed"),autoSpeedLabel=$("autoSpeedLabel");
const imageButton=$("imageButton"),imageFileInput=$("imageFileInput"),imageDropZone=$("imageDropZone"),imageFileName=$("imageFileName"),removeImageButton=$("removeImageButton");
const symmetry=$("symmetry"),fractalZoom=$("fractalZoom"),imageStrength=$("imageStrength"),mirrorImage=$("mirrorImage");
const pipButton=$("pipButton"),pipVideo=$("pipVideo");
const recordingRatio=$("recordingRatio"),showRecordingGuide=$("showRecordingGuide"),recordingGuide=$("recordingGuide"),recordingGuideLabel=$("recordingGuideLabel");
const recordingCanvas=$("recordingCanvas"),recordingCtx=recordingCanvas.getContext("2d"),startRecordingButton=$("startRecordingButton"),stopRecordingButton=$("stopRecordingButton"),recordingTimer=$("recordingTimer"),recordingStatus=$("recordingStatus");
const startCaptureButton=$("startCaptureButton"),stopCaptureButton=$("stopCaptureButton"),capturePreview=$("capturePreview"),captureStatus=$("captureStatus");
const cropWidth=$("cropWidth"),cropHeight=$("cropHeight"),cropX=$("cropX"),cropY=$("cropY"),captureOpacity=$("captureOpacity"),captureMirror=$("captureMirror");
let pipStream=null;
let recordingDestination=null,mediaRecorder=null,recordingChunks=[],recordingDrawId=null,recordingStartedAt=0,recordingTimerId=null;

const themes={
  ocean:["#55c7ff","#6e78ff","#c6e7ff"],
  violet:["#8d79ff","#e166ff","#79c8ff"],
  aurora:["#50ffd0","#5bc0ff","#aa7dff"],
  ember:["#ff674d","#ffb84f","#ff4f9a"],
  monochrome:["#ffffff","#b8c1d1","#667085"]
};

let ac,an,src,stream,fileSrc,freq,energy=0,bass=0,treble=0,t=0,pts=[],autoPhase=0,dpr=1,w=innerWidth,h=innerHeight,fractalImage=null,captureStream=null;
const layerA=document.createElement("canvas"),layerB=document.createElement("canvas");
const ctxA=layerA.getContext("2d"),ctxB=layerB.getContext("2d");

function sizeCanvas(target,ctx){target.width=Math.floor(w*dpr);target.height=Math.floor(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
function resize(){dpr=Math.min(devicePixelRatio||1,1.35);w=innerWidth;h=innerHeight;sizeCanvas(canvas,mainCtx);sizeCanvas(layerA,ctxA);sizeCanvas(layerB,ctxB);canvas.style.width=w+"px";canvas.style.height=h+"px"}
addEventListener("resize",resize);resize();

function status(live,text){$("statusDot").classList.toggle("live",live);$("statusText").textContent=text;$("stopButton").disabled=!live}
async function prep(){if(!ac||ac.state==="closed")ac=new(AudioContext||webkitAudioContext)();if(ac.state==="suspended")await ac.resume();an=ac.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=.82;freq=new Uint8Array(an.frequencyBinCount);recordingDestination=ac.createMediaStreamDestination()}
function stop(show=true){if(stream){stream.getTracks().forEach(q=>q.stop());stream=null}if(src)try{src.disconnect()}catch{}if(fileSrc)try{fileSrc.disconnect()}catch{}if(an)try{an.disconnect()}catch{}$("audioPlayer").pause();an=null;freq=null;energy=bass=treble=0;if(show)status(false,"No audio source connected")}
async function mic(){try{stop(false);stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});await prep();src=ac.createMediaStreamSource(stream);src.connect(an);src.connect(recordingDestination);status(true,"Microphone connected")}catch(e){status(false,e.message)}}
async function desktop(){try{stop(false);stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,systemAudio:"include"});const tracks=stream.getAudioTracks();if(!tracks.length)throw Error("No shared audio track. Try Edge/Chrome tab audio.");await prep();src=ac.createMediaStreamSource(new MediaStream([tracks[0]]));src.connect(an);src.connect(recordingDestination);stream.getTracks().forEach(q=>q.addEventListener("ended",()=>stop()));status(true,"Desktop audio connected")}catch(e){stop(false);status(false,e.message)}}
async function file(f){if(!f)return;stop(false);await prep();const p=$("audioPlayer");p.src=URL.createObjectURL(f);p.classList.add("visible");if(!fileSrc)fileSrc=ac.createMediaElementSource(p);fileSrc.connect(an);fileSrc.connect(recordingDestination);fileSrc.connect(ac.destination);await p.play();status(true,f.name)}

function analyze(){if(!an){energy*=.94;bass*=.94;treble*=.94;return}an.getByteFrequencyData(freq);let sum=0;for(const v of freq)sum+=v;const raw=sum/freq.length/255;energy+=(Math.min(1,raw*+sens.value*3.2)-energy)*.25;const be=Math.max(1,Math.floor(freq.length*.045));let bs=0;for(let i=0;i<be;i++)bs+=freq[i];bass+=(bs/be/255-bass)*.25;let ts=0,n=0;for(let i=Math.floor(freq.length*.25);i<Math.floor(freq.length*.7);i++){ts+=freq[i];n++}treble+=(ts/Math.max(1,n)/255-treble)*.2}
function pal(){return themes[theme.value]}
function fv(r,range=.35){if(!freq)return 0;const i=Math.min(freq.length-1,Math.max(0,Math.floor(r*freq.length*range)));return freq[i]/255}
function clearLayer(ctx){ctx.clearRect(0,0,w,h)}

function flow(ctx){const p=pal();ctx.save();ctx.globalCompositeOperation="lighter";ctx.lineCap="round";ctx.shadowBlur=+glow.value;for(let r=0;r<5;r++){ctx.beginPath();for(let px=-60;px<=w+60;px+=7){const y=h*(.2+r*.095)+Math.sin(px*.009+t*.014+r*1.3)*(36+energy*80)+Math.cos(px*.018-t*.008+r)*18+fv(Math.max(0,px/w),.3)*90;px===-60?ctx.moveTo(px,y):ctx.lineTo(px,y)}ctx.strokeStyle=p[r%3]+"77";ctx.shadowColor=p[r%3];ctx.lineWidth=8+bass*22;ctx.stroke();ctx.strokeStyle="#ffffff2a";ctx.lineWidth=1.2;ctx.stroke()}ctx.restore()}
function orb(ctx){const p=pal(),cx=w*.5,cy=h*.5,b=Math.min(w,h)*.19;ctx.save();ctx.translate(cx,cy);ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;for(let l=0;l<11;l++){ctx.beginPath();for(let i=0;i<=150;i++){const a=i/150*Math.PI*2,r=b+l*3+Math.sin(a*3+t*.018+l*.2)*17+Math.cos(a*7-t*.011)*8+fv(i/150,.2)*65,px=Math.cos(a)*r,py=Math.sin(a)*r*(.82+Math.sin(t*.003)*.08);i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.strokeStyle=p[l%3]+"35";ctx.shadowColor=p[l%3];ctx.lineWidth=2;ctx.stroke()}ctx.restore()}
function tunnel(ctx){const p=pal(),cx=w*.5+Math.sin(t*.006)*w*.08,cy=h*.5+Math.cos(t*.004)*h*.06;ctx.save();ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;for(let r=0;r<30;r++){const z=(r/30+t*.0025)%1,R=18+Math.pow(z,2.3)*Math.max(w,h)*.58*(1+bass*.25);ctx.beginPath();for(let s=0;s<=16;s++){const a=s/16*Math.PI*2+t*.002+r*.025,px=cx+Math.cos(a)*R,py=cy+Math.sin(a)*R*.68;s?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.strokeStyle=p[r%3]+Math.floor(30+z*180).toString(16).padStart(2,"0");ctx.shadowColor=p[r%3];ctx.lineWidth=1+z*4;ctx.stroke()}ctx.restore()}
function spectrum(ctx){const p=pal(),bars=56,bw=w/bars;ctx.save();ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;for(let i=0;i<bars;i++){const v=freq?fv(i/bars,.35):Math.sin(i*.15+t*.03)*.05+.08,bh=16+v*h*.56,px=i*bw,py=h-bh,g=ctx.createLinearGradient(0,py,0,h);g.addColorStop(0,p[i%3]);g.addColorStop(1,p[(i+1)%3]+"18");ctx.fillStyle=g;ctx.shadowColor=p[i%3];ctx.fillRect(px+1,py,Math.max(1,bw-3),bh)}ctx.restore()}
function particles(ctx){const target=Math.min(500,Math.floor(w*h/4200));while(pts.length<target)pts.push({x:Math.random()*w,y:Math.random()*h,z:Math.random(),vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4});pts.length=target;const p=pal();ctx.save();ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;pts.forEach((q,i)=>{q.x+=q.vx*+motion.value*(1+bass*4);q.y+=q.vy*+motion.value*(1+bass*4);if(q.x<0)q.x=w;if(q.x>w)q.x=0;if(q.y<0)q.y=h;if(q.y>h)q.y=0;const s=.7+q.z*2.2+treble*3;ctx.fillStyle=p[i%3]+"aa";ctx.shadowColor=p[i%3];ctx.beginPath();ctx.arc(q.x,q.y,s,0,Math.PI*2);ctx.fill()});ctx.restore()}
function wave(ctx){const p=pal();ctx.save();ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;for(let l=0;l<22;l++){ctx.beginPath();for(let px=0;px<=w;px+=5){const py=h*.5+Math.sin(px*.012+t*.012+l*.19)*(28+energy*75)+Math.sin(px*.004-t*.007)*45+fv(px/w,.45)*100+(l-11)*4;px?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.strokeStyle=p[l%3]+"32";ctx.shadowColor=p[l%3];ctx.lineWidth=1.5+bass*3;ctx.stroke()}ctx.restore()}
function rings(ctx){const p=pal();ctx.save();ctx.translate(w*.5,h*.5);ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;for(let r=0;r<22;r++){const z=(r/34+t*.003)%1,R=z*Math.min(w,h)*.65;ctx.beginPath();ctx.ellipse(0,Math.sin(t*.015+r)*12*energy,R,R*(.52+bass*.15),t*.002,0,Math.PI*2);ctx.strokeStyle=p[r%3]+Math.floor(30+z*170).toString(16).padStart(2,"0");ctx.shadowColor=p[r%3];ctx.lineWidth=1+z*3;ctx.stroke()}ctx.restore()}
function helix(ctx){const p=pal(),cy=h*.5,A=Math.min(180,h*.28)*(1+bass*.25);ctx.save();ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;for(let s=0;s<3;s++){ctx.beginPath();for(let px=0;px<=w;px+=4){const phase=px*.012+t*.014+s*Math.PI*2/3,py=cy+Math.sin(phase)*A*(.45+fv(px/w,.4)*.8);px?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.strokeStyle=p[s]+"aa";ctx.shadowColor=p[s];ctx.lineWidth=2+bass*6;ctx.stroke()}ctx.restore()}
function nebula(ctx){const p=pal();ctx.save();ctx.globalCompositeOperation="lighter";for(let i=0;i<24;i++){const a=i*2.399+t*.002,R=20+i*Math.min(w,h)*.022,px=w*.5+Math.cos(a)*R,py=h*.5+Math.sin(a*1.17)*R*.62,s=80+(i%6)*34+energy*140,g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,p[i%3]+"28");g.addColorStop(.45,p[(i+1)%3]+"12");g.addColorStop(1,"#00000000");ctx.fillStyle=g;ctx.fillRect(px-s,py-s,s*2,s*2)}ctx.restore()}
function prism(ctx){const p=pal();ctx.save();ctx.translate(w*.5,h*.5);ctx.globalCompositeOperation="lighter";ctx.shadowBlur=+glow.value;for(let s=0;s<14;s++){ctx.save();ctx.rotate(s/14*Math.PI*2+t*.0015);ctx.beginPath();for(let R=20;R<Math.max(w,h)*.55;R+=12){const py=Math.sin(R*.035+t*.02)*(18+energy*48)+fv(R/(Math.max(w,h)*.55),.45)*70;R===20?ctx.moveTo(R,py):ctx.lineTo(R,py)}ctx.strokeStyle=p[s%3]+"52";ctx.shadowColor=p[s%3];ctx.lineWidth=1.5+bass*4;ctx.stroke();ctx.restore()}ctx.restore()}


function mandala(ctx){
  const p=pal(),cx=w*.5,cy=h*.5;
  const slices=Math.max(4,+symmetry.value);
  const maxR=Math.hypot(w,h)*.62;

  ctx.save();
  ctx.translate(cx,cy);
  ctx.globalCompositeOperation="lighter";
  ctx.shadowBlur=+glow.value;

  for(let ring=0;ring<25;ring++){
    const depth=(ring/25+t*.0028)%1;
    const radius=20+Math.pow(depth,2.15)*maxR*(1+bass*.32);
    const twist=t*.0024+ring*.045;
    const pulse=1+fv((ring%24)/24,.32)*.35;

    ctx.beginPath();

    for(let s=0;s<=slices;s++){
      const angle=s/slices*Math.PI*2+twist;
      const petal=Math.sin(angle*(slices/2)+t*.012)*radius*.09*energy;
      const r=radius*pulse+petal;
      const px=Math.cos(angle)*r;
      const py=Math.sin(angle)*r*.72;

      if(s===0)ctx.moveTo(px,py);
      else ctx.lineTo(px,py);
    }

    ctx.closePath();
    const alpha=Math.floor(25+depth*190).toString(16).padStart(2,"0");
    ctx.strokeStyle=p[ring%3]+alpha;
    ctx.shadowColor=p[ring%3];
    ctx.lineWidth=1+depth*3.5+bass*2;
    ctx.stroke();

    if(ring%3===0){
      for(let s=0;s<slices;s++){
        const angle=s/slices*Math.PI*2-twist*.6;
        const dotR=radius*.92;
        const size=1.2+depth*3+treble*4;
        ctx.fillStyle=p[(s+ring)%3]+"99";
        ctx.beginPath();
        ctx.arc(Math.cos(angle)*dotR,Math.sin(angle)*dotR*.72,size,0,Math.PI*2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

function drawImageWedge(ctx,image,radius,angleSize,index,rotation,alpha){
  ctx.save();
  ctx.rotate(index*angleSize+rotation);

  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.arc(0,0,radius,-angleSize*.56,angleSize*.56);
  ctx.closePath();
  ctx.clip();

  if(mirrorImage.checked&&index%2===1){
    ctx.scale(1,-1);
  }

  const zoom=+fractalZoom.value*(1+energy*.22);
  const imageRatio=image.width/image.height;
  const drawH=radius*2.2*zoom;
  const drawW=drawH*imageRatio;
  const driftX=Math.sin(t*.006+index)*radius*.22;
  const driftY=Math.cos(t*.004-index)*radius*.18;

  ctx.globalAlpha=alpha;
  ctx.translate(driftX,driftY);
  ctx.rotate(Math.sin(t*.002+index)*.22);
  ctx.drawImage(image,-drawW*.5,-drawH*.5,drawW,drawH);
  ctx.restore();
}

function imageFractal(ctx){
  const p=pal(),cx=w*.5,cy=h*.5;
  const slices=Math.max(4,+symmetry.value);
  const angleSize=Math.PI*2/slices;
  const radius=Math.hypot(w,h)*.55;
  const strength=+imageStrength.value/100;

  ctx.save();
  ctx.translate(cx,cy);
  ctx.globalCompositeOperation="screen";
  ctx.shadowBlur=+glow.value*.65;

  if(fractalImage){
    for(let layer=0;layer<2;layer++){
      const layerScale=1-layer*.18;
      const layerAlpha=strength*(.55-layer*.08);
      const rotation=t*(.0014+layer*.0005)*(layer%2?-1:1);

      ctx.save();
      ctx.scale(layerScale,layerScale);

      for(let i=0;i<slices;i++){
        drawImageWedge(ctx,fractalImage,radius,angleSize,i,rotation,layerAlpha);
      }

      ctx.restore();
    }
  }else{
    for(let i=0;i<slices;i++){
      ctx.save();
      ctx.rotate(i*angleSize+t*.0018);
      const grad=ctx.createLinearGradient(0,0,radius,0);
      grad.addColorStop(0,p[i%3]+"88");
      grad.addColorStop(.5,p[(i+1)%3]+"44");
      grad.addColorStop(1,"#00000000");
      ctx.fillStyle=grad;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.arc(0,0,radius,-angleSize*.48,angleSize*.48);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  for(let ring=0;ring<7;ring++){
    const r=(ring+1)/7*radius*(.35+bass*.08);
    ctx.strokeStyle=p[ring%3]+"28";
    ctx.lineWidth=1+treble*2;
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

function loadFractalImage(file){
  if(!file)return;

  if(!file.type.startsWith("image/")){
    imageFileName.textContent="Choose a PNG, JPG, or WEBP image";
    return;
  }

  const reader=new FileReader();

  reader.onload=event=>{
    const image=new Image();

    image.onload=()=>{
      fractalImage=image;
      imageFileName.textContent=file.name;
      mode.value="imageFractal";
    };

    image.src=event.target.result;
  };

  reader.readAsDataURL(file);
}


function liveCapture(ctx){
  if(!capturePreview.srcObject||capturePreview.readyState<2){
    ctx.save();
    ctx.fillStyle="rgba(255,255,255,.08)";
    ctx.font='16px "Alsina", Impact, sans-serif';
    ctx.textAlign="center";
    ctx.fillText("Choose a screen or window in Live Capture",w*.5,h*.5);
    ctx.restore();
    return;
  }

  const vw=capturePreview.videoWidth;
  const vh=capturePreview.videoHeight;
  if(!vw||!vh)return;

  const cw=vw*(+cropWidth.value/100);
  const ch=vh*(+cropHeight.value/100);
  const maxX=vw-cw;
  const maxY=vh-ch;
  const sx=maxX*(+cropX.value/100);
  const sy=maxY*(+cropY.value/100);

  const scale=Math.max(w/cw,h/ch);
  const dw=cw*scale;
  const dh=ch*scale;
  const dx=(w-dw)/2;
  const dy=(h-dh)/2;

  ctx.save();
  ctx.globalAlpha=+captureOpacity.value/100;

  if(captureMirror.checked){
    ctx.translate(w,0);
    ctx.scale(-1,1);
    ctx.drawImage(capturePreview,sx,sy,cw,ch,-dx-dw,dy,dw,dh);
  }else{
    ctx.drawImage(capturePreview,sx,sy,cw,ch,dx,dy,dw,dh);
  }

  ctx.restore();
}

async function startLiveCapture(){
  try{
    stopLiveCapture();

    captureStream=await navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:{ideal:30,max:30}},
      audio:false
    });

    capturePreview.srcObject=captureStream;
    await capturePreview.play();

    capturePreview.classList.add("active");
    captureStatus.style.display="none";
    startCaptureButton.textContent="Change Screen / Window";
    stopCaptureButton.disabled=false;

    captureStream.getVideoTracks()[0].addEventListener("ended",stopLiveCapture);
    mode.value="liveCapture";
  }catch(error){
    captureStatus.textContent=error.message||"Live capture could not start.";
    captureStatus.style.display="grid";
  }
}

function stopLiveCapture(){
  if(captureStream){
    captureStream.getTracks().forEach(track=>track.stop());
    captureStream=null;
  }

  capturePreview.pause();
  capturePreview.srcObject=null;
  capturePreview.classList.remove("active");
  captureStatus.textContent="No live capture selected";
  captureStatus.style.display="grid";
  startCaptureButton.textContent="Choose Screen / Window";
  stopCaptureButton.disabled=true;
}

const visuals={flow,orb,spectrum,rings,mandala,imageFractal,liveCapture};



function ambient(){const p=pal();mainCtx.fillStyle=`rgba(2,4,10,${+trails.value})`;mainCtx.fillRect(0,0,w,h);const g=mainCtx.createRadialGradient(w*.5,h*.48,0,w*.5,h*.5,Math.max(w,h)*.7);g.addColorStop(0,p[0]+"28");g.addColorStop(.4,p[1]+"15");g.addColorStop(1,"#020309");mainCtx.fillStyle=g;mainCtx.fillRect(0,0,w,h)}
function drawTo(which,ctx){clearLayer(ctx);visuals[which](ctx)}
function updateFade(v){crossfadeValue.textContent=`${100-Math.round(v)}% / ${Math.round(v)}%`}

let lastFrameTime=0;
function render(frameTime=0){
  requestAnimationFrame(render);
  if(frameTime-lastFrameTime<33)return;
  lastFrameTime=frameTime;
  t+=+motion.value;
  analyze();if(autoCrossfade.checked&&remixEnabled.checked){autoPhase+=+autoSpeed.value*+motion.value;crossfade.value=Math.round((Math.sin(autoPhase)*.5+.5)*100);updateFade(+crossfade.value)}ambient();if(remixEnabled.checked){drawTo(remixModeA.value,ctxA);drawTo(remixModeB.value,ctxB);const mix=+crossfade.value/100;mainCtx.save();mainCtx.globalCompositeOperation="screen";mainCtx.globalAlpha=1-mix;mainCtx.drawImage(layerA,0,0,w,h);mainCtx.globalAlpha=mix;mainCtx.drawImage(layerB,0,0,w,h);mainCtx.restore();$("overlayMode").textContent=`REMIX · ${remixModeA.options[remixModeA.selectedIndex].text.toUpperCase()} + ${remixModeB.options[remixModeB.selectedIndex].text.toUpperCase()}`}else{drawTo(mode.value,ctxA);mainCtx.save();mainCtx.globalCompositeOperation="screen";mainCtx.drawImage(layerA,0,0,w,h);mainCtx.restore();$("overlayMode").textContent=mode.options[mode.selectedIndex].text.toUpperCase()}$("overlayTitle").textContent=$("titleInput").value.trim()||"OPTICBOX";document.querySelector(".now-playing").style.display=$("showTitle").checked?"flex":"none";}

$("micButton").addEventListener("click",mic);$("desktopButton").addEventListener("click",desktop);$("fileButton").addEventListener("click",()=>$("audioFileInput").click());$("stopButton").addEventListener("click",()=>stop());$("audioFileInput").addEventListener("change",e=>{file(e.target.files[0]);e.target.value=""});
$("collapseButton").addEventListener("click",()=>{$("controlDock").classList.toggle("collapsed");$("collapseButton").textContent=$("controlDock").classList.contains("collapsed")?"+":"−"});
remixEnabled.addEventListener("change",()=>{remixControls.classList.toggle("active",remixEnabled.checked);remixControls.setAttribute("aria-hidden",String(!remixEnabled.checked));mode.disabled=remixEnabled.checked});
crossfade.addEventListener("input",()=>updateFade(+crossfade.value));
autoCrossfade.addEventListener("change",()=>{autoSpeedLabel.classList.toggle("active",autoCrossfade.checked);crossfade.disabled=autoCrossfade.checked});



function getRecordingPreset(){
  return recordingRatio.value==="youtube"
    ? {width:1280,height:720,label:"YOUTUBE 16:9",name:"youtube-16x9"}
    : {width:720,height:1280,label:"TIKTOK 9:16",name:"tiktok-9x16"};
}

function getCenteredCrop(sourceWidth,sourceHeight,targetRatio){
  const sourceRatio=sourceWidth/sourceHeight;
  if(sourceRatio>targetRatio){
    const cropWidth=sourceHeight*targetRatio;
    return {sx:(sourceWidth-cropWidth)/2,sy:0,sw:cropWidth,sh:sourceHeight};
  }
  const cropHeight=sourceWidth/targetRatio;
  return {sx:0,sy:(sourceHeight-cropHeight)/2,sw:sourceWidth,sh:cropHeight};
}

function updateRecordingGuide(){
  const preset=getRecordingPreset();
  recordingGuideLabel.textContent=preset.label;
  recordingGuide.classList.toggle("hidden",!showRecordingGuide.checked);
  const margin=36;
  const availableWidth=Math.max(120,innerWidth-margin*2);
  const availableHeight=Math.max(120,innerHeight-margin*2);
  const ratio=preset.width/preset.height;
  let guideWidth=availableWidth;
  let guideHeight=guideWidth/ratio;
  if(guideHeight>availableHeight){guideHeight=availableHeight;guideWidth=guideHeight*ratio}
  recordingGuide.style.width=`${guideWidth}px`;
  recordingGuide.style.height=`${guideHeight}px`;
}

function drawRecordingFrame(){
  if(!mediaRecorder||mediaRecorder.state!=="recording")return;
  const preset=getRecordingPreset();
  const crop=getCenteredCrop(canvas.width,canvas.height,preset.width/preset.height);
  recordingCtx.drawImage(canvas,crop.sx,crop.sy,crop.sw,crop.sh,0,0,preset.width,preset.height);
  recordingDrawId=requestAnimationFrame(drawRecordingFrame);
}

function preferredRecordingMimeType(){
  const choices=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
  return choices.find(type=>MediaRecorder.isTypeSupported(type))||"";
}

function recordingAudioTracks(){
  if(recordingDestination?.stream?.getAudioTracks().length){
    return recordingDestination.stream.getAudioTracks();
  }
  if(stream?.getAudioTracks().length){
    return stream.getAudioTracks();
  }
  return [];
}

async function startRecording(){
  try{
    if(!canvas.captureStream||typeof MediaRecorder==="undefined")throw new Error("Recording is not supported in this browser. Try Chrome or Edge.");
    const preset=getRecordingPreset();
    recordingCanvas.width=preset.width;
    recordingCanvas.height=preset.height;
    const videoStream=recordingCanvas.captureStream(30);
    const combined=new MediaStream([...videoStream.getVideoTracks(),...recordingAudioTracks()]);
    const mimeType=preferredRecordingMimeType();
    mediaRecorder=new MediaRecorder(combined,mimeType?{mimeType,videoBitsPerSecond:8_000_000}:undefined);
    recordingChunks=[];
    mediaRecorder.addEventListener("dataavailable",event=>{if(event.data.size)recordingChunks.push(event.data)});
    mediaRecorder.addEventListener("stop",()=>{
      const blob=new Blob(recordingChunks,{type:mediaRecorder.mimeType||"video/webm"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      link.href=url;link.download=`opticbox-${preset.name}-${stamp}.webm`;
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      recordingStatus.textContent=`Saved ${preset.width}×${preset.height} WEBM video.`;
      mediaRecorder=null;
    });
    mediaRecorder.start(1000);
    recordingStartedAt=Date.now();
    recordingTimer.textContent="00:00";
    recordingTimerId=setInterval(()=>{
      const total=Math.floor((Date.now()-recordingStartedAt)/1000);
      recordingTimer.textContent=`${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
    },250);
    startRecordingButton.disabled=true;startRecordingButton.classList.add("recording");startRecordingButton.textContent="Recording…";
    stopRecordingButton.disabled=false;recordingRatio.disabled=true;
    recordingGuide.classList.add("recording");
    recordingStatus.textContent=`Recording ${preset.label} at ${preset.width}×${preset.height} with available audio.`;
    drawRecordingFrame();
  }catch(error){recordingStatus.textContent=error.message||"Recording could not start."}
}

function stopRecording(){
  if(!mediaRecorder||mediaRecorder.state==="inactive")return;
  cancelAnimationFrame(recordingDrawId);clearInterval(recordingTimerId);
  mediaRecorder.stop();
  startRecordingButton.disabled=false;startRecordingButton.classList.remove("recording");startRecordingButton.textContent="Start Recording";
  stopRecordingButton.disabled=true;recordingRatio.disabled=false;
  recordingGuide.classList.remove("recording");
}

async function togglePictureInPicture(){
  try{
    if(document.pictureInPictureElement){
      await document.exitPictureInPicture();
      return;
    }

    if(!document.pictureInPictureEnabled||typeof pipVideo.requestPictureInPicture!=="function"){
      throw new Error("Picture in Picture is not supported in this browser.");
    }

    if(!canvas.captureStream){
      throw new Error("Canvas streaming is not supported in this browser.");
    }

    if(!pipStream){
      pipStream=canvas.captureStream(30);
      pipVideo.srcObject=pipStream;
    }

    await pipVideo.play();
    await pipVideo.requestPictureInPicture();
  }catch(error){
    status(false,error.message||"Picture in Picture could not be opened.");
  }
}

pipButton.addEventListener("click",togglePictureInPicture);

pipVideo.addEventListener("enterpictureinpicture",()=>{
  pipButton.textContent="Close Picture in Picture";
});

pipVideo.addEventListener("leavepictureinpicture",()=>{
  pipButton.textContent="Picture in Picture";
});


startRecordingButton.addEventListener("click",startRecording);
stopRecordingButton.addEventListener("click",stopRecording);
recordingRatio.addEventListener("change",updateRecordingGuide);
showRecordingGuide.addEventListener("change",updateRecordingGuide);
addEventListener("resize",updateRecordingGuide);

startCaptureButton.addEventListener("click",startLiveCapture);
stopCaptureButton.addEventListener("click",stopLiveCapture);

imageButton.addEventListener("click",()=>imageFileInput.click());
imageDropZone.addEventListener("click",()=>imageFileInput.click());
imageDropZone.addEventListener("keydown",event=>{
  if(event.key==="Enter"||event.key===" "){
    event.preventDefault();
    imageFileInput.click();
  }
});
imageFileInput.addEventListener("change",event=>{
  loadFractalImage(event.target.files[0]);
  event.target.value="";
});
imageDropZone.addEventListener("dragover",event=>{
  event.preventDefault();
  imageDropZone.classList.add("dragging");
});
imageDropZone.addEventListener("dragleave",()=>imageDropZone.classList.remove("dragging"));
imageDropZone.addEventListener("drop",event=>{
  event.preventDefault();
  imageDropZone.classList.remove("dragging");
  loadFractalImage(event.dataTransfer.files[0]);
});
removeImageButton.addEventListener("click",()=>{
  fractalImage=null;
  imageFileName.textContent="PNG, JPG, or WEBP";
});

$("randomizeButton").addEventListener("click",()=>{if(remixEnabled.checked){remixModeA.selectedIndex=Math.floor(Math.random()*remixModeA.options.length);do{remixModeB.selectedIndex=Math.floor(Math.random()*remixModeB.options.length)}while(remixModeB.value===remixModeA.value&&remixModeB.options.length>1);crossfade.value=Math.floor(25+Math.random()*51);updateFade(+crossfade.value)}else mode.selectedIndex=Math.floor(Math.random()*mode.options.length);theme.selectedIndex=Math.floor(Math.random()*theme.options.length);sens.value=(1+Math.random()*2.4).toFixed(1);motion.value=(.5+Math.random()*1.8).toFixed(1);trails.value=(.07+Math.random()*.22).toFixed(2);glow.value=Math.floor(12+Math.random()*42);sync()});
function sync(){$("sensitivityValue").textContent=(+sens.value).toFixed(1);$("motionValue").textContent=(+motion.value).toFixed(1);$("trailsValue").textContent=(+trails.value).toFixed(2);$("glowValue").textContent=glow.value;$("symmetryValue").textContent=symmetry.value;$("fractalZoomValue").textContent=(+fractalZoom.value).toFixed(1);$("imageStrengthValue").textContent=imageStrength.value+"%";$("cropWidthValue").textContent=cropWidth.value+"%";$("cropHeightValue").textContent=cropHeight.value+"%";$("cropXValue").textContent=cropX.value+"%";$("cropYValue").textContent=cropY.value+"%";$("captureOpacityValue").textContent=captureOpacity.value+"%"}
[sens,motion,trails,glow,symmetry,fractalZoom,imageStrength,cropWidth,cropHeight,cropX,cropY,captureOpacity].forEach(i=>i.addEventListener("input",sync));sync();updateFade(+crossfade.value);updateRecordingGuide();requestAnimationFrame(render);
