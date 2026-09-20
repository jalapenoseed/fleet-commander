#!/usr/bin/env python3
"""Derive distance meshes from approved pack geometry, per material and normal region.
Requires numpy. Deterministic vertex clustering; never generates replacement shapes.
"""
import gzip, struct, json, importlib.util
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source',ROOT/'Tools/Generate-DroneModels.py')
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)

def read(path):
    raw=gzip.decompress(path.read_bytes());assert raw[:4]==b'FCM1';count=struct.unpack_from('<i',raw,4)[0];off=8;parts=[]
    for _ in range(count):
        n=struct.unpack_from('<i',raw,off)[0];off+=4;name=raw[off:off+n].decode();off+=n
        vc,ic=struct.unpack_from('<ii',raw,off);off+=8
        verts=np.frombuffer(raw,dtype='<f4',count=vc*8,offset=off).reshape(-1,8).copy();off+=vc*32
        tri=np.frombuffer(raw,dtype='<i4',count=ic,offset=off).reshape(-1,3).copy();off+=ic*4
        parts.append((name,verts,tri))
    return parts

def simplify(parts,span,cells,uvcells):
    result=[]
    for name,v,t in parts:
        # Preserve hard edges and texture islands instead of mixing normals/materials.
        key=np.concatenate((np.floor(v[:,:3]/(span/cells)),np.round(v[:,3:6]*(2 if uvcells==16 else 0)),np.zeros((len(v),0))),axis=1).astype(np.int32)
        unique,inv=np.unique(key,axis=0,return_inverse=True);n=len(unique)
        accum=np.zeros((n,8),dtype=np.float64);np.add.at(accum,inv,v);accum/=np.bincount(inv)[:,None]
        lengths=np.linalg.norm(accum[:,3:6],axis=1);accum[:,3:6]/=np.maximum(lengths,1e-9)[:,None]
        mapped=inv[t];keep=(mapped[:,0]!=mapped[:,1])&(mapped[:,0]!=mapped[:,2])&(mapped[:,1]!=mapped[:,2]);mapped=mapped[keep]
        if not len(mapped):
            # Keep small lenses, LEDs and labels; a surface may not disappear at distance.
            accum=v
            if uvcells==4:
                # At sub-7-pixel size a collapsed surface retains its largest source
                # triangle, not an entire high-resolution surface that would defeat LOD.
                area=np.linalg.norm(np.cross(v[t[:,1],:3]-v[t[:,0],:3],v[t[:,2],:3]-v[t[:,0],:3]),axis=1)
                mapped=t[np.argmax(area):np.argmax(area)+1]
            else:mapped=t
        else:
            _,ix=np.unique(np.sort(mapped,axis=1),axis=0,return_index=True);mapped=mapped[np.sort(ix)]
        used,remap=np.unique(mapped,return_inverse=True);accum=accum[used];mapped=remap.reshape(-1,3)
        result.append(dict(surface=name,positions=accum[:,:3],normals=accum[:,3:6],uv=accum[:,6:8],indices=mapped.ravel()))
    return result

def main():
    manifest_path=ROOT/'Tools/DroneModels.manifest.json';manifest=json.loads(manifest_path.read_text());manifest['models']=[r for r in manifest['models'] if '_LOD' not in r['file'] and '_Far' not in r['file']]
    for name in ['Scout','Relay','Cargo','Utility']:
        path=ROOT/'Assets/FleetCommander/Resources/DroneModels'/f'{name}.fleetmesh';parts=read(path)
        positions=np.concatenate([v[:,:3] for _,v,_ in parts]);span=float(np.max(np.ptp(positions,axis=0)))
        for suffix,target,start in [('_LOD',24000,70),('_Far',2000,24)]:
            cells=start
            for attempt in range(9):
                objects=simplify(parts,span,cells,16 if suffix=='_LOD' else 4);count=sum(len(o['indices'])//3 for o in objects)
                if count<=target or cells<=(18 if suffix=='_LOD' else 9):break
                cells*=.78
            out=path.with_name(name+suffix+'.fleetmesh');source.write_fleetmesh(out,objects)
            record=dict(file=str(out.relative_to(ROOT)),triangles=count,bytes=out.stat().st_size,source=path.name,method='material/normal-aware vertex clustering',boundsXYZ=np.ptp(positions,axis=0).tolist())
            manifest['models'].append(record);print(name+suffix,count,'triangles',out.stat().st_size,'bytes')
    manifest['provenance']='All three distance levels come from the approved Blender reference pack02. Full meshes preserve original geometry; distance meshes cluster original vertices per material and normal region. No proxy aircraft or flattened silhouette materials.'
    manifest['lodGenerator']='unity/Tools/Derive-DroneLODs.py (numpy)';manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__':main()
