using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Rendering;

namespace FleetCommander.Editor
{
    /// <summary>Imports the project's compact, lossless baked drone mesh format.</summary>
    [ScriptedImporter(1, "fleetmesh")]
    public sealed class FleetMeshImporter : ScriptedImporter
    {
        public override void OnImportAsset(AssetImportContext context)
        {
            using (var file = File.OpenRead(context.assetPath))
            using (var gzip = new GZipStream(file, CompressionMode.Decompress))
            using (var reader = new BinaryReader(gzip, Encoding.UTF8))
            {
                if (Encoding.ASCII.GetString(reader.ReadBytes(4)) != "FCM1")
                    throw new InvalidDataException("Not a Fleet Commander mesh (FCM1).");

                var root = new GameObject(Path.GetFileNameWithoutExtension(context.assetPath));
                context.AddObjectToAsset("root", root);
                context.SetMainObject(root);
                var preview = new Material(Shader.Find("Standard")) { name = "Preview" };
                context.AddObjectToAsset("preview", preview);
                int surfaceCount = ReadCount(reader, 32, "surface count");
                for (int surface = 0; surface < surfaceCount; surface++)
                {
                    int nameLength = ReadCount(reader, 256, "surface name length");
                    byte[] nameBytes = reader.ReadBytes(nameLength);
                    if (nameBytes.Length != nameLength) throw new EndOfStreamException();
                    string name = Encoding.UTF8.GetString(nameBytes);
                    int vertexCount = ReadCount(reader, 1000000, "vertex count");
                    int indexCount = ReadCount(reader, 3000000, "index count");
                    if (indexCount % 3 != 0) throw new InvalidDataException("Triangle index count must be divisible by three.");
                    var vertices = new Vector3[vertexCount];
                    var normals = new Vector3[vertexCount];
                    var uv = new Vector2[vertexCount];
                    for (int vertex = 0; vertex < vertexCount; vertex++)
                    {
                        vertices[vertex] = new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle());
                        normals[vertex] = new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle());
                        uv[vertex] = new Vector2(reader.ReadSingle(), reader.ReadSingle());
                    }
                    var indices = new int[indexCount];
                    for (int i = 0; i < indexCount; i++)
                    {
                        indices[i] = reader.ReadInt32();
                        if (indices[i] < 0 || indices[i] >= vertexCount)
                            throw new InvalidDataException("Triangle index is outside its surface vertex array.");
                    }
                    var mesh = new Mesh
                    {
                        name = name,
                        indexFormat = vertexCount > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16
                    };
                    mesh.vertices = vertices;
                    mesh.normals = normals;
                    mesh.uv = uv;
                    mesh.triangles = indices;
                    mesh.RecalculateBounds();
                    mesh.RecalculateTangents();
                    // Keep CPU data: FleetRenderer combines each semantic surface
                    // into its GPU-instanced full-detail and distance meshes.
                    context.AddObjectToAsset("mesh_" + name, mesh);
                    var child = new GameObject(name);
                    child.transform.SetParent(root.transform, false);
                    child.AddComponent<MeshFilter>().sharedMesh = mesh;
                    child.AddComponent<MeshRenderer>().sharedMaterial = preview;
                }
                if (reader.BaseStream.ReadByte() != -1)
                    throw new InvalidDataException("Unexpected bytes after the last mesh surface.");
            }
        }

        private static int ReadCount(BinaryReader reader, int maximum, string label)
        {
            int count = reader.ReadInt32();
            if (count <= 0 || count > maximum)
                throw new InvalidDataException("Invalid " + label + ".");
            return count;
        }
    }
}
