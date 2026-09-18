// Stable instance keys preserve the original four aircraft and their saved jobs.
export const FRAME_TYPES=['scout','cargo','engineer','relay'];
export const STARTER_AIRCRAFT=['scout','scout-02','scout-03','scout-04','relay','relay-02'];
export const EXTRA_AIRCRAFT=['scout-02','scout-03','scout-04','relay-02'];
export const aircraftType=id=>typeof id!=='string'?id:id.startsWith('scout-')?'scout':id.startsWith('relay-')?'relay':id;
export const aircraftCode=id=>(aircraftType(id)==='engineer'?'UTILITY':aircraftType(id).toUpperCase())+'-'+(id.split('-')[1]||'01');
