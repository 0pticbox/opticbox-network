"use strict";
  function invalidateRender(){
    if(renderedUrl){ URL.revokeObjectURL(renderedUrl); renderedUrl=null; }
    renderedBlob=null;
    $("#downloadBtn").disabled=true;
  }

  async function renderWav(){
    const p=readPatch();
    const main=p.length/1000;
    const delayTail = p.delayMix>0 ? Math.min(4,(p.delay/1000)*6*(.5+p.feedback/100)) : 0;
    const revTail = p.reverb>0 ? Math.min(2.4,p.reverbSize*1.65) : 0;
    const sec=clamp(main+Math.max(delayTail,revTail)+.18,.2,7.5);
    const sr=44100;
    const offline=new OfflineAudioContext(2,Math.ceil(sec*sr),sr);
    wireAudio(offline,offline.destination,p,0);
    const buffer=await offline.startRendering();
    renderedBlob=encodeWav(buffer);
    renderedUrl=URL.createObjectURL(renderedBlob);
    $("#downloadBtn").disabled=false;
    setStatus(`WAV READY — ${(renderedBlob.size/1024).toFixed(1)} KB // ${p.type}`);
  }

  function encodeWav(buffer){
    const ch=buffer.numberOfChannels, sr=buffer.sampleRate, len=buffer.length;
    const ab=new ArrayBuffer(44+len*ch*2), v=new DataView(ab); let o=0;
    const str=s=>{for(let i=0;i<s.length;i++)v.setUint8(o++,s.charCodeAt(i));};
    str("RIFF");v.setUint32(o,36+len*ch*2,true);o+=4;str("WAVE");str("fmt ");
    v.setUint32(o,16,true);o+=4;v.setUint16(o,1,true);o+=2;v.setUint16(o,ch,true);o+=2;
    v.setUint32(o,sr,true);o+=4;v.setUint32(o,sr*ch*2,true);o+=4;v.setUint16(o,ch*2,true);o+=2;
    v.setUint16(o,16,true);o+=2;str("data");v.setUint32(o,len*ch*2,true);o+=4;
    const chans=[];for(let c=0;c<ch;c++)chans.push(buffer.getChannelData(c));
    for(let i=0;i<len;i++)for(let c=0;c<ch;c++){
      const x=clamp(chans[c][i],-1,1);
      v.setInt16(o,x<0?x*32768:x*32767,true);o+=2;
    }
    return new Blob([ab],{type:"audio/wav"});
  }

  function safeName(s){ return s.replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,""); }
  function filename(){ return `BLASTER_BOX_${safeName(els.type.value)}_${Date.now()}.wav`; }

  $("#downloadBtn").addEventListener("click",async()=>{
    if(!renderedBlob) await renderWav();
    const a=document.createElement("a");
    a.href=renderedUrl; a.download=filename(); a.click();
  });

