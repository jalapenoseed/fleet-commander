import {BOID_DEFAULTS} from './boids.js?v=0.8.0';
import {boidsMarkup} from './boids-ui.js?v=0.8.0';
export {resetBoidsControls} from './boids-ui.js?v=0.8.0';
import {EFFECT_RANGES,effectSummary} from './fleet-effects.js?v=0.8.0';
import {PROGRAM_FIELDS} from './swarm-program.js?v=0.8.0';
export const EXTRA_EFFECT_KEYS=[...Object.keys(BOID_DEFAULTS),'phase','blend','patternSpeed','patternAmount','showSpeed','showAmount','axisX','axisY','axisZ','variance','phaseVariance','speedVariance','seed',...Array.from({length:3},(_,i)=>['field','strength','frequency','phase','blend'].map(k=>k+(i+2))).flat()];
const labels={phase:'Field phase',blend:'Field mix',patternSpeed:'Movement speed',patternAmount:'Movement amount',showSpeed:'Show speed',showAmount:'Show amount',axisX:'Field X mix',axisY:'Field Y mix',axisZ:'Field Z mix',variance:'Position spread (m)',phaseVariance:'Phase spread (rad)',speedVariance:'Speed spread (fraction)',seed:'Variation seed'};
export function extraEffectsMarkup(settings,admin=false){
 const input=(key,label=labels[key])=>{const range=EFFECT_RANGES[key]||[key==='phase'?-6.28:0,key==='phase'?6.28:1];return `<label>${label}<input ${admin?'data-admin-number':'id'}="${key}" type="number" min="${range[0]}" max="${range[1]}" step="${key==='seed'?1:.05}" value="${settings[key]}"></label>`;};
 const row=admin?'adminFleetGrid':'form-row';
 return boidsMarkup(settings,admin?'admin':'standalone')+`<p>Movement, choreography and four fields add independently. None removes only that layer. Amount zero mutes movement or choreography; field mix zero mutes a field. Apply restarts the shared clock.</p><div class="${row}">${['patternSpeed','patternAmount','showSpeed','showAmount','phase','blend'].map(k=>input(k)).join('')}</div>`+
 [2,3,4].map(slot=>`<fieldset><legend>Influence ${slot}</legend><label>Field<select ${admin?'data-admin-setting':'id'}="field${slot}">${Object.entries(PROGRAM_FIELDS).map(([k,v])=>`<option value="${k}" ${settings['field'+slot]===k?'selected':''}>${v}</option>`).join('')}</select></label><div class="${row}">${['strength','frequency','phase','blend'].map(k=>input(k+slot,k==='blend'?'Mix':k[0].toUpperCase()+k.slice(1))).join('')}</div></fieldset>`).join('')+
 `<details><summary>Axis mixing & repeatable variation</summary><p>Field axes are mixed after all four fields. Their combined displacement is limited to 32 m. Variation uses stable aircraft IDs and a seed; it never changes the fleet count. Custom layers share the three formulas below.</p><div class="${row}">${['axisX','axisY','axisZ','variance','phaseVariance','speedVariance','seed'].map(k=>input(k)).join('')}</div></details>`;
}
export {effectSummary};
