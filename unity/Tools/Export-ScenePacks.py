"""Run in Blender 4.4 with --background --factory-startup --disable-autoexec --python.
Read-only conversion of the user's authored GRIDRUNNER packs; bake evaluated geometry,
retain PBR colors/textures, combine by material and export compressed FCP1 runtime assets.
"""
import bpy, gzip, json, math, struct, hashlib
from pathlib import Path
from mathutils import Vector, Matrix
OUT=Path(r'D:\FleetCommander-SceneExports');OUT.mkdir(exist_ok=True)
TEX=OUT/'Textures';TEX.mkdir(exist_ok=True)
SOURCES=[(r'C:\Users\ty\Desktop\FleetCommanderAssets\GRIDRUNNER-Field-Camp-Pack-02.blend','camp'),(r'C:\Users\ty\Documents\GRIDRUNNER_Field_Ops_Pack_01\GRIDRUNNER_Field_Ops_Pack_01.blend','ops'),(r'C:\Users\ty\GRIDRUNNER-Architecture-Pack-05\GRIDRUNNER-Architecture-Pack-05.blend','architecture')]
report=[]
def material(m):
    p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if m and m.use_nodes else None
    color=list(p.inputs['Base Color'].default_value) if p else list(m.diffuse_color) if m else [.5,.5,.5,1]
    out={'name':m.name if m else 'Default','color':color,'metal':float(p.inputs['Metallic'].default_value) if p else 0,'smooth':1-float(p.inputs['Roughness'].default_value) if p else .3,'texture':''}
    if p and p.inputs['Base Color'].is_linked:
        n=p.inputs['Base Color'].links[0].from_node
        if n.type=='TEX_IMAGE' and n.image and n.image.size[0]>0:
            key=hashlib.sha1(n.image.name.encode()).hexdigest()[:12];path=TEX/(key+'.png')
            if not path.exists():n.image.save_render(str(path),scene=bpy.context.scene)
            out['texture']=key
    return out
for path,pack in SOURCES:
    bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
    roots=[o for o in bpy.context.scene.objects if o.parent is None and o.type=='EMPTY' and (o.get('asset_id') or o.name.endswith('_ROOT')) and not o.name.startswith('PREVIEW')]
    deps=bpy.context.evaluated_depsgraph_get()
    for root in roots:
        name=root.get('asset_id',root.name.removesuffix('_ROOT'));buckets={};inv=root.matrix_world.inverted()
        for obj in root.children_recursive:
            if obj.type not in ('MESH','CURVE','FONT'):continue
            if obj.name.startswith('PREVIEW') or obj.hide_render:continue
            evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
            if not mesh:continue
            mesh.calc_loop_triangles();matrix=inv@obj.matrix_world;normal=matrix.to_3x3().inverted().transposed();uvs=mesh.uv_layers.active
            for tri in mesh.loop_triangles:
                m=mesh.materials[tri.material_index] if tri.material_index<len(mesh.materials) else None
                key=m.name if m else 'Default'
                if key not in buckets:buckets[key]=[material(m),[],[]]
                meta,verts,indices=buckets[key]
                for loop in reversed(tri.loops):
                    v=matrix@mesh.vertices[mesh.loops[loop].vertex_index].co;n=normal@mesh.corner_normals[loop].vector;n.normalize();uv=uvs.data[loop].uv if uvs else Vector((0,0))
                    indices.append(len(verts));verts.append((v.x,v.z,v.y,n.x,n.z,n.y,uv.x,uv.y))
            evaluated.to_mesh_clear()
        if not buckets:continue
        dst=OUT/(name+'.fleetprop')
        with gzip.open(dst,'wb',compresslevel=9) as f:
            f.write(b'FCP1');f.write(struct.pack('<I',len(buckets)))
            for meta,verts,indices in buckets.values():
                header=json.dumps(meta).encode();f.write(struct.pack('<I',len(header)));f.write(header);f.write(struct.pack('<II',len(verts),len(indices)))
                for v in verts:f.write(struct.pack('<8f',*v))
                f.write(struct.pack('<'+'I'*len(indices),*indices))
        report.append({'name':name,'pack':pack,'source':path,'triangles':sum(len(b[2])//3 for b in buckets.values()),'materials':len(buckets),'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
        print('EXPORTED',name,report[-1]['triangles'],flush=True)
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('COMPLETE',len(report),flush=True)
