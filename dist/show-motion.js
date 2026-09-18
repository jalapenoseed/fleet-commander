// Choreography produces targets for the existing flight simulation: no particles,
// teleporting bodies or replacement fleets. Coordinates are metres, before anchor.
export const DIRECTOR_STYLES={fireworks:'Firework blossoms',stadium:'Halftime waves',aurora:'Aurora ribbons',galaxy:'Galaxy spiral'};
export function showPosition(style,i,n,time){
 const u=(i+.5)/Math.max(1,n),a=i*2.399963229728653,t=time,r=Math.min(165,Math.max(32,Math.sqrt(n)*2.25));
 if(style==='fireworks'){
  const cluster=i%3,k=Math.floor(i/3),count=Math.ceil((n-cluster)/3),v=(k+.5)/Math.max(1,count),y=1-2*v,rad=Math.sqrt(Math.max(0,1-y*y)),q=t*.24-cluster*2.094;
  const bloom=.5+.5*Math.sin(q),radius=r*(.22+.48*bloom),angle=k*2.3999632297+t*.035;
  return [(cluster-1)*r*.95+Math.cos(angle)*rad*radius,35+r*.32+Math.sin(q)*15+y*radius,Math.sin(angle)*rad*radius];
 }
 if(style==='stadium'){
  const cols=Math.ceil(Math.sqrt(n)*1.8),rows=Math.ceil(n/cols),x=((i%cols)/Math.max(1,cols-1)-.5)*r*3,z=(Math.floor(i/cols)/Math.max(1,rows-1)-.5)*r*1.4;
  return [x,18+Math.sin(x/r*2.5-t*.65)*18+Math.cos(z/r*3+t*.35)*8,z];
 }
 if(style==='aurora'){
  const ribbon=i%4,k=Math.floor(i/4),count=Math.ceil((n-ribbon)/4),v=(k+.5)/Math.max(1,count),x=(v-.5)*r*3,q=v*Math.PI*3-t*.4+ribbon*.8;
  return [x,30+Math.sin(q)*25+(ribbon-1.5)*12,Math.cos(q)*r*.32+(ribbon-1.5)*r*.3];
 }
 if(style==='galaxy'){
  const radius=r*Math.sqrt(u),angle=a+t*(.1+.08*(1-u));return [Math.cos(angle)*radius,20+Math.sin(angle*2+t*.3)*12+u*25,Math.sin(angle)*radius];
 }
 return null;
}
