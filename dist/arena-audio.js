// All activation/resume calls begin inside a user gesture. No autoplay or microphone.
export class ArenaAudio{
 constructor(){this.enabled=false;this.volume=.55;this.mix='arena';this.lastCombat=0;this.heardThunder=new Set();this.voices=new Set();this.motorVoices=[];this.testUntil=0;this.level=0;}
 get state(){return !this.enabled?'off':this.context?.state||'suspended';}
 async enable(){
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw Error('Game audio is unavailable in this browser.');
  try{if(globalThis.navigator?.audioSession)navigator.audioSession.type='playback';}catch{}
  if(!this.context||this.context.state==='closed'){
   const c=this.context=new Audio({latencyHint:'interactive'});this.motorVoices=[];this.voices.clear();
   this.master=c.createGain();this.master.gain.value=0;this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-10;this.limiter.knee.value=16;this.limiter.ratio.value=5;this.limiter.attack.value=.006;this.limiter.release.value=.18;
   this.meter=c.createAnalyser();this.meter.fftSize=256;this.samples=new Float32Array(256);this.master.connect(this.limiter);this.limiter.connect(this.meter);this.meter.connect(c.destination);
   this.noise=c.createBuffer(1,c.sampleRate*3,c.sampleRate);const a=this.noise.getChannelData(0);let smooth=0;for(let i=0;i<a.length;i++){smooth=smooth*.65+(Math.random()*2-1)*.35;a[i]=smooth;}
   for(let i=0;i<6;i++){
    const oscillator=c.createOscillator(),harmonic=c.createOscillator(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=this.makePan();oscillator.type='sawtooth';harmonic.type='sine';filter.type='lowpass';filter.frequency.value=1700;gain.gain.value=0;
    oscillator.connect(filter);harmonic.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.master);oscillator.start();harmonic.start();this.motorVoices.push({oscillator,harmonic,filter,gain,pan});
   }
  }
  this.enabled=true;const resumed=this.context.resume(); // Before any await: mobile gesture activation.
  await resumed;if(this.context.state!=='running')throw Error('Audio is interrupted. Tap Resume sound once the interruption ends.');
 }
 makePan(){const c=this.context;return c.createStereoPanner?c.createStereoPanner():c.createGain();}
 captureStream(){if(!this.context?.createMediaStreamDestination||!this.limiter)return null;if(!this.capture){this.capture=this.context.createMediaStreamDestination();this.limiter.connect(this.capture);}return this.capture.stream;}
 pan(node,value){node.pan?.setTargetAtTime(Math.max(-.8,Math.min(.8,value)),this.context.currentTime,.06);}
 mute(){this.enabled=false;this.silence();this.context?.suspend().catch(()=>{});try{if(globalThis.navigator?.audioSession)navigator.audioSession.type='auto';}catch{}}
 silence(){if(!this.context)return;this.testUntil=0;this.master.gain.setTargetAtTime(0,this.context.currentTime,.015);for(const v of this.motorVoices)v.gain.gain.setTargetAtTime(0,this.context.currentTime,.015);for(const v of this.voices){try{v.stop();}catch{}}this.voices.clear();this.level=0;}
 async test(){await this.enable();this.silence();if(this.volume===0)this.volume=.55;this.testUntil=this.context.currentTime+1;this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.015);this.tone(660,.25,.24);this.tone(880,.35,.24,.34);}
 tone(frequency,duration,gainValue,delay=0){
  if(this.voices.size>=20)return;const c=this.context,at=c.currentTime+delay,source=c.createOscillator(),gain=c.createGain();source.type='sine';source.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(gainValue,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+duration);source.connect(gain);gain.connect(this.master);source.start(at);source.stop(at+duration);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};
 }
 attenuation(distance){return this.mix==='arena'?Math.max(.25,1/(1+distance*.006)):1/(1+distance*.025);}
 event(event,camera){
  if(this.state!=='running'||this.voices.size>=20)return;const c=this.context,now=c.currentTime,distance=Math.hypot(event.pos[0]-camera.x,event.pos[1]-camera.y,event.pos[2]-camera.z),near=this.attenuation(distance),thunder=event.type==='thunder';
  if(event.type==='drop'){this.tone(470,.14,.16*near);return;}
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=this.makePan();source.buffer=this.noise;filter.type='lowpass';filter.frequency.value=thunder?750:event.type==='explosion'?1300:2300;
  const duration=thunder?2.8:event.type==='explosion'?1.1:.25,power=(thunder?1.1:event.type==='explosion'?1.5:.65)*near;gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(power,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+duration);this.pan(pan,(event.pos[0]-camera.x)/150);
  source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.master);source.start(now);source.stop(now+duration);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
 }
 update(sim,weather,camera={x:0,y:35,z:210}){
  const events=sim.combat?.events||[],thunder=weather?.events||[],liveThunder=new Set(thunder.map(e=>e.id));for(const id of this.heardThunder)if(!liveThunder.has(id))this.heardThunder.delete(id);
  const c=this.context,testing=this.enabled&&c?.currentTime<this.testUntil;
  if(!this.enabled||!sim.running||this.state!=='running'){
   this.lastCombat=events.at(-1)?.id||this.lastCombat;for(const e of thunder)if(!this.enabled||e.time<=weather.time)this.heardThunder.add(e.id);
   if(c){this.master.gain.setTargetAtTime(testing?this.volume:0,c.currentTime,.015);for(const v of this.motorVoices)v.gain.gain.setTargetAtTime(0,c.currentTime,.04);}this.readLevel();return;
  }
  const now=c.currentTime;this.master.gain.setTargetAtTime(this.volume,now,.04);
  // Keep only six nearest voices without sorting the entire 10k show roster.
  const nearby=[];for(const d of sim.drones){if(!['FLY','RETURN','LAND'].includes(d.mode))continue;const item={d,distance:Math.hypot(d.pos[0]-camera.x,d.pos[1]-camera.y,d.pos[2]-camera.z)};if(nearby.length===6&&item.distance>=nearby[5].distance)continue;nearby.push(item);nearby.sort((a,b)=>a.distance-b.distance);if(nearby.length>6)nearby.pop();}
  this.motorVoices.forEach((v,i)=>{const item=nearby[i],speed=item?Math.hypot(...item.d.velocity):0;v.gain.gain.setTargetAtTime(item ? .09*this.attenuation(item.distance) : 0,now,.12);v.oscillator.frequency.setTargetAtTime(165+speed*4+i*9,now,.08);v.harmonic.frequency.setTargetAtTime(330+speed*8+i*17,now,.08);this.pan(v.pan,item?(item.d.pos[0]-camera.x)/100:0);});
  for(const e of events)if(e.id>this.lastCombat){this.lastCombat=e.id;this.event(e,camera);}
  for(const e of thunder)if(!this.heardThunder.has(e.id)&&e.time<=weather.time){this.heardThunder.add(e.id);this.event(e,camera);}
  this.readLevel();
 }
 readLevel(){if(this.state!=='running'||!this.meter){this.level=0;return;}this.meter.getFloatTimeDomainData(this.samples);this.level=Math.min(1,Math.sqrt(this.samples.reduce((sum,x)=>sum+x*x,0)/this.samples.length)*5);}
 dispose(){this.silence();for(const v of this.motorVoices){try{v.oscillator.stop();v.harmonic.stop();}catch{}}this.context?.close().catch(()=>{});this.enabled=false;}
}
