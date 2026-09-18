import ctypes as C
E=C.CDLL('libEGL.so.1')
def ep(n,rest,args):
 f=getattr(E,n);f.restype=rest;f.argtypes=args;return f
ptr=C.c_void_p;I=C.c_int
get=ep('eglGetProcAddress',ptr,[C.c_char_p])
platform=C.CFUNCTYPE(ptr,C.c_uint,ptr,C.POINTER(I))(get(b'eglGetPlatformDisplayEXT'))
display=platform(0x31DD,None,None)
major,minor=I(),I();assert ep('eglInitialize',C.c_uint,[ptr,C.POINTER(I),C.POINTER(I)])(display,C.byref(major),C.byref(minor))
attrs=(I*13)(0x3033,1,0x3040,0x0040,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038);conf=ptr();num=I()
assert ep('eglChooseConfig',C.c_uint,[ptr,C.POINTER(I),C.POINTER(ptr),I,C.POINTER(I)])(display,attrs,C.byref(conf),1,C.byref(num)) and num.value
assert ep('eglBindAPI',C.c_uint,[C.c_uint])(0x30A0)
ctxattrs=(I*3)(0x3098,3,0x3038);ctx=ep('eglCreateContext',ptr,[ptr,ptr,ptr,C.POINTER(I)])(display,conf,None,ctxattrs);assert ctx
assert ep('eglMakeCurrent',C.c_uint,[ptr,ptr,ptr,ptr])(display,None,None,ctx)
def gl(n,rest,args):return C.CFUNCTYPE(rest,*args)(get(n.encode()))
print(gl('glGetString',C.c_char_p,[C.c_uint])(0x1F02).decode())
import json
create=gl('glCreateShader',C.c_uint,[C.c_uint]);source=gl('glShaderSource',None,[C.c_uint,I,C.POINTER(C.c_char_p),C.POINTER(I)]);compile_shader=gl('glCompileShader',None,[C.c_uint]);parameter=gl('glGetShaderiv',None,[C.c_uint,C.c_uint,C.POINTER(I)]);log=gl('glGetShaderInfoLog',None,[C.c_uint,I,C.POINTER(I),C.c_char_p]);create_program=gl('glCreateProgram',C.c_uint,[]);attach=gl('glAttachShader',None,[C.c_uint,C.c_uint]);link=gl('glLinkProgram',None,[C.c_uint]);program_parameter=gl('glGetProgramiv',None,[C.c_uint,C.c_uint,C.POINTER(I)]);program_log=gl('glGetProgramInfoLog',None,[C.c_uint,I,C.POINTER(I),C.c_char_p])
errors=0
for item in json.load(open('qa-output/shaders.json')):
 ids=[]
 for kind,num in [('vertex',0x8B31),('fragment',0x8B30)]:
  shader=create(num);encoded=item[kind].encode();s=C.c_char_p(encoded);source(shader,1,C.byref(s),None);compile_shader(shader);ok=I();parameter(shader,0x8B81,C.byref(ok));ids.append(shader)
  if not ok.value:
   buf=C.create_string_buffer(16000);log(shader,16000,None,buf);print(item['name'],kind,buf.value.decode());errors+=1
 if errors:continue
 p=create_program()
 for shader in ids:attach(p,shader)
 link(p);ok=I();program_parameter(p,0x8B82,C.byref(ok))
 if not ok.value:
  buf=C.create_string_buffer(16000);program_log(p,16000,None,buf);print(item['name'],'link',buf.value.decode());errors+=1
 else:print('PASS:',item['name'],'compiled and linked')
assert errors==0, f'{errors} shader failures'
