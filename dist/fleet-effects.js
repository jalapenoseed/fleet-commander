import {DIRECTOR_STYLES} from './show-motion.js?v=0.8.0';
import {BOID_DEFAULTS} from './boids.js?v=0.8.0';
// Independent, serializable motion layers shared by the range and expedition.
export const MOTION_PATTERNS={none:'None / stationary slots',hold:'Hold (legacy)',orbit:'Orbit',wave:'Wave',weave:'Weave',pulse:'Expand / contract',search:'Search sweep'};
export const SHOW_STYLES={...DIRECTOR_STYLES,none:'None',flyby:'Banked flyby',roll:'Barrel-roll ripple',flip:'Somersault ripple',dance:'Beat dance',corkscrew:'Corkscrew reveal',ribbon:'Ribbon sweep',salute:'Rise & salute'};
export const EFFECT_DEFAULTS={pattern:'none',show:'none',field:'none',strength:8,frequency:.6,phase:0,blend:1,fieldScale:20,patternSpeed:1,patternAmount:1,showSpeed:1,showAmount:1,axisX:1,axisY:1,axisZ:1,variance:0,phaseVariance:0,speedVariance:0,seed:1};
export const EFFECT_RANGES={patternSpeed:[0,3],patternAmount:[0,2],showSpeed:[0,3],showAmount:[0,2],axisX:[0,1],axisY:[0,1],axisZ:[0,1],variance:[0,6],phaseVariance:[0,6.28],speedVariance:[0,.5],seed:[1,9999]};
for(let slot=2;slot<=4;slot++)for(const [key,value,range]of [['field','none',null],['strength',8,[0,24]],['frequency',.6,[.05,3]],['phase',0,[-6.28,6.28]],['blend',1,[0,1]]]){EFFECT_DEFAULTS[key+slot]=value;if(range)EFFECT_RANGES[key+slot]=range;}
export function clearProgramEffects(settings){return {...settings,...EFFECT_DEFAULTS,...BOID_DEFAULTS,formulaX:'6 * sin(t + i)',formulaY:'4 * cos(t + i)',formulaZ:'6 * cos(t + i)',beatSync:false,offset:0,trace:false};}
export function effectSummary(s){const fields=[s.field,s.field2,s.field3,s.field4].filter(v=>v&&v!=='none');return ['Motion: '+(s.pattern==='hold'?'none':s.pattern),'Show: '+s.show,'Boids: '+(s.boids==='on'?'on':'none'),'Fields: '+(fields.join(' + ')||'none'),...(s.variance||s.phaseVariance||s.speedVariance?['Variance on · seed '+s.seed]:[])].join(' · ');}
export function seededVariation(index,seed,channel=0){let n=Math.imul(index+1,374761393)^Math.imul(seed|0,668265263)^Math.imul(channel+1,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295*2-1;}
