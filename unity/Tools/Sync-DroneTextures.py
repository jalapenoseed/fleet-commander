#!/usr/bin/env python3
"""Copy the repository's approved PBR channels into the Unity Resources tree.
No image transformation, channel packing, or external download is performed.
"""
from pathlib import Path
import hashlib
import shutil

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "dist/assets/drones/textures"
DEST = ROOT / "unity/Assets/FleetCommander/Resources/DroneTextures"

def guid(path):
    return hashlib.md5(("FleetCommander/" + path.relative_to(ROOT).as_posix()).encode()).hexdigest()

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    Path(str(DEST) + ".meta").write_text(
        f"fileFormatVersion: 2\nguid: {guid(DEST)}\nfolderAsset: yes\nDefaultImporter:\n"
        "  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n")
    count = 0
    for source in sorted(SOURCE.glob("*.png")):
        if "08_damp_concrete" in source.name:
            continue
        target = DEST / source.name
        shutil.copyfile(source, target)
        normal = source.stem.endswith("_normal")
        srgb = int(source.stem.endswith("_albedo"))
        Path(str(target) + ".meta").write_text(f"""fileFormatVersion: 2
guid: {guid(target)}
TextureImporter:
  internalIDToNameTable: []
  externalObjects: {{}}
  serializedVersion: 13
  mipmaps:
    mipMapMode: 0
    enableMipMap: 1
    sRGBTexture: {srgb}
  normalmap:
    convertToNormalMap: 0
    externalNormalMap: {int(normal)}
    heightScale: 0.25
    normalMapFilter: 0
    flipGreenChannel: 0
  isReadable: 0
  textureType: {1 if normal else 0}
  textureShape: 1
  maxTextureSize: {2048 if 'trim' in source.name else 1024}
  textureSettings:
    serializedVersion: 2
    filterMode: 2
    aniso: 4
    mipBias: 0
    wrapU: {1 if 'camera_glass' in source.name else 0}
    wrapV: {1 if 'camera_glass' in source.name else 0}
    wrapW: 0
  userData: Original GRIDRUNNER source material; separate portable PBR channels.
  assetBundleName: 
  assetBundleVariant: 
""")
        count += 1
    print(f"Copied {count} original PBR textures.")

if __name__ == "__main__":
    main()
