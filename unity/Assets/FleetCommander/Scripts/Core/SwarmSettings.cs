using System;
using UnityEngine;

namespace FleetCommander.Core
{
    public enum FormationKind { Grid, Ring, Wedge, Line, Column, DoubleOrbit, Scatter, Staggered, HighLow, Overwatch, Helix, Sphere, Heart, Art }
    public enum InfluenceKind { None, Vortex, Attract, Repel, Wave, Lissajous, Spiral, Braid, Twin, Square, Riemann }
    public enum MotionPattern { None, Orbit, Wave, Pulse, Dance }
    public enum PlanetKind { Earth, Moon, Mars }
    public enum SceneryKind { Stadium, Coast, Alpine, City, Meadow, Creek, Overlook, RuralTown, Metro, Harbor, Desert, ForestLake }
    public enum SkyKind { Day, Golden, Dusk, Night, MilkyWay, Moonlit, Overcast }
    public enum WeatherKind { Clear, Rain, Storm, Snow }
    public enum FrameKind { Scout, Relay, Cargo, Utility }

    [Serializable] public sealed class InfluenceLayer
    {
        public InfluenceKind kind;
        public float strength = 8, frequency = .6f, phase, blend = 1;
    }
    [Serializable] public sealed class GroupSettings
    {
        public bool enabled;
        public FormationKind formation = FormationKind.Ring;
        public Vector3 offset;
    }
    [Serializable] public sealed class ArtPoint
    {
        public Vector3 position;
        public Color color = Color.white;
    }
    [Serializable] public sealed class FleetConfig
    {
        public FormationKind formation = FormationKind.Ring;
        public MotionPattern pattern;
        public float spacing = 3, height = 35, scale = 1, rotation, speed = 24, acceleration = 24;
        public Vector3 origin;
        public bool boids = true, obstacles = true, unlimited;
        public float separation = 1.5f, alignment = .7f, cohesion = .1f, neighborRadius = 8;
        public float batteryWh = 45, flightWatts = 140, electronicsWatts = 8, batteryMass = .24f, cargoMass, drainScale = 1;
        public int material;
        public PlanetKind planet;
        public bool arcadeLift = true;
        public SceneryKind scenery = SceneryKind.Stadium;
        public SkyKind sky = SkyKind.Day;
        public WeatherKind weather;
        public float wind = 1, beaconSize = 1, bpm = 120;
        public InfluenceLayer[] layers = { new InfluenceLayer(), new InfluenceLayer(), new InfluenceLayer(), new InfluenceLayer() };
        public GroupSettings[] groups = { new GroupSettings(), new GroupSettings(), new GroupSettings(), new GroupSettings() };
        public ArtPoint[] art = Array.Empty<ArtPoint>();

        public void ResetInfluences()
        {
            pattern = MotionPattern.None;
            foreach (var layer in layers) layer.kind = InfluenceKind.None;
        }
        public void Validate()
        {
            if (!Enum.IsDefined(typeof(FormationKind), formation) || !Enum.IsDefined(typeof(PlanetKind), planet) ||
                !Enum.IsDefined(typeof(MotionPattern), pattern) || !Enum.IsDefined(typeof(SceneryKind), scenery) ||
                !Enum.IsDefined(typeof(SkyKind), sky) || !Enum.IsDefined(typeof(WeatherKind), weather))
                throw new ArgumentException("Unknown formation or environment setting.");
            spacing = Safe(spacing, .5f, 20); height = Safe(height, 2, 260); scale = Safe(scale, .1f, 5);
            rotation = Safe(rotation, -360, 360); speed = Safe(speed, 1, 60); acceleration = Safe(acceleration, 1, 80);
            origin = new Vector3(Safe(origin.x, -800, 800), Safe(origin.y, -100, 100), Safe(origin.z, -800, 800));
            separation = Safe(separation, 0, 5); alignment = Safe(alignment, 0, 5); cohesion = Safe(cohesion, 0, 3);
            neighborRadius = Safe(neighborRadius, 2, 30); batteryWh = Safe(batteryWh, 1, 2000);
            flightWatts = Safe(flightWatts, 1, 5000); electronicsWatts = Safe(electronicsWatts, 0, 200);
            batteryMass = Safe(batteryMass, .05f, 5); cargoMass = Safe(cargoMass, 0, 10); drainScale = Safe(drainScale, .25f, 10);
            wind = Safe(wind, 0, 15); beaconSize = Safe(beaconSize, .25f, 3); bpm = Safe(bpm, 40, 240); material = Mathf.Clamp(material, 0, 2);
            if (layers == null || layers.Length != 4 || groups == null || groups.Length != 4) throw new ArgumentException("Four influence layers and four squads are required.");
            foreach (var l in layers)
            {
                if (l == null || !Enum.IsDefined(typeof(InfluenceKind), l.kind)) throw new ArgumentException("Invalid influence layer.");
                l.strength = Safe(l.strength, 0, 24); l.frequency = Safe(l.frequency, .05f, 3); l.phase = Safe(l.phase, -7, 7); l.blend = Safe(l.blend, 0, 1);
            }
            foreach (var g in groups)
                if (g == null || !Enum.IsDefined(typeof(FormationKind), g.formation) || !Finite(g.offset) || g.offset.magnitude > 800) throw new ArgumentException("Invalid squad.");
            if (art == null || art.Length > 4096) throw new ArgumentException("Art is limited to 4,096 points.");
            foreach (var p in art)
                if (p == null || !Finite(p.position) || p.position.magnitude > 800 || !Finite(new Vector3(p.color.r, p.color.g, p.color.b))) throw new ArgumentException("Invalid art point.");
        }
        public static bool Finite(Vector3 p) => !float.IsNaN(p.x + p.y + p.z) && !float.IsInfinity(p.x) && !float.IsInfinity(p.y) && !float.IsInfinity(p.z);
        static float Safe(float v, float min, float max)
        {
            if (float.IsNaN(v) || float.IsInfinity(v)) throw new ArgumentException("Settings must contain finite numbers.");
            return Mathf.Clamp(v, min, max);
        }
    }
    [CreateAssetMenu(menuName = "Fleet Commander/Swarm Settings")]
    public sealed class SwarmSettings : ScriptableObject { public FleetConfig config = new FleetConfig(); }
    public static class PlanetModel
    {
        public static float Gravity(PlanetKind p) => p == PlanetKind.Moon ? 1.62f : p == PlanetKind.Mars ? 3.73f : 9.81f;
        public static float Density(PlanetKind p) => p == PlanetKind.Moon ? 0 : p == PlanetKind.Mars ? .016f : 1.225f;
        public static bool CanFly(FleetConfig c) => c.arcadeLift || c.planet == PlanetKind.Earth;
        public static float Mass(FleetConfig c) => (c.material == 1 ? .32f : c.material == 2 ? .24f : .18f) + .23f + c.batteryMass + c.cargoMass;
        public static float Power(FleetConfig c, float speed) => (c.flightWatts * Mathf.Pow(Mass(c) / .65f, 1.35f) * (1 + speed * speed / 1600) + c.electronicsWatts) * c.drainScale;
        public static float EnduranceMinutes(FleetConfig c) => c.batteryWh / Power(c, 0) * 60;
    }
}
