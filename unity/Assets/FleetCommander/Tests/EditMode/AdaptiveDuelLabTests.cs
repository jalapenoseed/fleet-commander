using FleetCommander.Core;
using NUnit.Framework;
using UnityEngine;

namespace FleetCommander.Tests
{
    public sealed class AdaptiveDuelLabTests
    {
        [Test] public void SensorFusionBuildsTrackAndPredictsForward()
        {
            var settings=new AdaptiveLabSettings
            {
                enabled=true,
                blueSensors=SensorKind.Camera|SensorKind.Yolo|SensorKind.Range|SensorKind.Imu,
                yoloConfidence=1,
                cameraNoise=.05f,
                rangeNoise=.02f,
                processNoise=.05f
            };
            var lab=new AdaptiveDuelLab();lab.Reset(settings,1337);
            var observer=DroneState.Create(0,0,Vector3.zero);observer.phase=FlightPhase.Flying;
            var target=DroneState.Create(1,1,new Vector3(0,10,20));target.phase=FlightPhase.Flying;target.velocity=new Vector3(4,0,0);
            float t=0;
            for(int i=0;i<30;i++)
            {
                t+=.05f;target.position+=target.velocity*.05f;
                lab.Observe(observer,target,t,.05f);
            }
            Assert.True(lab.TryGetTrack(observer.id,target.id,out var track));
            Assert.Less(track.Uncertainty,2);
            Assert.Greater(lab.AimPoint(observer,target,t).x,track.position.x);
        }

        [Test] public void TeamSensorSuitesAndEffectorsStayIndependent()
        {
            var settings=new AdaptiveLabSettings
            {
                blueSensors=SensorKind.Camera|SensorKind.Yolo|SensorKind.Thermal,
                redSensors=SensorKind.Camera|SensorKind.Range|SensorKind.RF,
                blueEffector=ToyEffectorKind.Net,
                redEffector=ToyEffectorKind.Water
            };
            var lab=new AdaptiveDuelLab();lab.Reset(settings);
            Assert.True((lab.SensorsFor(0)&SensorKind.Yolo)!=0);
            Assert.True((lab.SensorsFor(1)&SensorKind.RF)!=0);
            Assert.AreEqual(ToyEffectorKind.Net,lab.EffectorFor(0));
            Assert.AreEqual(ToyEffectorKind.Water,lab.EffectorFor(1));
        }

        [Test] public void BattleSettingsCloneDeepCopiesAdaptiveLab()
        {
            var source=new BattleSettings();
            source.lab.activity=AdaptiveActivity.Soccer;
            source.lab.blueSensors|=SensorKind.Thermal;
            var clone=source.Clone();
            clone.lab.activity=AdaptiveActivity.Football;
            clone.lab.blueSensors&=~SensorKind.Thermal;
            Assert.AreEqual(AdaptiveActivity.Soccer,source.lab.activity);
            Assert.True((source.lab.blueSensors&SensorKind.Thermal)!=0);
        }

        [Test] public void ArenaAdaptiveLoopRecordsTrainingSamples()
        {
            var settings=new BattleSettings();
            settings.lab.enabled=true;
            settings.lab.yoloConfidence=1;
            settings.lab.cameraNoise=.05f;
            settings.lab.rangeNoise=.02f;
            settings.blueWeapon=WeaponKind.Pulse;
            settings.redWeapon=WeaponKind.Pulse;
            var world=new FleetWorld(new FleetConfig{boids=false,obstacles=false,unlimited=true,wind=0},2,settings);
            world.Launch();
            world.States[0].position=new Vector3(-8,20,0);
            world.States[1].position=new Vector3(8,20,0);
            for(int i=0;i<120;i++)world.Step(1f/60f);
            Assert.Greater(world.AdaptiveLab.Samples.Count,0);
        }
    }
}
