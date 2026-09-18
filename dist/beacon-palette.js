// Eight identification colors and a neutral white. Shared by Commander and field lamps.
export const BEACON_PALETTE=[
 {id:'red',name:'Red',hex:'#ff6767'},
 {id:'orange',name:'Orange',hex:'#ff9b4e'},
 {id:'amber',name:'Amber',hex:'#ffda55'},
 {id:'lime',name:'Lime',hex:'#a9ed62'},
 {id:'cyan',name:'Cyan',hex:'#61e7ed'},
 {id:'blue',name:'Blue',hex:'#70a9ff'},
 {id:'violet',name:'Violet',hex:'#b4a0ff'},
 {id:'pink',name:'Pink',hex:'#ff8dc9'},
 {id:'white',name:'White',hex:'#f5fff8'}
];
export const beaconColor=id=>BEACON_PALETTE.find(color=>color.id===id)||BEACON_PALETTE[8];
