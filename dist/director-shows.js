import {commanderPreset} from './commander-presets.js?v=0.8.0';
import {validateCommanderFleet} from './fleet-commander-core.js?v=0.8.0';
export const DIRECTOR_SHOWS={
 fireworks:{name:'Firework ballet',description:'Three blossoms breathe, spiral into a galaxy, then open into a sky-wide finale.',duration:96,scenery:'coast',sky:'night',acts:[[0,'fireworks','Opening blossoms'],[32,'galaxy','Spiral interlude'],[64,'fireworks','Grand finale']]},
 halftime:{name:'Halftime spectacular',description:'A stadium wave, four crossing ribbons, a rotating galaxy and a firework finish.',duration:128,scenery:'stadium',sky:'dusk',acts:[[0,'stadium','The crowd wave'],[32,'aurora','Ribbon dance'],[64,'galaxy','Galaxy turn'],[96,'fireworks','Finale']]},
 aurora:{name:'Northern ribbons',description:'Four flowing curtains of light weave across the mountains, then gather into a spiral.',duration:96,scenery:'alpine',sky:'night',acts:[[0,'aurora','Curtains of light'],[48,'galaxy','Gathering stars']]},
 galaxy:{name:'City of stars',description:'A slow orbital dance above the skyline, opening into a rolling light wave.',duration:96,scenery:'city',sky:'sunset',acts:[[0,'galaxy','Orbital waltz'],[48,'stadium','Skyline wave']]}
};
export function directorShow(config,key){
 const show=DIRECTOR_SHOWS[key];if(!show)throw Error('Choose a show.');if(!config.roster.length)throw Error('Build at least one drone before starting a show.');
 const next=commanderPreset(config,'none');next.program.mode='script';Object.assign(next.program.settings,{origin:'fixed',height:65,moveX:0,moveZ:-30,offset:0,countIn:0,morph:8,show:show.acts[0][1]});
 next.program.source=['select all','assign formation',...show.acts.flatMap(([at,style],i)=>[...(i?['wait '+(at-show.acts[i-1][0])]:[]),'show '+style]),'repeat '+show.duration].join('\n');
 return validateCommanderFleet(next);
}
export function showAct(key,time){const s=DIRECTOR_SHOWS[key];if(!s)return null;const phase=Math.max(0,time)%s.duration;return {name:s.acts.filter(a=>a[0]<=phase).at(-1)[2],phase,duration:s.duration};}
