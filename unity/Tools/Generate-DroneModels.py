#!/usr/bin/env python3
"""Port existing approved Fleet Commander GLB models and generate small LOD meshes.

Coordinates: visual meters, +Y up, +Z nose. Each semantic surface is an imported mesh.
The runtime supplies materials from the separately preserved original PBR textures.
Detailed meshes come from the repository's existing browser asset pack, retaining
its original geometry, UVs, normals and material surfaces. LODs are original
project-authored geometric approximations. No external dependency is required.
"""

import gzip
import json
import math
from pathlib import Path
import struct
import uuid


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Assets/FleetCommander/Resources/DroneModels"
SURFACES = ("Panel", "Frame", "Metal", "Rubber", "Glass", "Prop", "Accent", "Emission")
SOURCE_SURFACES = {
    "GR_01_painted_alum": "Panel", "GR_05_rubber": "Rubber",
    "GR_Paint_Reference_OffWhite": "OffWhite", "GR_03_black_anodized": "Anodized",
    "GR_07_galvanized": "Galvanized", "GR_Optical_Interior": "Optical",
    "GR_Marking_Graphite": "MarkingDark", "GR_02_machined_alum": "Metal",
    "GR_Marking_WarmWhite": "MarkingLight", "GR_Utility_LED_Cyan": "Emission",
    "GR_04_weave": "Carbon", "GR_06_aged_copper": "Copper",
    "GR_Optic_ClearCoated_Lens": "Glass", "GR_trim": "Trim",
    "GR_Paint_Safety_Ochre": "Accent",
}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(a, s):
    return tuple(x * s for x in a)


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    d = math.sqrt(sum(a*a for a in v))
    return mul(v, 1/d) if d > 1e-10 else (0, 1, 0)


