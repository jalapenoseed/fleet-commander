using FleetCommander.Core;
using NUnit.Framework;
using UnityEngine;

namespace FleetCommander.Tests
{
    public sealed class DefaultsTests
    {
        [Test] public void ResetAppearancePreservesTheFlyingFleetState()
        {
            var world=new FleetWorld(new FleetConfig{formation=FormationKind.Heart},8);world.Launch();world.Step(.05f);
            var before=(DroneState[])world.States.Clone();
            for(int i=0;i<world.Count;i++){world.States[i].frame=FrameKind.Cargo;world.States[i].skin=SkinKind.Arctic;}
            FleetDefaults.Appearance(world.States);
            Assert.AreEqual(before.Length,world.Count);Assert.AreEqual(FormationKind.Heart,world.Config.formation);
            for(int i=0;i<world.Count;i++)
            {
                var d=world.States[i];Assert.AreEqual((FrameKind)(d.id%4),d.frame);Assert.AreEqual(SkinKind.Graphite,d.skin);
                Assert.AreEqual(before[i].position,d.position);Assert.AreEqual(before[i].rotation,d.rotation);Assert.AreEqual(before[i].velocity,d.velocity);
                Assert.AreEqual(before[i].battery01,d.battery01);Assert.AreEqual(before[i].health,d.health);Assert.AreEqual(before[i].phase,d.phase);Assert.AreEqual(before[i].target,d.target);Assert.AreEqual(before[i].weapon,d.weapon);
            }
        }
        [Test] public void ResetFormationKeepsArtworkEnergyAndEnvironment()
        {
            var c=new FleetConfig{formation=FormationKind.Heart,pattern=MotionPattern.Dance,height=90,spacing=8,scale=3,rotation=45,origin=Vector3.one*20,batteryWh=88,weather=WeatherKind.Snow,boids=false};
            var art=new[]{new ArtPoint{position=Vector3.one}};c.art=art;c.groups[0].enabled=true;c.layers[2].kind=InfluenceKind.Braid;
            FleetDefaults.Formation(c);var d=new FleetConfig();
            Assert.AreEqual(d.formation,c.formation);Assert.AreEqual(d.pattern,c.pattern);Assert.AreEqual(d.height,c.height);Assert.AreEqual(d.spacing,c.spacing);Assert.AreEqual(d.scale,c.scale);Assert.AreEqual(d.rotation,c.rotation);Assert.AreEqual(d.origin,c.origin);
            Assert.AreSame(art,c.art);Assert.AreEqual(88,c.batteryWh);Assert.AreEqual(WeatherKind.Snow,c.weather);Assert.False(c.boids);Assert.True(c.groups[0].enabled);Assert.AreEqual(InfluenceKind.Braid,c.layers[2].kind);
        }
        [Test] public void ResetSingleLayerRestoresAllValuesWithoutTouchingOthers()
        {
            var c=new FleetConfig{pattern=MotionPattern.Orbit};var layer=c.layers[1];layer.kind=InfluenceKind.Riemann;layer.strength=23;layer.frequency=2;layer.phase=4;layer.blend=.3f;c.layers[2].kind=InfluenceKind.Wave;
            FleetDefaults.Layer(layer);var d=new InfluenceLayer();
            Assert.AreSame(layer,c.layers[1]);Assert.AreEqual(d.kind,layer.kind);Assert.AreEqual(d.strength,layer.strength);Assert.AreEqual(d.frequency,layer.frequency);Assert.AreEqual(d.phase,layer.phase);Assert.AreEqual(d.blend,layer.blend);
            Assert.AreEqual(InfluenceKind.Wave,c.layers[2].kind);Assert.AreEqual(MotionPattern.Orbit,c.pattern);
        }
        [Test] public void ResetOneSquadPreservesOtherSquadsAndGlobalFormation()
        {
            var c=new FleetConfig{formation=FormationKind.Helix};var g=c.groups[2];g.enabled=true;g.formation=FormationKind.Wedge;g.offset=new Vector3(20,30,40);c.groups[0].enabled=true;c.groups[0].offset=Vector3.one;
            FleetDefaults.Squad(g);var d=new GroupSettings();
            Assert.AreSame(g,c.groups[2]);Assert.AreEqual(d.enabled,g.enabled);Assert.AreEqual(d.formation,g.formation);Assert.AreEqual(d.offset,g.offset);
            Assert.True(c.groups[0].enabled);Assert.AreEqual(Vector3.one,c.groups[0].offset);Assert.AreEqual(FormationKind.Helix,c.formation);
        }
        [Test] public void ResetFlockingDoesNotDisableFieldsOrChangeFlight()
        {
            var c=new FleetConfig{boids=false,separation=0,alignment=4,cohesion=2,neighborRadius=25,speed=48};c.layers[0].kind=InfluenceKind.Vortex;
            FleetDefaults.Flocking(c);var d=new FleetConfig();
            Assert.AreEqual(d.boids,c.boids);Assert.AreEqual(d.separation,c.separation);Assert.AreEqual(d.alignment,c.alignment);Assert.AreEqual(d.cohesion,c.cohesion);Assert.AreEqual(d.neighborRadius,c.neighborRadius);
            Assert.AreEqual(48,c.speed);Assert.AreEqual(InfluenceKind.Vortex,c.layers[0].kind);
        }
        [Test] public void ResetEnvironmentPreservesPlanetEnergyAndChoreography()
        {
            var c=new FleetConfig{scenery=SceneryKind.City,sky=SkyKind.Night,weather=WeatherKind.Storm,wind=14,beaconSize=2,planet=PlanetKind.Mars,batteryWh=99,formation=FormationKind.Heart,bpm=160};
            FleetDefaults.Environment(c);var d=new FleetConfig();
            Assert.AreEqual(d.scenery,c.scenery);Assert.AreEqual(d.sky,c.sky);Assert.AreEqual(d.weather,c.weather);Assert.AreEqual(d.wind,c.wind);Assert.AreEqual(d.beaconSize,c.beaconSize);
            Assert.AreEqual(PlanetKind.Mars,c.planet);Assert.AreEqual(99,c.batteryWh);Assert.AreEqual(FormationKind.Heart,c.formation);Assert.AreEqual(160,c.bpm);
        }
        [Test] public void ResetFlightAndEnergyAreIndependent()
        {
            var c=new FleetConfig{planet=PlanetKind.Moon,arcadeLift=false,obstacles=false,speed=55,acceleration=60,material=2,batteryWh=100,batteryMass=1,cargoMass=2,flightWatts=700,electronicsWatts=30,drainScale=4,unlimited=true,height=80};
            FleetDefaults.Flight(c);var d=new FleetConfig();
            Assert.AreEqual(d.planet,c.planet);Assert.AreEqual(d.arcadeLift,c.arcadeLift);Assert.AreEqual(d.obstacles,c.obstacles);Assert.AreEqual(d.speed,c.speed);Assert.AreEqual(d.acceleration,c.acceleration);Assert.AreEqual(100,c.batteryWh);Assert.True(c.unlimited);
            c.speed=37;FleetDefaults.Energy(c);
            Assert.AreEqual(d.material,c.material);Assert.AreEqual(d.batteryWh,c.batteryWh);Assert.AreEqual(d.batteryMass,c.batteryMass);Assert.AreEqual(d.cargoMass,c.cargoMass);Assert.AreEqual(d.flightWatts,c.flightWatts);Assert.AreEqual(d.electronicsWatts,c.electronicsWatts);Assert.AreEqual(d.drainScale,c.drainScale);Assert.AreEqual(d.unlimited,c.unlimited);Assert.AreEqual(37,c.speed);Assert.AreEqual(80,c.height);
        }
        [Test] public void ResetAllLayersAndSquadsDoesNotReplaceConfigReferences()
        {
            var c=new FleetConfig();var layers=c.layers;var groups=c.groups;var layer=c.layers[0];var group=c.groups[0];
            foreach(var l in layers){l.kind=InfluenceKind.Spiral;l.phase=2;}foreach(var g in groups){g.enabled=true;g.offset=Vector3.one;}
            FleetDefaults.Layers(c);FleetDefaults.Squads(c);
            Assert.AreSame(layers,c.layers);Assert.AreSame(groups,c.groups);Assert.AreSame(layer,c.layers[0]);Assert.AreSame(group,c.groups[0]);
            foreach(var l in layers){Assert.AreEqual(InfluenceKind.None,l.kind);Assert.AreEqual(0,l.phase);}foreach(var g in groups){Assert.False(g.enabled);Assert.AreEqual(Vector3.zero,g.offset);}
        }
    }
}
