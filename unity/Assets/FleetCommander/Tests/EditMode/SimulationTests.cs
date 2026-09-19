using System;
using FleetCommander.Core;
using FleetCommander.Systems;
using NUnit.Framework;
using UnityEngine;
namespace FleetCommander.Tests
{
    public sealed class SimulationTests
    {
        [TestCase(0)][TestCase(1)][TestCase(2)][TestCase(3)][TestCase(4)][TestCase(5)][TestCase(6)]
        [TestCase(7)][TestCase(8)][TestCase(9)][TestCase(10)][TestCase(11)][TestCase(12)][TestCase(13)]
        public void FormationTargetsAreFiniteAndBounded(int kind)
        {
            var c=new FleetConfig{formation=(FormationKind)kind};c.art=ArtStudio.Text("HELLO");
            foreach(int n in new[]{0,1,256,2000,10000})for(int i=0;i<Mathf.Max(1,n);i+=Mathf.Max(1,n/23))
            {var p=FormationMath.Target(c,i,n,7,i%4);Assert.True(FleetConfig.Finite(p));Assert.That(p.y,Is.InRange(3,310));Assert.That(Mathf.Abs(p.x),Is.LessThanOrEqualTo(950));}
        }
        [TestCase(0)][TestCase(1)][TestCase(2)][TestCase(3)][TestCase(4)][TestCase(5)]
        [TestCase(6)][TestCase(7)][TestCase(8)][TestCase(9)][TestCase(10)]
        public void InfluenceLayersStayFiniteAndReset(int kind)
        {
            var c=new FleetConfig();c.layers[3].kind=(InfluenceKind)kind;c.pattern=MotionPattern.Orbit;
            Assert.True(FleetConfig.Finite(FormationMath.Target(c,3,20,100,3)));c.ResetInfluences();
            Assert.AreEqual(MotionPattern.None,c.pattern);foreach(var l in c.layers)Assert.AreEqual(InfluenceKind.None,l.kind);
        }
        [Test] public void ZeroFleetCanLaunchLandAndStep(){var w=new FleetWorld(new FleetConfig(),0);w.Launch();w.Step(.016f);w.Recall();Assert.AreEqual(0,w.Count);}
        [Test] public void SimulationIsRepeatable()
        {
            var a=new FleetWorld(new FleetConfig(),40);var b=new FleetWorld(new FleetConfig(),40);a.Launch();b.Launch();
            for(int i=0;i<120;i++){a.Step(1f/60);b.Step(1f/60);}for(int i=0;i<a.Count;i++)Assert.AreEqual(a.States[i].position,b.States[i].position);
        }
        [Test] public void LargeFleetUsesBoundedNeighborWork()
        {
            var w=new FleetWorld(new FleetConfig(),10000);w.Launch();w.Step(1f/60);Assert.AreEqual(10000,w.Count);Assert.LessOrEqual(w.Neighbors.LastChecks,10000*64);
            foreach(var s in w.States)Assert.True(FleetConfig.Finite(s.position));
        }
        [Test] public void RecallActuallyReturnsToPads()
        {
            var w=new FleetWorld(new FleetConfig{boids=false,wind=0,height=12},12);w.Launch();for(int i=0;i<600;i++)w.Step(1f/60);w.Recall();
            for(int i=0;i<3600;i++)w.Step(1f/60);foreach(var s in w.States){Assert.AreEqual(FlightPhase.Grounded,s.phase);Assert.Less(Vector3.Distance(s.position,s.home),.3f);}
        }
        [Test] public void BatteryUsesWattsAndWattHours()
        {
            var c=new FleetConfig{flightWatts=140,electronicsWatts=8,drainScale=1};Assert.That(PlanetModel.Power(c,0),Is.EqualTo(148).Within(.001f));
            Assert.That(PlanetModel.EnduranceMinutes(c),Is.EqualTo(45f/148*60).Within(.001f));
            float baseline=PlanetModel.Power(c,0);c.cargoMass=1;Assert.Greater(PlanetModel.Power(c,0),baseline);
        }
        [Test] public void ExhaustedAircraftDescendAndRechargeOnlyOnPads()
        {
            var w=new FleetWorld(new FleetConfig(),1);w.Launch();w.States[0].position=new Vector3(20,20,20);w.SetCharge(0);w.Step(.05f);Assert.AreEqual(FlightPhase.Falling,w.States[0].phase);
            for(int i=0;i<200;i++)w.Step(.05f);Assert.AreEqual(FlightPhase.Grounded,w.States[0].phase);Assert.AreEqual(0,w.States[0].battery01);
            w.Recharge();Assert.AreEqual(1,w.States[0].battery01);w.Launch();Assert.AreEqual(FlightPhase.Flying,w.States[0].phase);
        }
        [TestCase(PlanetKind.Moon)][TestCase(PlanetKind.Mars)] public void ConstrainedRotorsFallInOtherWorlds(PlanetKind planet)
        {
            var c=new FleetConfig{planet=planet,arcadeLift=false};Assert.False(PlanetModel.CanFly(c));var w=new FleetWorld(c,1);w.Launch();w.States[0].position=Vector3.up*20;w.Step(.05f);Assert.Less(w.States[0].velocity.y,0);
            c.arcadeLift=true;Assert.True(PlanetModel.CanFly(c));
        }
        [Test] public void CombatIsCappedAndLethalDamageMakesWrecks()
        {
            var w=new FleetWorld(new FleetConfig(),10000,new BattleSettings());Assert.AreEqual(256,w.Count);w.Launch();w.ApplyDamage(0,200);Assert.True(w.States[0].disabled);
            for(int i=0;i<20;i++)w.Step(.05f);Assert.AreEqual(FlightPhase.Wreck,w.States[0].phase);w.Launch();Assert.AreEqual(FlightPhase.Wreck,w.States[0].phase);
        }
        [Test] public void CombatProducesEventsAndKeepsTeamsIndependent()
        {
            var w=new FleetWorld(new FleetConfig{wind=0},8,new BattleSettings());w.Launch();int attacks=0;
            for(int i=0;i<1200;i++){w.Step(1f/60);attacks+=w.Events.Count;}Assert.Greater(attacks,0);Assert.AreEqual(0,w.States[0].fleetId);Assert.AreEqual(1,w.States[1].fleetId);
        }
        [Test] public void PayloadIsLimitedToArenaAndFiniteAmmo()
        {
            var show=new FleetWorld(new FleetConfig(),2);show.Launch();Assert.False(show.DropPayload(0));
            var w=new FleetWorld(new FleetConfig(),2,new BattleSettings());w.Launch();Assert.True(w.DropPayload(0));Assert.True(w.DropPayload(0));Assert.True(w.DropPayload(0));Assert.False(w.DropPayload(0));
        }
        [Test] public void ReplayCopiesStateAndDoesNotAlterLiveFleet()
        {
            var w=new FleetWorld(new FleetConfig(),5);var replay=new ReplayBuffer();w.Launch();
            for(int i=0;i<240;i++){w.Step(1f/60);replay.Record(w,1f/60);}Vector3 live=w.States[0].position;
            Assert.True(replay.Play());replay.Seek(.5f);replay.Display[0].position=Vector3.one*999;Assert.AreEqual(live,w.States[0].position);
            replay.Seek(.1f);Assert.AreNotEqual(Vector3.one*999,replay.Display[0].position);replay.Stop();Assert.False(replay.Playing);
        }
        [Test] public void ReplayCapacityAndLargeFleetLimitAreEnforced()
        {
            var w=new FleetWorld(new FleetConfig(),2);var r=new ReplayBuffer();for(int i=0;i<500;i++){w.Step(.05f);r.Record(w,.1f);}Assert.AreEqual(180,r.Frames.Count);
            r.Clear();w.Resize(2001);r.Record(w,1);Assert.AreEqual(0,r.Frames.Count);
        }
        [Test] public void SaveRoundTripPreservesStateAndFields()
        {
            var w=new FleetWorld(new FleetConfig(),30);w.Config.layers[2].kind=InfluenceKind.Riemann;w.Config.groups[1].enabled=true;w.Config.art=ArtStudio.Text("HI");w.Launch();w.Step(.05f);
            var save=FleetStorage.Parse(FleetStorage.ToJson(FleetStorage.Capture(w,"Test","formation ring")));
            Assert.AreEqual(w.States[5].position,save.drones[5].position);Assert.AreEqual(InfluenceKind.Riemann,save.config.layers[2].kind);Assert.True(save.config.groups[1].enabled);Assert.AreEqual(w.Config.art.Length,save.config.art.Length);
        }
        [Test] public void InvalidSavesAreRejectedBeforeMutation()
        {
            Assert.Throws<ArgumentException>(()=>FleetStorage.Parse("{}"));var w=new FleetWorld(new FleetConfig(),1);var s=FleetStorage.Capture(w,"Test","");s.config.height=float.NaN;Assert.Throws<ArgumentException>(()=>FleetStorage.Validate(s));
        }
        [Test] public void BrowserFleetMigratesTeamsAndSettings()
        {
            const string json="{\"kind\":\"fleet-commander-fleet\",\"version\":1,\"name\":\"Browser\",\"roster\":[{\"id\":\"drone-001\",\"name\":\"ONE\",\"type\":\"cargo\",\"color\":\"red\",\"team\":\"bravo\"}],\"program\":{\"settings\":{\"shape\":\"heart\",\"height\":42,\"spacing\":4,\"scale\":1},\"source\":\"formation heart\"},\"options\":{\"unlimited\":true,\"obstacles\":true,\"batteryDrain\":1}}";
            var s=FleetStorage.Parse(json);Assert.AreEqual(FormationKind.Heart,s.config.formation);Assert.AreEqual(1,s.drones[0].fleetId);Assert.AreEqual(FrameKind.Cargo,s.drones[0].frame);Assert.AreEqual(42,s.config.height);
        }
        [Test] public void ProgramsValidateBeforeRunningAndHonorWaitAndReset()
        {
            var w=new FleetWorld(new FleetConfig(),4);var p=new CueProgram();p.Compile("formation heart\nlayer 2 vortex 10 1\nwait 1\nreset\nformation grid\nrepeat 2");p.Start();p.Step(.1f,w);Assert.AreEqual(FormationKind.Heart,w.Config.formation);Assert.AreEqual(InfluenceKind.Vortex,w.Config.layers[1].kind);
            p.Step(1,w);Assert.AreEqual(FormationKind.Grid,w.Config.formation);Assert.AreEqual(InfluenceKind.None,w.Config.layers[1].kind);
            Assert.Throws<ArgumentException>(()=>p.Compile("formation ring\neval exploit"));Assert.False(p.Running);
        }
        [Test] public void ProgramGroupsStayIndependent()
        {
            var w=new FleetWorld(new FleetConfig(),8);var p=new CueProgram();p.Compile("select alpha\nformation heart\nselect bravo\nformation sphere");p.Start();p.Step(.1f,w);Assert.AreEqual(FormationKind.Heart,w.Config.groups[0].formation);Assert.AreEqual(FormationKind.Sphere,w.Config.groups[1].formation);
        }
        [Test] public void TextAndSymbolsGenerateColoredTargets()
        {
            foreach(string text in new[]{"ABCDEFGHIJKLMNOPQRSTUVWXYZ","0123456789!?- .","❤️","⭐","🙂","🤖"}){var points=ArtStudio.Text(text);Assert.Greater(points.Length,0);Assert.LessOrEqual(points.Length,4096);foreach(var p in points)Assert.True(FleetConfig.Finite(p.position));}
            Assert.Throws<ArgumentException>(()=>ArtStudio.Text(""));
        }
    }
}
