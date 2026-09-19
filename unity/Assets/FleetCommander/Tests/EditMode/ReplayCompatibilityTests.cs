using System.Text.RegularExpressions;
using FleetCommander.Core;
using FleetCommander.Systems;
using NUnit.Framework;
using UnityEngine;

namespace FleetCommander.Tests
{
    public sealed class ReplayCompatibilityTests
    {
        [Test] public void LastReplayFrameIncludesFinalDeathResultAndEnvironment()
        {
            var world=new FleetWorld(new FleetConfig{boids=false,wind=0},2,new BattleSettings());
            world.Launch();var replay=new ReplayBuffer();replay.Record(world,.1f);
            world.ApplyDamage(1,500,0);world.Config.sky=SkyKind.Night;world.Step(.05f);replay.Record(world,.1f);
            Assert.AreEqual(-1,replay.Frames[0].battle.winner);
            Assert.AreEqual(0,replay.Frames[0].battle.blueWins);
            Assert.True(replay.Play());replay.Seek(1);
            Assert.AreEqual(0,replay.Display[1].health);
            Assert.AreEqual(0,replay.DisplayBattle.winner);
            Assert.AreEqual(1,replay.DisplayBattle.blueWins);
            Assert.AreEqual(SkyKind.Night,replay.DisplayConfig.sky);
        }
        [Test] public void LegacyFleetWithoutNewAppearanceFieldsStillLoads()
        {
            var world=new FleetWorld(new FleetConfig(),1);
            string json=JsonUtility.ToJson(FleetStorage.Capture(world,"Legacy",""));
            json=Regex.Replace(json,",\"(?:skin|weapon|kills|destructionAge)\":0(?:\\.0)?","");
            Assert.False(json.Contains("\"skin\""));Assert.False(json.Contains("\"weapon\""));
            var restored=FleetStorage.Parse(json);
            Assert.AreEqual(SkinKind.Graphite,restored.drones[0].skin);
            Assert.AreEqual(WeaponKind.Pulse,restored.drones[0].weapon);
            Assert.AreEqual(0,restored.drones[0].destructionAge);
        }
        [Test] public void NewFleetAppearanceAndWeaponRoundTrip()
        {
            var world=new FleetWorld(new FleetConfig(),4);
            world.States[2].skin=SkinKind.Industrial;world.States[2].weapon=WeaponKind.Scatter;
            var restored=FleetStorage.Parse(FleetStorage.ToJson(FleetStorage.Capture(world,"Loadout","")));
            Assert.AreEqual(SkinKind.Industrial,restored.drones[2].skin);
            Assert.AreEqual(WeaponKind.Scatter,restored.drones[2].weapon);
            Assert.AreEqual(world.States[2].frame,restored.drones[2].frame);
        }
    }
}
