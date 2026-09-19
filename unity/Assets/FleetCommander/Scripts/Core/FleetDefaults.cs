using UnityEngine;

namespace FleetCommander.Core
{
    /// <summary>Section-scoped defaults. Keep the config identity and unrelated session data intact.</summary>
    public static class FleetDefaults
    {
        public static void Appearance(DroneState[] states)
        {
            for(int i=0;i<states.Length;i++){states[i].frame=(FrameKind)((states[i].id%4+4)%4);states[i].skin=SkinKind.Graphite;}
        }
        public static void Formation(FleetConfig c)
        {
            var d=new FleetConfig();
            c.formation=d.formation;c.pattern=d.pattern;c.spacing=d.spacing;c.height=d.height;
            c.scale=d.scale;c.rotation=d.rotation;c.origin=d.origin;
        }
        public static void Squad(GroupSettings group)
        {
            var d=new GroupSettings();group.enabled=d.enabled;group.formation=d.formation;group.offset=d.offset;
        }
        public static void Squads(FleetConfig c){foreach(var group in c.groups)Squad(group);}
        public static void Layer(InfluenceLayer layer)
        {
            var d=new InfluenceLayer();layer.kind=d.kind;layer.strength=d.strength;layer.frequency=d.frequency;layer.phase=d.phase;layer.blend=d.blend;
        }
        public static void Layers(FleetConfig c){foreach(var layer in c.layers)Layer(layer);}
        public static void Flocking(FleetConfig c)
        {
            var d=new FleetConfig();c.boids=d.boids;c.separation=d.separation;c.alignment=d.alignment;c.cohesion=d.cohesion;c.neighborRadius=d.neighborRadius;
        }
        public static void Environment(FleetConfig c)
        {
            var d=new FleetConfig();c.scenery=d.scenery;c.sky=d.sky;c.weather=d.weather;c.wind=d.wind;c.beaconSize=d.beaconSize;
        }
        public static void Flight(FleetConfig c)
        {
            var d=new FleetConfig();c.planet=d.planet;c.arcadeLift=d.arcadeLift;c.obstacles=d.obstacles;c.speed=d.speed;c.acceleration=d.acceleration;
        }
        public static void Energy(FleetConfig c)
        {
            var d=new FleetConfig();c.material=d.material;c.batteryWh=d.batteryWh;c.batteryMass=d.batteryMass;c.cargoMass=d.cargoMass;
            c.flightWatts=d.flightWatts;c.electronicsWatts=d.electronicsWatts;c.drainScale=d.drainScale;c.unlimited=d.unlimited;
        }
    }
}
