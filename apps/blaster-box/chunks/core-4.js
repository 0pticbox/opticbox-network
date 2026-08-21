"use strict";
  // ---------- optional custom wavetable ----------
  const drop=$("#dropZone"), fileInput=$("#fileInput");
  drop.addEventListener("click",()=>fileInput.click());
  drop.addEventListener("keydown",e=>{
    if(e.key==="Enter"||e.key===" "){e.preventDefault();fileInput.click();}
  });
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{
    e.preventDefault(); drop.classList.add("drag");
  }));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{
    e.preventDefault(); drop.classList.remove("drag");
  }));
  drop.addEventListener("drop",e=>{
    const f=e.dataTransfer.files&&e.dataTransfer.files[0];
    if(f) loadCustomFile(f);
  });
  fileInput.addEventListener("change",()=>{
    if(fileInput.files[0]) loadCustomFile(fileInput.files[0]);
  });

  function ascii(u,off,n){
    let s=""; for(let i=0;i<n && off+i<u.length;i++) s+=String.fromCharCode(u[off+i]); return s;
  }

  function fxpInfo(ab){
    const u=new Uint8Array(ab);
    if(u.length<12) return {isFxp:false,magic:""};
    const ccnk=ascii(u,0,4), magic=ascii(u,8,4);
    return {isFxp:ccnk==="CcnK",magic};
  }

  function findEmbeddedWav(ab){
    const u=new Uint8Array(ab), max=u.length-12;
    for(let i=0;i<max;i++){
      if(u[i]===82&&u[i+1]===73&&u[i+2]===70&&u[i+3]===70 &&
         u[i+8]===87&&u[i+9]===65&&u[i+10]===86&&u[i+11]===69){
        if(i+12>u.length) continue;
        const dv=new DataView(ab,i);
        const riffSize=dv.getUint32(4,true)+8;
        if(riffSize>=44 && i+riffSize<=u.length) return ab.slice(i,i+riffSize);
      }
    }
    return null;
  }

  async function loadCustomFile(file){
    const lower=file.name.toLowerCase();
    setStatus("READING "+file.name.toUpperCase()+"...");
    try{
      const ab=await file.arrayBuffer();
      let wavAB=ab, source="WAV", extra="";
      if(lower.endsWith(".fxp")){
        source="FXP";
        const info=fxpInfo(ab);
        if(!info.isFxp) throw new Error("This file does not look like a valid VST2 FXP container.");
        extra=` // FXP ${info.magic||"CHUNK"}`;
        wavAB=findEmbeddedWav(ab);
        if(!wavAB){
          customWT=null;
          els.wtPos.disabled=true; els.wtMove.disabled=true; els.lock.disabled=true; els.lock.checked=false;
          $("#fileMeta").textContent =
            `FXP CONTAINER FOUND${extra}, BUT NO EMBEDDED RIFF/WAVE BLOCK WAS EXTRACTABLE. `+
            `THE SERUM PRESET MAY REFERENCE A FACTORY/EXTERNAL WAVETABLE OR STORE IT IN A CHUNK FORMAT THIS EXPERIMENTAL IMPORTER DOES NOT YET DECODE.`;
          setStatus("FXP READ — NO EXTRACTABLE WAVETABLE FOUND.");
          drawScope(); return;
        }
      }else if(!lower.endsWith(".wav")){
        throw new Error("Please use a .wav or .fxp file.");
      }

      const ctx=getAudioContext();
      const decoded=await ctx.decodeAudioData(wavAB.slice(0));
      const data=decoded.getChannelData(0);
      const frames=splitIntoSerumFrames(data);
      customWT={name:file.name,frames,source};

      els.wtPos.disabled=frames.length<=1;
      els.wtMove.disabled=frames.length<=1;
      els.lock.disabled=false;
      els.wtPos.value=0; els.wtMove.value=frames.length>1?80:0;
      els.osc1.value="custom";
      $("#customDetails").open=true;
      $("#fileMeta").textContent =
        `${file.name} // ${source}${extra} // ${frames.length} FRAME${frames.length===1?"":"S"} // ${frames[0].length} SAMPLES PER FRAME`;
      setStatus(`CUSTOM WAVETABLE LOADED — ${frames.length} FRAME${frames.length===1?"":"S"}.`);
      updateAll();
    }catch(err){
      console.error(err);
      $("#fileMeta").textContent="IMPORT FAILED: "+err.message;
      setStatus("WAVETABLE IMPORT FAILED.");
    }
  }

  function splitIntoSerumFrames(data){
    const frameSize=2048;
    if(data.length>=frameSize && data.length%frameSize===0){
      const count=Math.min(256,Math.floor(data.length/frameSize));
      const frames=[];
      for(let i=0;i<count;i++) frames.push(normalizeCycle(data.slice(i*frameSize,(i+1)*frameSize)));
      return frames;
    }
    if(data.length>frameSize*256){
      const trimmed=data.slice(0,frameSize*256), frames=[];
      for(let i=0;i<256;i++) frames.push(normalizeCycle(trimmed.slice(i*frameSize,(i+1)*frameSize)));
      return frames;
    }
    return [normalizeCycle(resample(data,frameSize))];
  }

  function normalizeCycle(arr){
    const out=new Float32Array(arr.length); let peak=0,mean=0;
    for(let i=0;i<arr.length;i++) mean+=arr[i];
    mean/=Math.max(1,arr.length);
    for(let i=0;i<arr.length;i++){out[i]=arr[i]-mean;peak=Math.max(peak,Math.abs(out[i]));}
    if(peak>.00001) for(let i=0;i<out.length;i++) out[i]/=peak;
    return out;
  }

  function resample(src,n){
    const out=new Float32Array(n);
    if(!src.length) return out;
    for(let i=0;i<n;i++){
      const x=i*(src.length-1)/Math.max(1,n-1);
      const a=Math.floor(x), b=Math.min(src.length-1,a+1), f=x-a;
      out[i]=src[a]*(1-f)+src[b]*f;
    }
    return out;
  }

