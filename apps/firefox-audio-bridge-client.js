(()=>{
  const ENDPOINT='http://127.0.0.1:17491/status';
  const state={connected:false,level:0,bass:0,mid:0,treble:0,left:0,right:0,lastSeen:0,error:'',source:'WINDOWS DEFAULT OUTPUT'};
  let pollTimer=0, phase=0;

  function clamp(v,min=0,max=1){v=Number(v)||0;return Math.max(min,Math.min(max,v));}
  function emit(){window.dispatchEvent(new CustomEvent('opticbridgechange',{detail:{...state}}));}
  async function poll(){
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),650);
      const res=await fetch(ENDPOINT,{cache:'no-store',mode:'cors',signal:controller.signal});
      clearTimeout(timeout);
      if(!res.ok)throw Error(`Bridge HTTP ${res.status}`);
      const data=await res.json();
      state.connected=Boolean(data.connected);
      state.level=clamp(data.level);
      state.bass=clamp(data.bass);
      state.mid=clamp(data.mid);
      state.treble=clamp(data.treble);
      state.left=clamp(data.left);
      state.right=clamp(data.right);
      state.source=data.source||'WINDOWS DEFAULT OUTPUT';
      state.error=data.error||'';
      state.lastSeen=performance.now();
      emit();
    }catch(err){
      const wasConnected=state.connected;
      state.connected=false;
      state.error=err?.message||'Bridge not running';
      if(wasConnected)emit();
    }
  }
  function start(){
    if(pollTimer)return;
    poll();
    pollTimer=setInterval(poll,50);
  }
  function stop(){if(pollTimer){clearInterval(pollTimer);pollTimer=0;}}
  function reconnect(){stop();start();}

  function fillFrequency(array,sensitivity=1){
    if(!array)return;
    const b=clamp(state.bass*sensitivity,0,1.5),m=clamp(state.mid*sensitivity,0,1.5),t=clamp(state.treble*sensitivity,0,1.5),lv=clamp(state.level*sensitivity,0,1.5);
    const time=performance.now()*0.001;
    for(let i=0;i<array.length;i++){
      const x=i/Math.max(1,array.length-1);
      const low=Math.exp(-Math.pow((x-.045)/.075,2))*b;
      const mids=Math.exp(-Math.pow((x-.24)/.19,2))*m*.9;
      const highs=Math.exp(-Math.pow((x-.62)/.28,2))*t*.72;
      const ripple=(Math.sin(i*.19+time*8)+1)*.035*lv;
      array[i]=Math.round(clamp((low+mids+highs+ripple)*255,0,255));
    }
  }
  function fillFloatWave(left,right,mono){
    const n=mono?.length||left?.length||right?.length||0;if(!n)return;
    phase+=.055+state.treble*.07;
    const amp=clamp(state.level*1.65,0,.96);
    const separation=.24+(state.right-state.left)*.6;
    const wobble=state.bass*.65;
    for(let i=0;i<n;i++){
      const x=i/n*Math.PI*2;
      const carrier=Math.sin(x*(2.2+state.mid*3.8)+phase);
      const harmonic=Math.sin(x*(5.5+state.treble*7)-phase*.7)*(.12+state.treble*.28);
      const slow=Math.sin(x+phase*.25)*wobble*.22;
      const base=(carrier*.72+harmonic+slow)*amp;
      if(mono)mono[i]=base;
      if(left)left[i]=(Math.sin(x*(2.05+state.mid*3.5)+phase-separation)*.74+harmonic+slow)*amp;
      if(right)right[i]=(Math.sin(x*(2.15+state.mid*3.5)+phase+separation)*.74-harmonic*.55+slow)*amp;
    }
  }
  function fillByteWave(array){
    if(!array)return;
    const tmp=new Float32Array(array.length);fillFloatWave(null,null,tmp);
    for(let i=0;i<array.length;i++)array[i]=Math.round(128+clamp(tmp[i],-1,1)*118);
  }

  window.OpticsAudioBridge={state,start,stop,reconnect,poll,fillFrequency,fillFloatWave,fillByteWave,endpoint:ENDPOINT};
  start();
})();