class Mesh:
    def __init__(self):
        self.parts = {name: [] for name in SURFACES}

    def face(self, surface, vertices):
        # Deliberately split faces for crisp carbon plates / industrial machined edges.
        for i in range(1, len(vertices)-1):
            triangle = [vertices[0], vertices[i], vertices[i+1]]
            if sum(v*v for v in cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]))) > 1e-16:
                self.parts[surface].append(triangle)

    def box(self, surface, center, size, yaw=0):
        c, s = math.cos(yaw), math.sin(yaw)
        def point(x, y, z):
            return add(center, (c*x+s*z, y, -s*x+c*z))
        x, y, z = (v/2 for v in size)
        p = [point(a*x, b*y, d*z) for a, b, d in
             [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
        for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
            self.face(surface, [p[i] for i in reversed(f)])

    def bevel(self, surface, center, size, chamfer=0.025):
        x, h, z = (v/2 for v in size)
        b = min(chamfer, x*.4, h*.7, z*.4)
        outline = [(-x+b,-z),(x-b,-z),(x,-z+b),(x,z-b),(x-b,z),(-x+b,z),(-x,z-b),(-x,-z+b)]
        rings = []
        for y, inset in [(-h,b),(-h+b,0),(h-b,0),(h,b)]:
            rings.append([add(center,(a*(x-inset)/x,y,c*(z-inset)/z)) for a,c in outline])
        self.face(surface,rings[0])
        self.face(surface,list(reversed(rings[-1])))
        for ra,rb in zip(rings,rings[1:]):
            for j in range(8):
                self.face(surface,[rb[j],rb[(j+1)%8],ra[(j+1)%8],ra[j]])

    def cylinder(self, surface, center, radius, height, segments=12, axis=(0,1,0), end_radius=None):
        axis=unit(axis)
        u=unit(cross(axis, (1,0,0) if abs(axis[0]) < .8 else (0,0,1)))
        v=cross(axis,u)
        end_radius=radius if end_radius is None else end_radius
        rings=[]
        for y,r in [(-height/2,radius),(height/2,end_radius)]:
            rings.append([add(center,add(mul(axis,y),add(mul(u,math.cos(2*math.pi*j/segments)*r),mul(v,math.sin(2*math.pi*j/segments)*r)))) for j in range(segments)])
        # u,v are oriented around +axis; bottom needs reversed winding.
        self.face(surface,list(reversed(rings[0])))
        self.face(surface,rings[1])
        for j in range(segments):
            self.face(surface,[rings[0][j],rings[0][(j+1)%segments],rings[1][(j+1)%segments],rings[1][j]])

    def tube(self, surface, center, radius, thickness, height, segments=16):
        rings=[]
        for y,r in [(-height/2,radius),(height/2,radius),(-height/2,radius-thickness),(height/2,radius-thickness)]:
            rings.append([add(center,(math.cos(2*math.pi*j/segments)*r,y,math.sin(2*math.pi*j/segments)*r)) for j in range(segments)])
        for j in range(segments):
            k=(j+1)%segments
            for f in [(rings[0][j],rings[0][k],rings[1][k],rings[1][j]),
                      (rings[2][k],rings[2][j],rings[3][j],rings[3][k]),
                      (rings[1][j],rings[1][k],rings[3][k],rings[3][j]),
                      (rings[0][k],rings[0][j],rings[2][j],rings[2][k])]:
                self.face(surface,list(reversed(f)))

    def rail(self, surface, a, b, radius, segments=6):
        delta=sub(b,a)
        self.cylinder(surface,mul(add(a,b),.5),radius,math.sqrt(sum(x*x for x in delta)),segments,delta)

    def rotor(self, center, radius, lod=False, yaw=0, blades=2):
        if lod:
            self.box("Prop",add(center,(0,.011,0)),(radius*2,.015,radius*.20),yaw)
            return
        # Swept, tapered airfoils with a slight pitch; not intersecting rectangles.
        for blade in range(blades):
            angle=yaw+blade*2*math.pi/blades
            c,s=math.cos(angle),math.sin(angle)
            profile=[(.035,-.025),(.19*radius,-.10*radius),(.76*radius,-.15*radius),(radius,-.065*radius),(.91*radius,.01*radius),(.35*radius,.11*radius),(.035,.025)]
            def p(x,z,y):
                return add(center,(x*c+z*s,y+z*.12,-x*s+z*c))
            top=[p(x,z,.012) for x,z in profile]
            bottom=[p(x,z,0) for x,z in profile]
            self.face("Prop",list(reversed(top)))
            self.face("Prop",bottom)
            for j in range(len(top)):
                k=(j+1)%len(top)
                self.face("Prop",[bottom[j],top[j],top[k],bottom[k]])
        self.cylinder("Metal",add(center,(0,.025,0)),.034,.035,8)

    def motor(self, x,z,y=.04,r=.06,lod=False):
        self.cylinder("Metal",(x,y,z),r,.085,6 if lod else 12)
        if not lod:
            self.cylinder("Accent",(x,y+.045,z),r*.90,.012,12)
            self.cylinder("Frame",(x,y-.039,z),r*1.06,.012,12)
            for j in range(6):
                a=j*math.pi/3
                self.box("Rubber",(x+math.sin(a)*r*.93,y,z+math.cos(a)*r*.93),(.012,.046,.012),a)

    def camera(self, center, scale=1,lod=False):
        self.box("Frame",center,(.18*scale,.15*scale,.13*scale))
        front=add(center,(0,0,.092*scale))
        self.cylinder("Metal",front,.069*scale,.065*scale,6 if lod else 12,(0,0,1))
        self.cylinder("Glass",add(front,(0,0,.037*scale)),.053*scale,.012*scale,6 if lod else 12,(0,0,1))
        if not lod:
            self.cylinder("Emission",add(front,(0,0,.044*scale)),.017*scale,.004*scale,8,(0,0,1))

    def beacon(self, center, lod=False):
        self.box("Emission",center,(.085,.018,.035))
        if not lod:
            self.box("Rubber",add(center,(0,-.018,0)),(.10,.022,.052))

    def write(self,name):
        objects=[]
        for surface,triangles in self.parts.items():
            if not triangles:
                continue
            positions=[];normals=[];uv=[]
            for tri in triangles:
                n=unit(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])))
                positions.extend(tri);normals.extend([n]*3)
                uv.extend([(p[0],p[2]) for p in tri])
            objects.append({"surface":"Carbon" if surface=="Frame" else surface,"positions":positions,"normals":normals,"uv":uv,"indices":list(range(len(positions)))})
        path=OUT/(name+".fleetmesh")
        write_fleetmesh(path,objects)
        counts={o["surface"]:len(o["indices"])//3 for o in objects}
        vertices=[p for o in objects for p in o["positions"]]
        bounds=[[round(min(p[i] for p in vertices),5),round(max(p[i] for p in vertices),5)] for i in range(3)]
        return {"file":path.name,"triangles":sum(counts.values()),"vertices":len(vertices),"surfaces":counts,"boundsXYZ":bounds,"bytes":path.stat().st_size}


def guid(path):
    return uuid.uuid5(uuid.NAMESPACE_URL,"fleet-commander-unity:"+str(path.relative_to(ROOT)).replace("\\","/")).hex



def write_meta(path):
    importer=ROOT/"Assets/FleetCommander/Editor/FleetMeshImporter.cs"
    path.with_name(path.name+".meta").write_text("""fileFormatVersion: 2
+guid: %s
+ScriptedImporter:
+  internalIDToNameTable: []
+  externalObjects: {}
+  serializedVersion: 2
+  userData:
+  assetBundleName:
+  assetBundleVariant:
+  script: {fileID: 11500000, guid: %s, type: 3}
+""".replace("\n+","\n") % (guid(path),guid(importer)))


def write_fleetmesh(path,objects):
    # Binary formatFCM1; little-endian counts and floats; deterministic gzip.
    # One semantic surface per Unity mesh. Shared indices retained within each
    # original primitive. GLB UVs are flipped before arriving here.
    import io
    raw=io.BytesIO();raw.write(b"FCM1")
    surfaces=list(dict.fromkeys(o["surface"] for o in objects))
    raw.write(struct.pack("<i",len(surfaces)))
    for surface in surfaces:
        parts=[o for o in objects if o["surface"]==surface]
        encoded=surface.encode("utf-8")
        vertex_count=sum(len(o["positions"]) for o in parts)
        index_count=sum(len(o["indices"]) for o in parts)
        raw.write(struct.pack("<i",len(encoded)));raw.write(encoded)
        raw.write(struct.pack("<ii",vertex_count,index_count))
        for o in parts:
            for p,n,uv in zip(o["positions"],o["normals"],o["uv"]):
                raw.write(struct.pack("<8f",*p,*n,*uv))
        offset=0
        for o in parts:
            for index in o["indices"]:
                raw.write(struct.pack("<i",index+offset))
            offset+=len(o["positions"])
    data=raw.getvalue()
    path.write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
    assert gzip.decompress(path.read_bytes())==data
    write_meta(path)


def matrix_multiply(a,b):
    return [[sum(a[row][k]*b[k][col] for k in range(4)) for col in range(4)] for row in range(4)]


def transform(matrix, point, w=1):
    return tuple(sum(matrix[row][col]*point[col] for col in range(3))+matrix[row][3]*w for row in range(3))


def node_matrix(node):
    if "matrix" in node:
        flat=node["matrix"]
        return [[flat[col*4+row] for col in range(4)] for row in range(4)]
    x,y,z,w=node.get("rotation",[0,0,0,1])
    sx,sy,sz=node.get("scale",[1,1,1])
    tx,ty,tz=node.get("translation",[0,0,0])
    return [
        [(1-2*y*y-2*z*z)*sx,(2*x*y-2*z*w)*sy,(2*x*z+2*y*w)*sz,tx],
        [(2*x*y+2*z*w)*sx,(1-2*x*x-2*z*z)*sy,(2*y*z-2*x*w)*sz,ty],
        [(2*x*z-2*y*w)*sx,(2*y*z+2*x*w)*sy,(1-2*x*x-2*y*y)*sz,tz],
        [0,0,0,1],
    ]


def normal_matrix(m):
    # Cofactor matrix equals inverse transpose times determinant; uniform sign
    # suffices after normalization. All source meshes have positive scale.
    a,b,c=m[0][:3];d,e,f=m[1][:3];g,h,i=m[2][:3]
    return [[e*i-f*h,f*g-d*i,d*h-e*g,0],
            [c*h-b*i,a*i-c*g,b*g-a*h,0],
            [b*f-c*e,c*d-a*f,a*e-b*d,0]]


def convert_glb(name, target_span):
    source=ROOT.parent/"dist/assets/drones"/("GR_"+name.upper()+"_01.glb.gz")
    raw=gzip.decompress(source.read_bytes())
    magic,version,length=struct.unpack_from("<III",raw,0)
    assert magic==0x46546c67 and version==2 and length==len(raw)
    chunks={};offset=12
    while offset<len(raw):
        size,kind=struct.unpack_from("<II",raw,offset)
        chunks[kind]=raw[offset+8:offset+8+size];offset+=8+size
    doc=json.loads(chunks[0x4e4f534a]);binary=chunks[0x004e4942]
    def read_accessor(index):
        accessor=doc["accessors"][index]
        view=doc["bufferViews"][accessor["bufferView"]]
        components={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[accessor["type"]]
        component_format={5121:"B",5123:"H",5125:"I",5126:"f"}[accessor["componentType"]]
        fmt="<"+component_format*components
        item_size=struct.calcsize(fmt);stride=view.get("byteStride",item_size)
        offset=view.get("byteOffset",0)+accessor.get("byteOffset",0)
        return [struct.unpack_from(fmt,binary,offset+i*stride) for i in range(accessor["count"])]
    identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
    objects=[];rotors=[]
    def visit(index,parent):
        node=doc["nodes"][index]
        world=matrix_multiply(parent,node_matrix(node))
        if node.get("extras",{}).get("rotor") and "mesh" not in node:
            rotors.append({"name":node["name"],"sourcePivot":transform(world,(0,0,0))})
        if "mesh" in node:
            for prim in doc["meshes"][node["mesh"]]["primitives"]:
                assert prim.get("mode",4)==4
                attributes=prim["attributes"]
                positions=[transform(world,p) for p in read_accessor(attributes["POSITION"])]
                normal_transform=normal_matrix(world)
                normals=[unit(transform(normal_transform,n,0)) for n in read_accessor(attributes["NORMAL"])]
                uv=read_accessor(attributes["TEXCOORD_0"])
                triangles=[i[0] for i in read_accessor(prim["indices"])]
                material=doc["materials"][prim["material"]]["name"].removeprefix("RUNTIME_")
                surface="Prop" if node.get("extras",{}).get("rotor") else SOURCE_SURFACES[material]
                objects.append({"surface":surface,"material":material,"positions":positions,"normals":normals,"uv":uv,"indices":triangles})
        for child in node.get("children",[]):
            visit(child,world)
    for node in doc["scenes"][doc.get("scene",0)]["nodes"]:
        visit(node,identity)
    source_bounds=[[min(p[i] for o in objects for p in o["positions"]),max(p[i] for o in objects for p in o["positions"])] for i in range(3)]
    scale=target_span/max(source_bounds[0][1]-source_bounds[0][0],source_bounds[2][1]-source_bounds[2][0])
    center_y=sum(source_bounds[1])*.5
    def bake(p):
        # Match dist/airframes.js: rotate180 aroundY and center vertically.
        return (-p[0]*scale,(p[1]-center_y)*scale,-p[2]*scale)
    for o in objects:
        o["positions"]=[bake(p) for p in o["positions"]]
        o["normals"]=[(-n[0],n[1],-n[2]) for n in o["normals"]]
    for r in rotors:
        pivot=bake(r.pop("sourcePivot"));r["pivotXYZ"]=list(pivot)
        rotor_object=min((o for o in objects if o["surface"]=="Prop"),key=lambda o:sum((sum(p[i] for p in o["positions"])/len(o["positions"])-pivot[i])**2 for i in range(3)))
        r["radius"]=round(max(math.hypot(p[0]-pivot[0],p[2]-pivot[2]) for p in rotor_object["positions"]),5)
    for obj in objects:
        obj["uv"]=[(u,1-v) for u,v in obj["uv"]]
    path=OUT/(name+".fleetmesh")
    write_fleetmesh(path,objects)
    counts={}
    for obj in objects:
        counts[obj["surface"]]=counts.get(obj["surface"],0)+len(obj["indices"])//3
    vertices=sum(len(o["positions"]) for o in objects)
    bounds=[[round(min(p[i] for o in objects for p in o["positions"]),5),round(max(p[i] for o in objects for p in o["positions"]),5)] for i in range(3)]
    return {"file":path.name,"source":str(source.relative_to(ROOT.parent)),"triangles":sum(counts.values()),"vertices":vertices,"surfaces":counts,"boundsXYZ":bounds,"sourceBoundsXYZ":source_bounds,"scale":scale,"rotors":rotors,"bytes":path.stat().st_size}



def make_lod(name,record):
    """Distant silhouette matches the approved four-duct frame and rotor pivots."""
    m=Mesh();m.parts["OffWhite"]=[]
    span=record["boundsXYZ"][0][1]*2
    depth=record["boundsXYZ"][2][1]*2
    bottom=record["boundsXYZ"][1][0]
    y=record["rotors"][0]["pivotXYZ"][1]
    m.box("Panel",(0,y-.04,0),(span*.24,span*.065,depth*.48))
    m.box("Accent",(0,y+.001,-depth*.10),(span*.14,span*.013,depth*.12))
    for side in [-1,1]:
        m.box("OffWhite",(side*span*.108,y-.053,0),(span*.027,span*.025,depth*.36))
    for rotor in record["rotors"]:
        x,ry,z=rotor["pivotXYZ"];r=rotor["radius"]
        m.rail("Frame",(x*.20,y-.055,z*.20),(x,y-.038,z),span*.017,3)
        m.tube("Frame",(x,ry-.035,z),r*1.14,r*.09,span*.067,5)
        m.cylinder("Metal",(x,ry-.023,z),r*.21,span*.052,4)
        m.rotor((x,ry,z),r,True,.3 if x*z>0 else -.3)
    skid_x=span*.15
    for side in [-1,1]:
        for sign in [-1,1]:
            m.rail("Frame",(side*span*.087,y-.075,sign*depth*.15),(side*skid_x,bottom+.025,sign*depth*.19),span*.009,3)
        m.rail("Rubber",(side*skid_x,bottom+.025,-depth*.32),(side*skid_x,bottom+.025,depth*.32),span*.018,4)
    m.box("Frame",(0,y-.12,depth*.23),(span*.085,span*.07,span*.05))
    m.cylinder("Glass",(0,y-.12,depth*.267),span*.03,span*.024,4,(0,0,1))
    m.beacon((0,y+.03,-depth*.19),True)
    if name=="Relay":
        top=record["boundsXYZ"][1][1]
        for side in [-1,1]:
            m.rail("Metal",(side*span*.05,y+.02,-depth*.10),(side*span*.05,top,-depth*.10),span*.004,3)
    elif name=="Cargo":
        m.box("Accent",(0,bottom+.04,0),(span*.24,span*.016,depth*.23))
        for side in [-1,1]:
            m.rail("Metal",(side*span*.11,y-.07,depth*.11),(side*span*.11,bottom+.04,depth*.11),span*.01,3)
    elif name=="Utility":
        for side in [-1,1]:
            m.rail("Metal",(side*span*.08,y-.07,depth*.23),(side*span*.14,bottom+.04,depth*.28),span*.015,4)
    return m


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    folder_meta=OUT.with_name(OUT.name+".meta")
    folder_meta.write_text("fileFormatVersion: 2\nguid: "+guid(OUT)+"\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData:\n  assetBundleName:\n  assetBundleVariant:\n")
    records=[]
    for name,target_span in [("Scout",1.6),("Relay",2),("Cargo",3),("Utility",2)]:
        record=convert_glb(name,target_span)
        records.append(record)
        lod_record=make_lod(name,record).write(name+"_LOD")
        assert lod_record["triangles"]<=600,lod_record
        records.append(lod_record)
    manifest={"provenance":"Detailed models are direct mesh/UV/normal conversions of the existing repository approved Blender reference pack02. LOD proxies are project-authored geometric approximations, not replacement source models.","generator":"unity/Tools/Generate-DroneModels.py","format":"FCM1 gzip binary; documented in unity/Tools/DroneModels.md","units":"visual meters","up":"+Y","forward":"+Z","sourceMaterialMap":SOURCE_SURFACES,"sourceRotors":"Prop","models":records}
    (ROOT/"Tools/DroneModels.manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps([{k:r[k] for k in ["file","triangles","bytes","boundsXYZ"]} for r in records],indent=2))


if __name__=="__main__":
    main()
