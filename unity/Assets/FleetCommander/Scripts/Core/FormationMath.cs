using UnityEngine;

namespace FleetCommander.Core
{
    public static class FormationMath
    {
        public static Vector3 Point(FormationKind kind, int i, int n, float spacing)
        {
            if (n <= 0) return Vector3.zero;
            float t = i / (float)Mathf.Max(1, n), a = t * Mathf.PI * 2;
            float r = Mathf.Max(spacing * 2, Mathf.Sqrt(n) * spacing * .8f);
            switch (kind)
            {
                case FormationKind.Ring: return Ring(i, n, r);
                case FormationKind.Sphere: return Sphere(i, n, r * .7f);
                case FormationKind.Line: return new Vector3((i - (n - 1) * .5f) * Mathf.Min(spacing, 600f / n), 0, 0);
                case FormationKind.Column: return new Vector3(0, 0, (i - (n - 1) * .5f) * Mathf.Min(spacing, 600f / n));
                case FormationKind.Wedge:
                    int row = Mathf.FloorToInt(Mathf.Sqrt(i)); int col = i - row * row;
                    return new Vector3((col - row) * spacing, 0, row * spacing - r * .5f);
                case FormationKind.DoubleOrbit: return Ring(i / 2, (n + 1) / 2, r) + new Vector3((i % 2 == 0 ? -1 : 1) * r * .65f, i % 2 * spacing * 2, 0);
                case FormationKind.Scatter: return new Vector3(Hash(i * 3) - .5f, (Hash(i * 3 + 1) - .5f) * .4f, Hash(i * 3 + 2) - .5f) * r * 2;
                case FormationKind.Staggered: return Grid(i, n, spacing) + new Vector3(i % 2 * spacing * .5f, i % 3 * spacing, 0);
                case FormationKind.HighLow: return Ring(i, n, r) + Vector3.up * Mathf.Sin(a * 4) * r * .25f;
                case FormationKind.Overwatch: return Grid(i, n, spacing) + Vector3.up * (i % 3) * spacing * 2;
                case FormationKind.Helix: return new Vector3(Mathf.Cos(a * 3) * r * .6f, (t - .5f) * r, Mathf.Sin(a * 3) * r * .6f);
                case FormationKind.Heart: return new Vector3(16 * Mathf.Pow(Mathf.Sin(a), 3), 13 * Mathf.Cos(a) - 5 * Mathf.Cos(2*a) - 2 * Mathf.Cos(3*a) - Mathf.Cos(4*a), 0) * r / 18;
                default: return Grid(i, n, spacing);
            }
        }
        public static float Hash(int i)
        {
            unchecked { uint x = (uint)(i + 1) * 747796405u + 2891336453u; x = ((x >> (int)((x >> 28) + 4)) ^ x) * 277803737u; return ((x >> 22) ^ x) / (float)uint.MaxValue; }
        }
        public static Vector3 Target(FleetConfig c, int i, int n, float time, int team)
        {
            var group = c.groups[Mathf.Clamp(team, 0, 3)];
            var shape = group.enabled ? group.formation : c.formation;
            int index = group.enabled ? i / 4 : i, count = group.enabled ? (n + 3 - team) / 4 : n;
            Vector3 p = shape == FormationKind.Art && c.art.Length > 0
                ? c.art[Mathf.Min(c.art.Length - 1, index % Mathf.Max(1, Mathf.Min(count, c.art.Length)) * c.art.Length / Mathf.Max(1, Mathf.Min(count, c.art.Length)))].position + Vector3.forward * (index / c.art.Length) * 2
                : Point(shape, index, count, c.spacing);
            float beat = time * c.bpm / 60 * Mathf.PI * 2;
            switch (c.pattern)
            {
                case MotionPattern.Orbit: p = Quaternion.Euler(0, time * 10, 0) * p; break;
                case MotionPattern.Wave: p.y += Mathf.Sin(time * 1.5f + p.x * .09f) * 8; break;
                case MotionPattern.Pulse: p *= 1 + Mathf.Sin(time) * .22f; break;
                case MotionPattern.Dance: p.y += (Mathf.Sin(beat + i * .12f) + 1) * 3; p.x += Mathf.Sin(beat * .25f + i * .1f) * 3; break;
            }
            p = Quaternion.Euler(0, c.rotation, 0) * p * c.scale;
            Vector3 field = Vector3.zero;
            foreach (var l in c.layers) field += Influence(l, p, i, time);
            p += Vector3.ClampMagnitude(field, 32) + c.origin + (group.enabled ? group.offset : Vector3.zero) + Vector3.up * c.height;
            return new Vector3(Mathf.Clamp(p.x, -950, 950), Mathf.Clamp(p.y, 3, 310), Mathf.Clamp(p.z, -950, 950));
        }
        public static Vector3 Influence(InfluenceLayer l, Vector3 p, int i, float time)
        {
            float a = time * l.frequency + l.phase, x = p.x / 20, z = p.z / 20;
            Vector3 v;
            switch (l.kind)
            {
                case InfluenceKind.Vortex: v = new Vector3(-z, Mathf.Sin(a + x), x).normalized; break;
                case InfluenceKind.Attract: v = -p.normalized; break;
                case InfluenceKind.Repel: v = p.normalized; break;
                case InfluenceKind.Wave: v = Vector3.up * Mathf.Sin(a + x); break;
                case InfluenceKind.Lissajous: v = new Vector3(Mathf.Sin(a * 2 + i * .1f), Mathf.Sin(a * 3 + i * .1f), Mathf.Cos(a)); break;
                case InfluenceKind.Spiral: v = new Vector3(Mathf.Cos(a + i * .15f), Mathf.Sin(a + x), Mathf.Sin(a + i * .15f)); break;
                case InfluenceKind.Braid: v = new Vector3(Mathf.Sin(a + z), Mathf.Cos(a + i % 3 * 2.094f), 0); break;
                case InfluenceKind.Twin: v = new Vector3(Mathf.Sin(a) * (i % 2 == 0 ? -1 : 1), Mathf.Cos(a + x), 0); break;
                case InfluenceKind.Square: v = new Vector3(Mathf.Sin(a + x) >= 0 ? 1 : -1, 0, Mathf.Sin(a + z) >= 0 ? 1 : -1); break;
                case InfluenceKind.Riemann: v = new Vector3(Mathf.Sin(x*x - z*z + a), Mathf.Sin(2*x*z + a), Mathf.Cos(x*x + z*z - a)); break;
                default: return Vector3.zero;
            }
            return v * l.strength * l.blend;
        }
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
