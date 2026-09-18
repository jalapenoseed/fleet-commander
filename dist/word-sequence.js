// A sequence changes targets on one continuous program clock. Aircraft IDs and
// flight bodies never change when the next word begins.
const cache=new Map();
export function sequenceWords(source){
 if(cache.has(source))return cache.get(source);
 if(typeof source!=='string'||source.length>288)throw Error('Word sequence: enter 2–16 words, one per line.');
 const words=source.split(/[\n|]/).map(s=>s.trim().toUpperCase()).filter(Boolean);
 if(words.length<2||words.length>16||words.some(w=>!/^[A-Z0-9 -]{1,16}$/.test(w)))throw Error('Word sequence: use 2–16 lines of 1–16 letters, numbers, spaces or hyphens.');
 if(cache.size>=32)cache.clear();cache.set(source,words);return words;
}
export function wordSequenceState(settings,time=0){
 const words=sequenceWords(settings.sequenceWords),hold=settings.sequenceHold,transition=settings.sequenceTransition,period=hold+transition;
 const t=Math.max(0,time-settings.countIn-settings.morph),last=words.length-1;
 if(!settings.sequenceLoop&&t>=last*period)return {words,index:last,current:words[last],next:words[last],blend:0,phase:'complete'};
 const index=Math.floor(t/period)%words.length,next=(index+1)%words.length,part=t%period;
 const progress=Math.max(0,Math.min(1,(part-hold)/transition));
 return {words,index,current:words[index],next:words[next],blend:progress*progress*(3-2*progress),phase:time<settings.countIn+settings.morph?'forming':part<hold?'holding':'transitioning'};
}
