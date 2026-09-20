using FleetCommander.Core;
using FleetCommander.Games;
using FleetCommander.Rendering;
using FleetCommander.Systems;
using NUnit.Framework;
using UnityEngine;
namespace FleetCommander.Tests
{
    public sealed class CombatWorkshopTests
    {
        static FleetWorld World(){var w=new FleetWorld(new FleetConfig{boids=false,obstacles=false,wind=0,unlimited=true},2,new BattleSettings{adaptive=false});w.Launch();w.States[0].position=new Vector3(0,20,0);w.States[1].position=new Vector3(0,20,10);w.States[1].cooldown=10;w.SetControlledDrone(0);w.SetPilotInput(Vector3.zero,Vector3.forward,false);return w;}
        [Test] public void AmmunitionIsFiniteAndDoesNotFireEmpty(){var w=World();w.States[0].ammo=1;w.States[0].reserveAmmo=0;Assert.True(w.FireControlled());Assert.AreEqual(0,w.States[0].ammo);w.States[0].cooldown=0;Assert.False(w.FireControlled());}
        [Test] public void ReloadTransfersOnlyRemainingReserve(){var w=World();w.States[0].ammo=0;w.States[0].reserveAmmo=3;w.Battle.engage=false;Assert.True(w.Reload(0));for(int k=0;k<150;k++)w.Step(.02f);Assert.AreEqual(3,w.States[0].ammo);Assert.AreEqual(0,w.States[0].reserveAmmo);}
        [Test] public void HeatLocksFiringAndCools(){var w=World();w.States[0].heat=1;Assert.False(w.FireControlled());w.Battle.engage=false;w.Step(.05f);Assert.Less(w.States[0].heat,1);}
        [Test] public void TraceRejectsConeNearMissAndTargetsBehind(){Assert.True(FleetWorld.TraceSphere(Vector3.zero,Vector3.forward,new Vector3(0,0,20),1,40));Assert.False(FleetWorld.TraceSphere(Vector3.zero,Vector3.forward,new Vector3(2,0,20),1,40));Assert.False(FleetWorld.TraceSphere(Vector3.zero,Vector3.forward,Vector3.back*2,1,40));}
        [Test] public void FrontParryStopsHitAndStunsSource(){var w=World();w.States[1].rotation=Quaternion.LookRotation(Vector3.back);Assert.True(w.UseAbility(1,DroneAbility.Guard,Vector3.back));w.ApplyDamage(1,20,0);Assert.AreEqual(100,w.States[1].health);Assert.Greater(w.States[0].stunTime,0);}
        [Test] public void GuardHasDirectionalCoverage(){var w=World();w.States[1].rotation=Quaternion.identity;w.UseAbility(1,DroneAbility.Guard,Vector3.forward);w.ApplyDamage(1,20,0);Assert.Less(w.States[1].health,100);}
        [Test] public void GuardAfterParryWindowReducesDamage(){var w=World();w.States[1].rotation=Quaternion.LookRotation(Vector3.back);w.UseAbility(1,DroneAbility.Guard,Vector3.back);w.States[1].guardAge=.5f;w.ApplyDamage(1,20,0);Assert.Greater(w.States[1].health,90);Assert.Less(w.States[1].health,100);}
        [Test] public void AbilityUsesEnergyAndCooldown(){var w=World();Assert.True(w.UseAbility(0,DroneAbility.Dodge,Vector3.right));Assert.AreEqual(75,w.States[0].stamina);Assert.Greater(w.States[0].velocity.x,0);Assert.False(w.UseAbility(0,DroneAbility.Dodge,Vector3.right));}
        [Test] public void ManualTargetCannotBeOwnTeam(){var w=World();Assert.False(w.TrackTarget(0,0));Assert.True(w.TrackTarget(0,1));Assert.AreEqual(1,w.ManualTargets[0]);Assert.True(w.TrackTarget(0,-1));}
        [Test] public void AllTwentyFormationsAreFinite(){Assert.AreEqual(20,System.Enum.GetValues(typeof(ArenaFormation)).Length);var p=new ArenaTeamPlan();foreach(ArenaFormation f in System.Enum.GetValues(typeof(ArenaFormation)))for(int i=0;i<64;i++)Assert.True(FleetConfig.Finite(p.Slot(i,64,f)));}
        [Test] public void ManualFormationRemainsChosen(){var w=World();w.Battle.bluePlan.automatic=false;w.Battle.bluePlan.formation=ArenaFormation.Helix;w.Step(.05f);Assert.AreEqual(ArenaFormation.Helix,w.CurrentFormations[0]);}
        [Test] public void AutomaticFormationsChangeAfterOpening(){var w=World();w.Battle.engage=false;w.Battle.bluePlan.switchSeconds=2;w.RestoreRound(new BattleRoundSnapshot{started=true,elapsed=8});for(int i=0;i<50;i++)w.Step(.05f);Assert.Greater(w.FormationSwitches[0],0);}
        [Test] public void LearningRecordsCompletedOutcomesAndExplores(){var l=new TacticsLearning();var w=World();w.Battle.adaptive=true;w.Battle.lab.learn=true;l.Bind(w,0);int first=w.LearnedOpening[0];w.ApplyDamage(1,500,0);w.Step(.05f);l.Finish(w);Assert.AreEqual(1,l.completed);Assert.AreEqual(1,l.trials[first]);Assert.AreNotEqual(first,l.Choose(0,0));}
        [Test] public void TenWeaponProfilesHaveResourcesAndDistinctCadence(){Assert.AreEqual(10,System.Enum.GetValues(typeof(WeaponKind)).Length);foreach(WeaponKind k in System.Enum.GetValues(typeof(WeaponKind))){var p=DroneCatalog.Weapon(k);Assert.Greater(p.magazine,0);Assert.Greater(p.energy,0);Assert.Greater(p.reload,0);}Assert.Greater(DroneCatalog.Weapon(WeaponKind.PrecisionBeam).range,DroneCatalog.Weapon(WeaponKind.Pulse).range);}
        [Test] public void ProminentDronesKeepApprovedFullGeometry(){Assert.AreEqual(0,DroneRenderer.DetailLevel(15,1,false));Assert.AreEqual(0,DroneRenderer.DetailLevel(5,1,true));Assert.AreEqual(1,DroneRenderer.DetailLevel(8,1,false));Assert.AreEqual(2,DroneRenderer.DetailLevel(1,1,false));}
        [Test] public void AuthoredArchitectureRetainsTextureBindings(){var model=Resources.Load<GameObject>("ScenePacks/GR05_03_TexasHouse");Assert.NotNull(model);int mapped=0;foreach(var r in model.GetComponentsInChildren<MeshRenderer>())if(r.sharedMaterial.mainTexture)mapped++;Assert.GreaterOrEqual(mapped,12,"Architecture albedo textures must resolve after a clean import.");}
        [Test] public void ClickPickingFindsNearestDroneUnderCursor(){var go=new GameObject("Pick test camera");try{var camera=go.AddComponent<Camera>();camera.pixelRect=new Rect(0,0,1600,900);var a=DroneState.Create(0,0,new Vector3(0,0,10));var b=DroneState.Create(1,1,new Vector3(0,0,20));Assert.AreEqual(0,DroneSelection.Pick(camera,new[]{a,b},(Vector2)camera.WorldToScreenPoint(a.position)));Assert.AreEqual(-1,DroneSelection.Pick(camera,new[]{a,b},new Vector2(-1000,-1000)));}finally{Object.DestroyImmediate(go);}}
    }
}
