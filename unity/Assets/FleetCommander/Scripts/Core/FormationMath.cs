using UnityEngine;

namespace FleetCommander.Core
{
    public static class FormationMath
    {
        public static Vector3 Grid(int index, int count, float spacing)
        {
            if (count <= 0) return Vector3.zero;
            int side = Mathf.CeilToInt(Mathf.Sqrt(count));
            int x = index % side;
            int z = index / side;
            float half = (side - 1) * spacing * 0.5f;
            return new Vector3(x * spacing - half, 0f, z * spacing - half);
        }

        public static Vector3 Ring(int index, int count, float radius)
        {
            if (count <= 0) return Vector3.zero;
            float a = (index / (float)count) * Mathf.PI * 2f;
            return new Vector3(Mathf.Cos(a) * radius, 0f, Mathf.Sin(a) * radius);
        }

        public static Vector3 Sphere(int index, int count, float radius)
        {
            if (count <= 1) return Vector3.up * radius;
            float golden = Mathf.PI * (3f - Mathf.Sqrt(5f));
            float y = 1f - (index / (float)(count - 1)) * 2f;
            float r = Mathf.Sqrt(Mathf.Max(0f, 1f - y * y));
            float theta = golden * index;
            return new Vector3(Mathf.Cos(theta) * r, y, Mathf.Sin(theta) * r) * radius;
        }
    }
}
