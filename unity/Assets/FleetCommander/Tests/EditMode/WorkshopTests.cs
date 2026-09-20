using System;
using FleetCommander.Core;
using FleetCommander.Games;
using FleetCommander.Labs;
using NUnit.Framework;
using UnityEngine;
namespace FleetCommander.Tests
{
    public sealed class WorkshopTests
    {
        [Test] public void FullAdderAllInputsMatchIntegerAddition(){var c=LogicCircuit.Example("Full adder");for(int i=0;i<8;i++){c.nodes[0].input=(i&1)!=0;c.nodes[1].input=(i&2)!=0;c.nodes[2].input=(i&4)!=0;var v=c.Evaluate();Assert.AreEqual((i&1)+((i>>1)&1)+((i>>2)&1),(v[4]?1:0)+(v[7]?2:0));}}
        [Test] public void MultiplexerSelectsOneInput(){var c=LogicCircuit.Example("Multiplexer");for(int i=0;i<8;i++){c.nodes[0].input=(i&1)!=0;c.nodes[1].input=(i&2)!=0;c.nodes[2].input=(i&4)!=0;Assert.AreEqual((i&4)==0?(i&1)!=0:(i&2)!=0,c.Evaluate()[6]);}}
        [Test] public void AlarmRequiresArmedAndOpening(){var c=LogicCircuit.Example("Alarm");c.nodes[0].input=true;Assert.IsFalse(c.Evaluate()[4]);c.nodes[2].input=true;Assert.IsTrue(c.Evaluate()[4]);c.nodes[0].input=false;Assert.IsFalse(c.Evaluate()[4]);}
        [Test] public void CircuitRejectsFeedbackAndKeepsStateAfterTruthTable(){var c=LogicCircuit.Example("Half adder");c.nodes[0].input=true;Assert.AreEqual(6,c.TruthTable().Split('\n').Length);Assert.IsTrue(c.nodes[0].input);Assert.IsFalse(c.nodes[1].input);c.nodes[2].a=3;Assert.Throws<ArgumentException>(()=>c.Evaluate());}
        [Test] public void BoardColorAndCoordinatesSurviveSerialization(){var b=new LightBoard();b.Set(0,0,5);b.Set(31,23,9);var loaded=JsonUtility.FromJson<LightBoard>(JsonUtility.ToJson(b));loaded.Validate();var p=loaded.Points();Assert.AreEqual(2,p.Length);Assert.AreEqual(new Vector3(-31,23,0),p[0].position);Assert.AreEqual(Color.white,p[1].color);loaded.Clear();Assert.AreEqual(0,loaded.Points().Length);}
        [Test] public void BoardRejectsInvalidData(){var b=new LightBoard{pegs=new int[3]};Assert.Throws<ArgumentException>(()=>b.Validate());}
        [Test] public void LorenzRK4ConvergesAndIsBounded(){var lab=new ScienceLab{view=ScienceView.LorenzAttractor};var p=new Vector3(1,2,3);Vector3 a=lab.LorenzStep(p,.01f),b=lab.LorenzStep(lab.LorenzStep(p,.005f),.005f);Assert.Less(Vector3.Distance(a,b),.0001f);foreach(var v in lab.Curve())Assert.IsTrue(FleetConfig.Finite(v)&&v.magnitude<100);}
        [Test] public void HarmonicCurveStartsAtMaximumDisplacement(){var lab=new ScienceLab{view=ScienceView.HarmonicOscillator,amplitude=12,frequency=2};var p=lab.Curve();Assert.AreEqual(new Vector3(12,0,0),p[0]);foreach(var v in p)Assert.That(v.x*v.x/144+v.y*v.y/576,Is.EqualTo(1).Within(.0001));}
        [Test] public void RangeScoresOnlyRayHitsOnce(){var g=new DroneRangeGame(new FleetConfig());var t=g.Targets[0];var origin=g.World.States[0].position;Assert.IsTrue(g.Fire(origin,t.position-origin));Assert.AreEqual(1,g.Hits);int score=g.Score;Assert.Greater(score,100);g.Fire(origin,t.position-origin);Assert.AreEqual(score,g.Score);Assert.AreEqual(1,g.Shots);}
        [Test] public void RangeAvoidTargetPenalizesInsteadOfScoring(){var g=new DroneRangeGame(new FleetConfig());g.Targets[0].avoid=true;g.Fire(g.World.States[0].position,g.Targets[0].position-g.World.States[0].position);Assert.AreEqual(1,g.Penalties);Assert.AreEqual(0,g.Hits);Assert.AreEqual(0,g.Score);}
        [Test] public void RangeClockEndsAndFreezesActions(){var g=new DroneRangeGame(new FleetConfig());for(int i=0;i<1801;i++)g.Tick(.05f);Assert.IsTrue(g.Finished);Assert.AreEqual(3,g.Stage);Assert.IsFalse(g.Fire(Vector3.zero,Vector3.forward));int misses=g.Misses;g.Tick(1);Assert.AreEqual(misses,g.Misses);}
        [Test] public void AllSceneryGroundHeightsAreFinite(){var c=new FleetConfig();foreach(SceneryKind kind in Enum.GetValues(typeof(SceneryKind))){c.scenery=kind;for(int i=-900;i<=900;i+=100)Assert.IsTrue(FleetConfig.Finite(new Vector3(0,SceneryTerrain.Height(c,i,i*.7f),0)));}}
    }
}
