using System;
using FleetCommander.Core;
using NUnit.Framework;
using UnityEngine;

namespace FleetCommander.Tests
{
    public sealed class BattleTests
    {
        static FleetWorld Arena(int count=2, WeaponKind weapon=WeaponKind.Pulse)
        {
            var world=new FleetWorld(new FleetConfig{boids=false,obstacles=false,wind=0,unlimited=true},count,
                new BattleSettings{blueFrame=FrameKind.Utility,redFrame=FrameKind.Utility,blueWeapon=weapon,redWeapon=WeaponKind.Pulse});
            world.Launch();
            for(int i=0;i<count;i++){world.States[i].position=new Vector3(i%2==0?-65:65,20,i*5);world.States[i].cooldown=10;}
            return world;
        }
        static void ReadyShot(FleetWorld world)
        {
            world.States[0].position=new Vector3(0,20,0);world.States[0].cooldown=0;
            world.States[1].position=new Vector3(0,20,10);
            Assert.True(world.SetControlledDrone(0));world.SetPilotInput(Vector3.zero,Vector3.forward,false);
        }
        [Test] public void LethalDamageCreditsOneKillAndOneRoundOnly()
        {
            var w=Arena();w.ApplyDamage(1,500,0,WeaponKind.Pulse);w.ApplyDamage(1,500,0);
            Assert.AreEqual(1,w.BlueKills);Assert.AreEqual(1,w.States[0].kills);Assert.AreEqual(100,w.BlueDamage);
            Assert.AreEqual(FlightPhase.Falling,w.States[1].phase);
            w.Step(.05f);Assert.AreEqual(0,w.Winner);Assert.AreEqual(1,w.Battle.blueWins);
            float survivor=w.States[0].health;w.ApplyDamage(0,500,1);Assert.AreEqual(survivor,w.States[0].health);
            Assert.False(w.DropPayload(0));Assert.False(w.SetControlledDrone(0));
            for(int i=0;i<100;i++)w.Step(.05f);
            Assert.AreEqual(1,w.Battle.blueWins);Assert.AreEqual(FlightPhase.Wreck,w.States[1].phase);Assert.Greater(w.States[1].destructionAge,0);
        }
        [Test] public void SimultaneousEliminationIsDrawAndSessionSurvivesRematch()
        {
            var w=Arena();w.ApplyDamage(0,500,1);w.ApplyDamage(1,500,0);w.Step(.05f);
            Assert.AreEqual(2,w.Winner);Assert.AreEqual(1,w.Battle.draws);
            var rematch=new FleetWorld(new FleetConfig(),2,w.Battle);rematch.Launch();
            Assert.AreEqual(1,rematch.Battle.draws);Assert.AreEqual(-1,rematch.Winner);Assert.AreEqual(0,rematch.BlueKills);
            rematch.Battle.ResetDefaults();Assert.AreEqual(1,rematch.Battle.draws);rematch.Battle.ResetScores();Assert.AreEqual(0,rematch.Battle.draws);
        }
        [Test] public void TimeLimitResolvesBySurvivorsThenHealthThenDraw()
        {
            var draw=Arena();draw.Battle.roundSeconds=5;draw.RestoreRound(new BattleRoundSnapshot{started=true,elapsed=4.99f});draw.Step(.05f);Assert.AreEqual(2,draw.Winner);
            var health=Arena();health.Battle.roundSeconds=5;health.ApplyDamage(1,20,0);
            var healthRound=health.CaptureRound();healthRound.elapsed=4.99f;health.RestoreRound(healthRound);health.Step(.05f);Assert.AreEqual(0,health.Winner);
            var survivors=Arena(4);survivors.Battle.roundSeconds=5;survivors.ApplyDamage(3,500,0);survivors.ApplyDamage(0,100,1);
            var survivorRound=survivors.CaptureRound();survivorRound.elapsed=4.99f;survivors.RestoreRound(survivorRound);survivors.Step(.05f);Assert.AreEqual(0,survivors.Winner);
        }
        [Test] public void PausedEngagementDoesNotConsumeRoundClockOrFire()
        {
            var w=Arena();ReadyShot(w);w.Battle.engage=false;w.SetPilotInput(Vector3.zero,Vector3.forward,true);
            w.Step(.05f);Assert.AreEqual(0,w.RoundTime);Assert.AreEqual(100,w.States[1].health);Assert.False(w.FireControlled());
        }
        [Test] public void CompletedRoundRestoreDoesNotAwardAnotherWin()
        {
            var w=Arena();w.ApplyDamage(1,500,0);w.Step(.05f);
            var restored=new FleetWorld(w.Config,2,w.Battle.Clone());restored.Restore((DroneState[])w.States.Clone(),w.Time);restored.RestoreRound(w.CaptureRound());
            restored.Step(.05f);Assert.AreEqual(0,restored.Winner);Assert.AreEqual(1,restored.Battle.blueWins);Assert.AreEqual(1,restored.BlueKills);
        }
        [Test] public void ManualAimCanMissAndRespectsCooldown()
        {
            var w=Arena();ReadyShot(w);w.SetPilotInput(Vector3.zero,-Vector3.forward,false);Assert.True(w.FireControlled());
            Assert.AreEqual(100,w.States[1].health);Assert.AreEqual(-1,w.Events[w.Events.Count-1].victim);Assert.False(w.FireControlled());
            w.States[0].cooldown=0;w.SetPilotInput(Vector3.zero,Vector3.forward,false);Assert.True(w.FireControlled());Assert.Less(w.States[1].health,100);
        }
        [Test] public void RapidFireTradesDamageForShorterCooldown()
        {
            var pulse=Arena();ReadyShot(pulse);pulse.FireControlled();
            var rapid=Arena(2,WeaponKind.RapidFire);ReadyShot(rapid);rapid.FireControlled();
            Assert.Less(rapid.States[0].cooldown,pulse.States[0].cooldown);Assert.Greater(rapid.States[1].health,pulse.States[1].health);
        }
        [Test] public void ScatterHitsMultipleEnemiesAndShockwaveReachesBehind()
        {
            var scatter=Arena(6,WeaponKind.Scatter);ReadyShot(scatter);
            scatter.States[3].position=new Vector3(3,20,10);scatter.States[5].position=new Vector3(-3,20,10);scatter.FireControlled();
            Assert.Less(scatter.States[1].health,100);Assert.Less(scatter.States[3].health,100);Assert.Less(scatter.States[5].health,100);
            Assert.AreEqual(100,scatter.States[2].health);
            var shock=Arena(2,WeaponKind.Shockwave);ReadyShot(shock);shock.States[1].position=new Vector3(0,20,-10);shock.FireControlled();Assert.Less(shock.States[1].health,100);
        }
        [Test] public void ManualFireKillKeepsPilotKillCredit()
        {
            var w=Arena();ReadyShot(w);w.States[1].health=1;w.FireControlled();Assert.AreEqual(1,w.States[0].kills);Assert.AreEqual(1,w.BlueKills);
        }
        [Test] public void ManualMovementConsumesBatteryAndNeverAutoFires()
        {
            var w=Arena();ReadyShot(w);w.Config.unlimited=false;w.SetPilotInput(new Vector3(1,0,0),Vector3.forward,false);
            for(int i=0;i<10;i++)w.Step(.05f);
            Assert.Greater(w.States[0].position.x,0);Assert.Less(w.States[0].battery01,1);Assert.AreEqual(100,w.States[1].health);
            w.ClearControl();Assert.AreEqual(-1,w.ControlledDrone);
        }
        [Test] public void PilotRelinquishesControlWhenReturningOrDestroyed()
        {
            var w=Arena();ReadyShot(w);w.Config.unlimited=false;w.States[0].battery01=.01f;w.Step(.05f);
            Assert.AreEqual(-1,w.ControlledDrone);Assert.AreEqual(FlightPhase.Returning,w.States[0].phase);
            var killed=Arena();ReadyShot(killed);killed.ApplyDamage(0,500,1);Assert.AreEqual(-1,killed.ControlledDrone);
        }
        [Test] public void FramesAndSkinsAreAppliedAndArmorReducesDamage()
        {
            var settings=new BattleSettings{blueFrame=FrameKind.Cargo,redFrame=FrameKind.Scout,blueSkin=SkinKind.Industrial,redSkin=SkinKind.Arctic,blueWeapon=WeaponKind.Shockwave};
            var w=new FleetWorld(new FleetConfig(),2,settings);Assert.AreEqual(FrameKind.Cargo,w.States[0].frame);Assert.AreEqual(SkinKind.Arctic,w.States[1].skin);Assert.AreEqual(WeaponKind.Shockwave,w.States[0].weapon);
            w.ApplyDamage(0,20);w.ApplyDamage(1,20);Assert.Greater(w.States[0].health,w.States[1].health);
            Assert.Less(DroneCatalog.Profile(FrameKind.Cargo).speed,DroneCatalog.Profile(FrameKind.Scout).speed);
        }
        [Test] public void InvalidLoadoutsAndRoundSnapshotsAreRejected()
        {
            Assert.Throws<ArgumentException>(()=>new FleetWorld(new FleetConfig(),2,new BattleSettings{blueWeapon=(WeaponKind)99}));
            var w=Arena();Assert.Throws<ArgumentException>(()=>w.RestoreRound(new BattleRoundSnapshot{elapsed=float.NaN}));
            var roster=(DroneState[])w.States.Clone();roster[0].skin=(SkinKind)99;Assert.Throws<ArgumentException>(()=>w.Restore(roster,0));
            Assert.False(w.SetControlledDrone(-1));Assert.False(w.SetControlledDrone(100));
        }
        [Test] public void EmptyArenaDoesNotAwardFreeWins()
        {
            var w=new FleetWorld(new FleetConfig(),0,new BattleSettings());w.Launch();w.Step(.05f);Assert.False(w.RoundStarted);Assert.AreEqual(-1,w.Winner);Assert.AreEqual(0,w.Battle.draws);
        }
    }
}
