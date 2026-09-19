using System.Collections.Generic;
using UnityEngine;
namespace FleetCommander.Core
{
    // ELI5: look in adjacent sky boxes instead of asking every drone about every other drone.
    public sealed class SpatialHash
    {
        readonly Dictionary<Vector3Int, int> heads = new Dictionary<Vector3Int, int>(10000);
        int[] next = System.Array.Empty<int>();
        float size;
        public int LastChecks { get; private set; }
        public void Build(DroneState[] states, float radius)
        {
            size = Mathf.Max(1, radius); heads.Clear(); LastChecks = 0;
            if (next.Length != states.Length) next = new int[states.Length];
            for (int i = states.Length - 1; i >= 0; i--)
            {
                if (!states[i].airborne) continue;
                var key = Cell(states[i].position);
                next[i] = heads.TryGetValue(key, out int head) ? head : -1;
                heads[key] = i;
            }
        }
        Vector3Int Cell(Vector3 p) => new Vector3Int(Mathf.FloorToInt(p.x / size), Mathf.FloorToInt(p.y / size), Mathf.FloorToInt(p.z / size));
        public Vector3 Steering(DroneState[] states, int index, FleetConfig c)
        {
            var s = states[index]; var center = Cell(s.position);
            Vector3 sep = Vector3.zero, pos = Vector3.zero, vel = Vector3.zero;
            int found = 0, visits = 0;
            for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++)
            {
                if (!heads.TryGetValue(center + new Vector3Int(x,y,z), out int j)) continue;
                while (j >= 0 && visits < 64 && found < 24)
                {
                    int k = j; j = next[j]; if (k == index) continue;
                    visits++; Vector3 d = s.position - states[k].position; float d2 = d.sqrMagnitude;
                    if (d2 > c.neighborRadius * c.neighborRadius) continue;
                    found++; pos += states[k].position; vel += states[k].velocity;
                    if (d2 < 9) sep += d2 < .001f ? new Vector3(index < k ? -1 : 1, 0, 0) * 4 : d / Mathf.Max(.2f, d2) * 4;
                }
            }
            LastChecks += visits;
            return found == 0 ? Vector3.zero : sep * c.separation + (vel / found - s.velocity) * c.alignment + (pos / found - s.position) * c.cohesion;
        }
    }
}
