(()=>{
  const ENDPOINT='http://127.0.0.1:17491/status';
  const state={connected:false,connecting:false,level:0,bass:0,mid:0,treble:0,left:0,right:0,lastSeen:0,error:'',source:'WINDOWS DEFAULT OUTPUT',phase:'idle'};
  let pollTimer=0, phase=0, failures=0, generation=0;

  function clamp(v,min=0,max=1){v=Number(v)||0;return Math.max(min,Math.min(max,v));}
  function emit(){window.dispatchEvent(new CustomEvent('opticbridgechange',{detail:{...state}}));}
  function schedule(ms,token){clearTimeout(pollTimer);pollTimer=setTimeout(()=>poll(token),ms);}

  async function requestStatus(token){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),1800);
    try{
      const res=await fetch(ENDPOINT,{cache:'no-store',mode:'cors',signal:controller.signal});
      if(!res.ok)throw Error(`Bridge HTTP ${res.status}`);
      return await res.json();
    }finally{clearTimeout(timeout);}
  }

  function apply(data){
    state.connected=Boolean(data.connected);
    state.connecting=false;
    state.level=clamp(data.level);state.bass=clamp(data.bass);state.mid=clamp(data.mid);state.treble=clamp(data.treble);
    state.left=clamp(data.left);state.right=clamp(data.right);
    state.source=data.source||'WINDOWS DEFAULT OUTPUT';state.error=data.error||'';
    state.lastSeen=performance.now();state.phase=state.connected?'connected':'bridge-error';
    failures=0;emit();
  }

  async function poll(token){
    if(token!==generation||state.phase==='idle'||state.phase==='blocked')return;
    try{
      const data=await requestStatus(token);
      if(token!==generation)return;
      apply(data);
      schedule(state.connected?120:800,token);
    }catch(err){
      if(token!==generation)return;
      failures++;
      state.connected=false;state.connecting=false;state.error=err?.message||'Bridge connection blocked';
      // Most Firefox failures here are Local Network Access / Device apps & services permission.
      // Do NOT hammer localhost: repeated requests can make Firefox repeat/flicker its permission prompt.
      if(failures>=1){state.phase='blocked';clearTimeout(pollTimer);pollTimer=0;}
      emit();
    }
  }

  function connect(){
    generation++;
    clearTimeout(pollTimer);pollTimer=0;failures=0;
    state.connecting=true;state.connected=false;state.error='';state.phase='connecting';emit();
    poll(generation);
  }
  function disconnect(){
    generation++;
    clearTimeout(pollTimer);pollTimer=0;
    state.connected=false;state.connecting=false;state.phase='idle';state.error='';emit();
  }
  function reconnect(){connect();}

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
    const amp=clamp(state.level*1.65,0,.96),separation=.24+(state.right-state.left)*.6,wobble=state.bass*.65;
    for(let i=0;i<n;i++){
      const x=i/n*Math.PI*2,carrier=Math.sin(x*(2.2+state.mid*3.8)+phase),harmonic=Math.sin(x*(5.5+state.treble*7)-phase*.7)*(.12+state.treble*.28),slow=Math.sin(x+phase*.25)*wobble*.22,base=(carrier*.72+harmonic+slow)*amp;
      if(mono)mono[i]=base;
      if(left)left[i]=(Math.sin(x*(2.05+state.mid*3.5)+phase-separation)*.74+harmonic+slow)*amp;
      if(right)right[i]=(Math.sin(x*(2.15+state.mid*3.5)+phase+separation)*.74-harmonic*.55+slow)*amp;
    }
  }
  function fillByteWave(array){if(!array)return;const tmp=new Float32Array(array.length);fillFloatWave(null,null,tmp);for(let i=0;i<array.length;i++)array[i]=Math.round(128+clamp(tmp[i],-1,1)*118);}

  window.OpticsAudioBridge={state,connect,disconnect,reconnect,fillFrequency,fillFloatWave,fillByteWave,endpoint:ENDPOINT};
  // IMPORTANT: no automatic localhost polling. Firefox 153+ asks permission for access to
  // local device apps/services. A user click starts ONE request so the permission prompt stays stable.
  emit();
})();
